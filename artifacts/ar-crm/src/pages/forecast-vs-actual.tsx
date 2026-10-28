import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { getAuditName } from "@/lib/audit";

const HISTORY_WEEKS = 12;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function toISO(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fromISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}
function rangeLabel(start: Date): string {
  const e = addDays(start, 6);
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}
function fmtCur(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function ForecastVsActual() {
  const qc = useQueryClient();
  const { data: invoices } = useAllInvoices();
  const { data: payments } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: snaps } = useQuery({
    queryKey: ["forecast-snapshots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("forecast_snapshots").select("*").order("week_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const triedAuto = useRef(false);

  const thisWeek = weekStart(new Date());
  const thisISO = toISO(thisWeek);
  const snapList = Array.isArray(snaps) ? snaps : [];
  const payList = Array.isArray(payments) ? payments : [];
  const currentSnap = snapList.find((s: any) => s.week_start === thisISO);

  // Forecast for the current week, reconstructed as at the start of the week
  function computeForecast() {
    const startMs = thisWeek.getTime();
    const endMs = addDays(thisWeek, 7).getTime();
    const paidThisWeek = new Map<string, number>();
    payList.forEach((p: any) => {
      if (!p.payment_date) return;
      const t = fromISO(p.payment_date).getTime();
      if (t >= startMs && t < endMs) {
        const k = String(p.invoice_id || p.invoice_number);
        paidThisWeek.set(k, (paidThisWeek.get(k) || 0) + Number(p.amount || 0));
      }
    });
    let total = 0;
    let count = 0;
    (Array.isArray(invoices) ? invoices : []).forEach((inv: any) => {
      const iso = inv.expectedPaymentDate;
      if (!iso) return;
      const t = fromISO(iso).getTime();
      if (isNaN(t) || t < startMs || t >= endMs) return;
      const back = (paidThisWeek.get(String(inv.id)) || 0) + (paidThisWeek.get(String(inv.invoiceNumber)) || 0);
      const open = Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0) + back;
      if (open > 0.01) { total += open; count += 1; }
    });
    return { total, count };
  }

  async function lock(overwrite: boolean, method: "auto" | "manual") {
    setBusy(true);
    setMsg(null);
    try {
      const { total, count } = computeForecast();
      const row = {
        week_start: thisISO,
        forecast_amount: Math.round(total * 100) / 100,
        invoice_count: count,
        method,
        taken_by: getAuditName() || null,
        taken_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("forecast_snapshots").upsert(row, { onConflict: "week_start", ignoreDuplicates: !overwrite });
      if (error) { setMsg("Snapshot failed: " + error.message); return; }
      if (method === "manual") setMsg("This week's forecast is locked ✓");
      qc.invalidateQueries({ queryKey: ["forecast-snapshots"] });
    } catch (e: any) {
      setMsg("Snapshot failed: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // Auto-snapshot: first visit in a week with no snapshot yet
  useEffect(() => {
    if (triedAuto.current) return;
    if (!Array.isArray(snaps) || !Array.isArray(invoices) || !Array.isArray(payments)) return;
    if (invoices.length === 0) return; // don't lock an empty forecast while data is missing
    triedAuto.current = true;
    if (!snaps.some((s: any) => s.week_start === thisISO)) lock(false, "auto");
  }, [snaps, invoices, payments]);

  function onManual() {
    if (currentSnap && !confirm("Replace this week's locked forecast with the current numbers?")) return;
    lock(true, "manual");
  }

  const rows = useMemo(() => {
    const snapMap = new Map<string, any>(snapList.map((s: any) => [s.week_start, s]));
    const actual = new Map<string, number>();
    payList.forEach((p: any) => {
      if (!p.payment_date) return;
      const ws = toISO(weekStart(fromISO(p.payment_date)));
      actual.set(ws, (actual.get(ws) || 0) + Number(p.amount || 0));
    });
    const out: any[] = [];
    for (let i = 0; i < HISTORY_WEEKS; i++) {
      const start = addDays(thisWeek, -7 * i);
      const iso = toISO(start);
      const s = snapMap.get(iso);
      const fc = s ? Number(s.forecast_amount) : null;
      const act = actual.get(iso) || 0;
      out.push({
        iso, start, snap: s, fc, act,
        varAmt: fc === null ? null : act - fc,
        varPct: fc ? ((act - fc) / fc) * 100 : null,
        current: i === 0,
      });
    }
    return out;
  }, [snaps, payments]);

  const done = rows.filter((r) => !r.current && r.fc !== null);
  const totFc = done.reduce((s, r) => s + r.fc, 0);
  const totAct = done.reduce((s, r) => s + r.act, 0);
  const totPct = totFc ? ((totAct - totFc) / totFc) * 100 : null;

  function pctText(p: number | null) {
    if (p === null) return "—";
    return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
  }
  function tone(v: number | null) {
    if (v === null) return "text-muted-foreground";
    return v >= 0 ? "text-emerald-700" : "text-red-700";
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Forecast vs actual</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Each week's forecast is locked at the start of the week, then compared with payments recorded in Cash application.
          </p>
        </div>
        <div className="text-right">
          <button onClick={onManual} disabled={busy}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {busy ? "Saving…" : currentSnap ? "Re-lock this week's forecast" : "Lock this week's forecast"}
          </button>
          <div className="text-xs text-muted-foreground mt-1">
            {currentSnap
              ? `Locked ${new Date(currentSnap.taken_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · ${currentSnap.method || "auto"}`
              : "Not locked yet this week"}
          </div>
          {msg && <div className="text-xs text-muted-foreground mt-1">{msg}</div>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Weeks compared</div>
          <div className="text-2xl font-bold mt-1">{done.length}</div>
          <div className="text-xs text-muted-foreground mt-1">completed weeks with a snapshot</div>
        </CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Forecast</div>
          <div className="text-2xl font-bold font-mono mt-1">{fmtCur(totFc)}</div>
        </CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Actual</div>
          <div className="text-2xl font-bold font-mono mt-1">{fmtCur(totAct)}</div>
        </CardContent></Card>
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Variance</div>
          <div className={"text-2xl font-bold font-mono mt-1 " + tone(totPct)}>{pctText(totPct)}</div>
          <div className="text-xs text-muted-foreground mt-1">{done.length ? fmtCur(totAct - totFc) : "no completed weeks yet"}</div>
        </CardContent></Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last {HISTORY_WEEKS} weeks</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
            <div className="col-span-3">Week</div>
            <div className="col-span-2 text-right">Forecast</div>
            <div className="col-span-2 text-right">Actual</div>
            <div className="col-span-3 text-right">Variance</div>
            <div className="col-span-2 text-right">Variance %</div>
          </div>
          {rows.map((r) => (
            <div key={r.iso} className={"grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center border-b border-border/50 " + (r.current ? "bg-primary/5" : "")}>
              <div className="col-span-3">
                {rangeLabel(r.start)}
                {r.current && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">in progress</span>}
              </div>
              <div className="col-span-2 text-right font-mono">
                {r.fc === null ? <span className="text-xs text-muted-foreground">no snapshot</span> : fmtCur(r.fc)}
              </div>
              <div className="col-span-2 text-right font-mono">{fmtCur(r.act)}</div>
              <div className={"col-span-3 text-right font-mono " + tone(r.varAmt)}>
                {r.varAmt === null ? "—" : (r.varAmt >= 0 ? "+" : "") + fmtCur(r.varAmt)}
              </div>
              <div className={"col-span-2 text-right font-mono " + tone(r.varPct)}>{pctText(r.varPct)}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
