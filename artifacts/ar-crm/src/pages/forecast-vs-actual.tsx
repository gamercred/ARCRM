import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { getAuditName } from "@/lib/audit";

const FORWARD_WEEKS = 12; // this week + 11 ahead
const MAX_PAST_WEEKS = 26;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
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
// Mon–Fri label, e.g. "26 – 30 Oct" or "29 Dec – 2 Jan"
function weekLabel(start: Date): string {
  const e = addDays(start, 4);
  return start.getMonth() === e.getMonth()
    ? `${start.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}
function fmtCur(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function pctText(p: number | null): string {
  if (p === null || !isFinite(p)) return "—";
  return (p >= 0 ? "+" : "") + p.toFixed(1) + "%";
}
function tone(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-emerald-700" : "text-red-700";
}

type Row = {
  iso: string; start: Date; status: "done" | "current" | "upcoming";
  fc: number | null; fcCount: number; source: "locked" | "projected" | "none";
  act: number | null; varAmt: number | null; varPct: number | null; early: number;
};

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
      const { data, error } = await supabase.from("forecast_snapshots").select("*").order("week_start", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [showPays, setShowPays] = useState(false);
  const triedAuto = useRef(false);

  const thisWeek = weekStart(new Date());
  const thisISO = toISO(thisWeek);
  const invList = Array.isArray(invoices) ? invoices : [];
  const payList = Array.isArray(payments) ? payments : [];
  const snapList = Array.isArray(snaps) ? snaps : [];

  // Forecast for a week = open amount on invoices expected that week,
  // adding back any payments already received in that week (start-of-week view).
  function computeForWeek(start: Date) {
    const startMs = start.getTime();
    const endMs = addDays(start, 7).getTime();
    const paidInWeek = new Map<string, number>();
    payList.forEach((p: any) => {
      if (!p.payment_date) return;
      const t = fromISO(p.payment_date).getTime();
      if (t >= startMs && t < endMs) {
        const k = String(p.invoice_id || p.invoice_number);
        paidInWeek.set(k, (paidInWeek.get(k) || 0) + Number(p.amount || 0));
      }
    });
    let total = 0;
    let count = 0;
    invList.forEach((inv: any) => {
      const iso = inv.expectedPaymentDate;
      if (!iso) return;
      const t = fromISO(iso).getTime();
      if (isNaN(t) || t < startMs || t >= endMs) return;
      const back = (paidInWeek.get(String(inv.id)) || 0) + (paidInWeek.get(String(inv.invoiceNumber)) || 0);
      const open = Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0) + back;
      if (open > 0.01) { total += open; count += 1; }
    });
    return { total, count };
  }

  // Quietly save this week's forecast the first time the page opens this week
  useEffect(() => {
    if (triedAuto.current) return;
    if (!Array.isArray(snaps) || !Array.isArray(invoices) || !Array.isArray(payments)) return;
    if (invoices.length === 0) return;
    triedAuto.current = true;
    if (snaps.some((s: any) => s.week_start === thisISO)) return;
    const { total, count } = computeForWeek(thisWeek);
    supabase.from("forecast_snapshots").upsert({
      week_start: thisISO,
      forecast_amount: Math.round(total * 100) / 100,
      invoice_count: count,
      method: "auto",
      taken_by: getAuditName() || null,
      taken_at: new Date().toISOString(),
    }, { onConflict: "week_start", ignoreDuplicates: true }).then(() => {
      qc.invalidateQueries({ queryKey: ["forecast-snapshots"] });
    });
  }, [snaps, invoices, payments]);

  const rows: Row[] = useMemo(() => {
    const snapMap = new Map<string, any>(snapList.map((s: any) => [s.week_start, s]));
    const actualMap = new Map<string, number>();
    const earlyMap = new Map<string, number>();
    const byId = new Map<string, any>();
    const byNum = new Map<string, any>();
    invList.forEach((i: any) => { byId.set(String(i.id), i); byNum.set(String(i.invoiceNumber), i); });
    payList.forEach((p: any) => {
      if (!p.payment_date) return;
      const paidStart = weekStart(fromISO(p.payment_date));
      const ws = toISO(paidStart);
      actualMap.set(ws, (actualMap.get(ws) || 0) + Number(p.amount || 0));
      const inv = byId.get(String(p.invoice_id)) || byNum.get(String(p.invoice_number));
      const exp = inv?.expectedPaymentDate;
      if (exp && weekStart(fromISO(exp)).getTime() > paidStart.getTime()) {
        earlyMap.set(ws, (earlyMap.get(ws) || 0) + Number(p.amount || 0));
      }
    });

    // start from the earliest saved week (tracking start), or this week
    let first = thisWeek;
    const earliest = snapList.length ? weekStart(fromISO(snapList[0].week_start)) : null;
    if (earliest && earliest.getTime() < thisWeek.getTime()) first = earliest;
    const oldestAllowed = addDays(thisWeek, -7 * MAX_PAST_WEEKS);
    if (first.getTime() < oldestAllowed.getTime()) first = oldestAllowed;

    const out: Row[] = [];
    const last = addDays(thisWeek, 7 * (FORWARD_WEEKS - 1));
    for (let start = first; start.getTime() <= last.getTime(); start = addDays(start, 7)) {
      const iso = toISO(start);
      const status: Row["status"] = iso < thisISO ? "done" : iso === thisISO ? "current" : "upcoming";
      const snap = snapMap.get(iso);
      let fc: number | null = null;
      let fcCount = 0;
      let source: Row["source"] = "none";
      if (snap) {
        fc = Number(snap.forecast_amount); fcCount = Number(snap.invoice_count || 0); source = "locked";
      } else if (status !== "done") {
        const c = computeForWeek(start); fc = c.total; fcCount = c.count; source = "projected";
      }
      const act = status === "upcoming" ? null : actualMap.get(iso) || 0;
      const varAmt = fc !== null && act !== null ? act - fc : null;
      const varPct = fc && act !== null ? ((act - fc) / fc) * 100 : null;
      out.push({ iso, start, status, fc, fcCount, source, act, varAmt, varPct, early: status === "upcoming" ? 0 : earlyMap.get(iso) || 0 });
    }
    return out;
  }, [snaps, payments, invoices]);

  const sel = rows.find((r) => r.iso === (selected || thisISO)) || rows[0];
  const invById = new Map<string, any>();
  const invByNum = new Map<string, any>();
  invList.forEach((i: any) => { invById.set(String(i.id), i); invByNum.set(String(i.invoiceNumber), i); });
  function isEarlyPay(p: any): boolean {
    const inv = invById.get(String(p.invoice_id)) || invByNum.get(String(p.invoice_number));
    const exp = inv?.expectedPaymentDate;
    return !!(exp && p.payment_date && weekStart(fromISO(exp)).getTime() > weekStart(fromISO(p.payment_date)).getTime());
  }
  const weekPays = sel
    ? payList.filter((p: any) => p.payment_date && toISO(weekStart(fromISO(p.payment_date))) === sel.iso)
        .sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0))
    : [];
  const weekPaysTotal = weekPays.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
  const started = rows.filter((r) => r.status !== "upcoming" && r.fc !== null);
  const totFc = started.reduce((s, r) => s + (r.fc || 0), 0);
  const totAct = started.reduce((s, r) => s + (r.act || 0), 0);
  const totPct = totFc ? ((totAct - totFc) / totFc) * 100 : null;

  function statusChip(st: Row["status"]) {
    if (st === "current") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">This week</span>;
    if (st === "upcoming") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">Upcoming</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-medium">Completed</span>;
  }

  const collectedPct = sel && sel.fc && sel.act !== null ? (sel.act / sel.fc) * 100 : null;

  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Forecast vs actual</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Forecasted cash for each week (Monday–Friday) against payments received that same week. Click a week to see it in the cards.
        </p>
      </div>

      {sel && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Week</div>
            <div className="text-2xl font-bold mt-1">{weekLabel(sel.start)}</div>
            <div className="mt-1">{statusChip(sel.status)}</div>
          </CardContent></Card>
          <Card className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Forecasted cash</div>
            <div className="text-2xl font-bold font-mono mt-1">{sel.fc === null ? "—" : fmtCur(sel.fc)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {sel.fc === null ? "no forecast saved for this week" : `${sel.fcCount} invoices · ${sel.source === "locked" ? "set at start of week" : "projected"}`}
            </div>
          </CardContent></Card>
          <Card onClick={() => sel && sel.act !== null && setShowPays(!showPays)} className={"bg-card transition-colors " + (sel && sel.act !== null ? "cursor-pointer hover:border-primary/40 " : "") + (showPays ? "ring-2 ring-primary" : "")}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Actual received{sel && sel.act !== null && <span className="normal-case tracking-normal text-primary ml-1">· {showPays ? "hide" : "view"} payments</span>}</div>
            <div className="text-2xl font-bold font-mono mt-1">{sel.act === null ? "—" : fmtCur(sel.act)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {sel.act === null ? "week hasn't started" : collectedPct === null ? "payments received this week" : `${collectedPct.toFixed(1)}% of forecast collected`}
            </div>
            {sel.early > 0 && <div className="text-xs text-violet-700 mt-1">incl. {fmtCur(sel.early)} paid early (expected in later weeks)</div>}
          </CardContent></Card>
          <Card className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Variance{sel.status === "current" ? " so far" : ""}</div>
            <div className={"text-2xl font-bold font-mono mt-1 " + tone(sel.varAmt)}>
              {sel.varAmt === null ? "—" : (sel.varAmt >= 0 ? "+" : "") + fmtCur(sel.varAmt)}
            </div>
            <div className={"text-xs mt-1 " + tone(sel.varPct)}>{pctText(sel.varPct)}</div>
          </CardContent></Card>
        </div>
      )}

      {showPays && sel && sel.act !== null && (
        <Card className="bg-card">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Payments received · {weekLabel(sel.start)}</CardTitle>
            <button onClick={() => setShowPays(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
          </CardHeader>
          <CardContent className="p-0">
            {weekPays.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded in this week yet.</p>
            ) : (
              <div className="text-sm">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                  <div className="col-span-2">Paid on</div>
                  <div className="col-span-2">Invoice</div>
                  <div className="col-span-3">Customer</div>
                  <div className="col-span-2">Reference</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1 text-right">Share</div>
                </div>
                {weekPays.map((p: any) => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center border-b border-border/50">
                    <div className="col-span-2 font-mono text-xs text-muted-foreground">{p.payment_date}</div>
                    <div className="col-span-2 font-mono text-xs">
                      {p.invoice_number}
                      {isEarlyPay(p) && <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded border text-[10px] font-sans font-medium bg-violet-50 text-violet-700 border-violet-200">Paid early</span>}
                    </div>
                    <div className="col-span-3 truncate">
                      {p.customer_id ? <Link href={`/customer/${p.customer_id}`} className="text-primary hover:underline">{p.customer_name}</Link> : p.customer_name}
                    </div>
                    <div className="col-span-2 font-mono text-xs text-muted-foreground truncate">{p.reference || "—"}</div>
                    <div className="col-span-2 text-right font-mono">{fmtCur(Number(p.amount || 0))}</div>
                    <div className="col-span-1 text-right font-mono text-xs text-muted-foreground">{weekPaysTotal ? ((Number(p.amount || 0) / weekPaysTotal) * 100).toFixed(0) + "%" : "—"}</div>
                  </div>
                ))}
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center font-semibold bg-muted/30">
                  <div className="col-span-9">{weekPays.length} payment{weekPays.length === 1 ? "" : "s"}</div>
                  <div className="col-span-2 text-right font-mono">{fmtCur(weekPaysTotal)}</div>
                  <div className="col-span-1" />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weekly forecast vs actual</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
            <div className="col-span-2">Week</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Forecast</div>
            <div className="col-span-2 text-right">Actual</div>
            <div className="col-span-2 text-right">Variance</div>
            <div className="col-span-2 text-right">Variance %</div>
          </div>
          {rows.map((r) => {
            const isSel = sel && r.iso === sel.iso;
            return (
              <div key={r.iso} onClick={() => setSelected(r.iso)}
                className={"grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center border-b border-border/50 cursor-pointer " +
                  (isSel ? "bg-primary/10 " : "hover:bg-muted/30 ") + (r.status === "upcoming" ? "text-muted-foreground" : "")}>
                <div className="col-span-2 font-medium">{weekLabel(r.start)}</div>
                <div className="col-span-2">{statusChip(r.status)}</div>
                <div className="col-span-2 text-right font-mono">{r.fc === null ? "—" : fmtCur(r.fc)}</div>
                <div onClick={() => r.act !== null && setShowPays(true)} className={"col-span-2 text-right font-mono" + (r.act !== null ? " hover:text-primary hover:underline" : "")}>{r.act === null ? "—" : fmtCur(r.act)}{r.early > 0 && <div className="text-[10px] text-violet-700 font-sans">incl. {fmtCur(r.early)} early</div>}</div>
                <div className={"col-span-2 text-right font-mono " + tone(r.varAmt)}>
                  {r.varAmt === null ? "—" : (r.varAmt >= 0 ? "+" : "") + fmtCur(r.varAmt)}
                </div>
                <div className={"col-span-2 text-right font-mono " + tone(r.varPct)}>{pctText(r.varPct)}</div>
              </div>
            );
          })}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center font-semibold bg-muted/30">
            <div className="col-span-4">Total to date</div>
            <div className="col-span-2 text-right font-mono">{fmtCur(totFc)}</div>
            <div className="col-span-2 text-right font-mono">{fmtCur(totAct)}</div>
            <div className={"col-span-2 text-right font-mono " + tone(totFc ? totAct - totFc : null)}>
              {totFc ? (totAct - totFc >= 0 ? "+" : "") + fmtCur(totAct - totFc) : "—"}
            </div>
            <div className={"col-span-2 text-right font-mono " + tone(totPct)}>{pctText(totPct)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
