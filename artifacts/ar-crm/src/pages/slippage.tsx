import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, ArrowRightFromLine, ArrowLeftToLine, ArrowDownLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { PageHeader, StatCard, Panel, Segmented, Chip, GridHead } from "@/components/page-kit";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toISO(d: Date): string {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fromISO(iso: string): Date {
  return new Date(iso + "T00:00:00");
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // Monday
  return x;
}
function weekLabel(start: Date, withYear = true): string {
  const e = addDays(start, 4);
  const y = withYear ? " " + e.getFullYear() : "";
  return start.getMonth() === e.getMonth()
    ? `${start.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]}${y}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}${y}`;
}
function fmtCur(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = fromISO(String(iso).slice(0, 10));
  if (isNaN(d.getTime())) return String(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

type Mode = "week" | "month";
function periodFor(mode: Mode, offset: number) {
  const now = new Date();
  if (mode === "week") {
    const s = addDays(weekStart(now), 7 * offset);
    return { start: s, end: addDays(s, 7), label: weekLabel(s) };
  }
  const s = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const e = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start: s, end: e, label: MONTHS_LONG[s.getMonth()] + " " + s.getFullYear() };
}
function periodLabelOf(mode: Mode, iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = fromISO(String(iso).slice(0, 10));
  if (isNaN(d.getTime())) return "—";
  return mode === "week" ? weekLabel(weekStart(d), false) : MONTHS[d.getMonth()] + " " + d.getFullYear();
}

export default function Slippage() {
  const [mode, setMode] = useState<Mode>("week");
  const [offset, setOffset] = useState(0);
  const { data: invoices } = useAllInvoices();
  const { data: payments } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: audits } = useQuery({
    queryKey: ["audit-epd"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log").select("*");
      if (error) return [];
      return (data ?? []).filter((r: any) => (r.field ?? r.field_name) === "expected_payment_date");
    },
  });

  const per = periodFor(mode, offset);
  const sISO = toISO(per.start);
  const eISO = toISO(per.end);
  const isCurrent = offset === 0;
  const unit = mode === "week" ? "week" : "month";

  const report = useMemo(() => {
    const invList = Array.isArray(invoices) ? invoices : [];
    const payList = Array.isArray(payments) ? payments : [];
    const auditList = Array.isArray(audits) ? audits : [];
    const inP = (iso?: string | null) => !!iso && iso >= sISO && iso < eISO;

    const invById = new Map<string, any>();
    const invByNum = new Map<string, any>();
    invList.forEach((i: any) => { invById.set(String(i.id), i); invByNum.set(String(i.invoiceNumber), i); });
    const invOf = (p: any) => invById.get(String(p.invoice_id)) || invByNum.get(String(p.invoice_number));

    const paysByInv = new Map<string, any[]>();
    payList.forEach((p: any) => {
      const inv = invOf(p);
      if (!inv) return;
      const k = String(inv.id);
      if (!paysByInv.has(k)) paysByInv.set(k, []);
      paysByInv.get(k)!.push(p);
    });

    // 1) Slipped out: expected in period, not (fully) received in period
    const slippedOut: any[] = [];
    invList.forEach((inv: any) => {
      if (!inP(inv.expectedPaymentDate)) return;
      const pays = paysByInv.get(String(inv.id)) || [];
      const paidFromStart = pays.filter((p) => p.payment_date >= sISO).reduce((s, p) => s + Number(p.amount || 0), 0);
      const forecastAmt = Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0) + paidFromStart;
      if (forecastAmt <= 0.01) return;
      const received = pays.filter((p) => inP(p.payment_date)).reduce((s, p) => s + Number(p.amount || 0), 0);
      const slipped = forecastAmt - received;
      if (slipped <= 0.01) return;
      const later = pays.filter((p) => p.payment_date >= eISO).sort((a, b) => (a.payment_date < b.payment_date ? -1 : 1));
      const landedLater = later.reduce((s, p) => s + Number(p.amount || 0), 0);
      slippedOut.push({ inv, forecastAmt, received, slipped, landedLater, firstLater: later[0]?.payment_date ?? null });
    });
    slippedOut.sort((a, b) => b.slipped - a.slipped);

    // 2) Late arrivals and 3) pulled in early: payments received in the period
    const late: any[] = [];
    const early: any[] = [];
    payList.forEach((p: any) => {
      if (!inP(p.payment_date)) return;
      const inv = invOf(p);
      const exp = inv?.expectedPaymentDate;
      if (!exp) return;
      if (exp < sISO) late.push({ p, inv, exp });
      else if (exp >= eISO) early.push({ p, inv, exp });
    });
    late.sort((a, b) => Number(b.p.amount || 0) - Number(a.p.amount || 0));
    early.sort((a, b) => Number(b.p.amount || 0) - Number(a.p.amount || 0));

    // 4) Expected date moves crossing the period
    const pushed: any[] = [];
    const pulled: any[] = [];
    auditList.forEach((a: any) => {
      const oldV = String(a.old_value ?? "").slice(0, 10);
      const newV = String(a.new_value ?? "").slice(0, 10);
      if (!oldV || !newV) return;
      const inv = invById.get(String(a.invoice_id)) || invByNum.get(String(a.invoice_number));
      const row = { a, inv, oldV, newV, when: a.created_at ?? a.changed_at ?? null, by: a.changed_by ?? a.author ?? null };
      if (inP(oldV) && newV >= eISO) pushed.push(row);
      else if (oldV >= eISO && inP(newV)) pulled.push(row);
    });
    const byWhen = (x: any, y: any) => (String(y.when || "") > String(x.when || "") ? 1 : -1);
    pushed.sort(byWhen);
    pulled.sort(byWhen);

    const sum = (arr: any[], f: (x: any) => number) => arr.reduce((s, x) => s + f(x), 0);
    const openOf = (inv: any) => (inv ? Math.max(0, Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0)) : 0);
    return {
      slippedOut, late, early, pushed, pulled, openOf,
      tSlipped: sum(slippedOut, (x) => x.slipped),
      tLate: sum(late, (x) => Number(x.p.amount || 0)),
      tEarly: sum(early, (x) => Number(x.p.amount || 0)),
      tPushed: sum(pushed, (x) => openOf(x.inv)),
      tPulled: sum(pulled, (x) => openOf(x.inv)),
    };
  }, [invoices, payments, audits, sISO, eISO]);

  const custLink = (inv: any, fallback?: string) =>
    inv?.customerId
      ? <Link href={`/customer/${inv.customerId}`} className="text-primary hover:underline">{inv.customerName}</Link>
      : <span>{fallback || inv?.customerName || "—"}</span>;
  const empty = (msg: string) => <p className="px-5 py-6 text-center text-sm text-muted-foreground">{msg}</p>;

  return (
    <div className="p-6 space-y-6 w-full">
      <PageHeader
        eyebrow={<span className="flex items-center gap-2">Reporting <Chip tone="amber">Internal</Chip></span>}
        title="Cross-period slippage"
        subtitle={`Cash and expected dates that moved into or out of the selected ${unit}.`}
        actions={
          <>
            <Segmented<Mode>
              value={mode}
              onChange={(v) => { setMode(v); setOffset(0); }}
              options={[
                { value: "week", label: "Week", icon: <CalendarDays className="w-3.5 h-3.5" /> },
                { value: "month", label: "Month", icon: <CalendarRange className="w-3.5 h-3.5" /> },
              ]}
            />
            <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-1 py-0.5">
              <button onClick={() => setOffset(offset - 1)} className="p-1 rounded hover:bg-muted" title={`Previous ${unit}`}><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs font-medium px-2 min-w-[130px] text-center">{per.label}</span>
              <button onClick={() => setOffset(Math.min(0, offset + 1))} disabled={isCurrent} className="p-1 rounded hover:bg-muted disabled:opacity-30" title={`Next ${unit}`}><ChevronRight className="w-4 h-4" /></button>
            </div>
            {!isCurrent && <button onClick={() => setOffset(0)} className="text-xs text-primary hover:underline">This {unit}</button>}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Slipped out" value={fmtCur(report.tSlipped)} valueClass="text-red-700"
          icon={<ArrowRightFromLine className="w-3.5 h-3.5" />} iconTone="bg-red-50 text-red-700"
          footerLeft={`${report.slippedOut.length} invoice${report.slippedOut.length === 1 ? "" : "s"} expected, not received`} />
        <StatCard label="Late arrivals" value={fmtCur(report.tLate)} valueClass="text-amber-700"
          icon={<ArrowDownLeft className="w-3.5 h-3.5" />} iconTone="bg-amber-50 text-amber-700"
          footerLeft={`${report.late.length} payment${report.late.length === 1 ? "" : "s"} due in an earlier ${unit}`} />
        <StatCard label="Pulled in early" value={fmtCur(report.tEarly)} valueClass="text-violet-700"
          icon={<ArrowLeftToLine className="w-3.5 h-3.5" />} iconTone="bg-violet-50 text-violet-700"
          footerLeft={`${report.early.length} payment${report.early.length === 1 ? "" : "s"} due in a later ${unit}`} />
        <StatCard label="Date pushed out" value={String(report.pushed.length)}
          footerLeft={`${fmtCur(report.tPushed)} open`} footerRight={`to later ${unit}`} />
        <StatCard label="Date pulled in" value={String(report.pulled.length)}
          footerLeft={`${fmtCur(report.tPulled)} open`} footerRight={`into this ${unit}`} />
      </div>

      <Panel title={`Slipped out · expected in ${per.label}, not received`}
        footer={`Expected amount is as at the start of the ${unit}; the expected date shown is the invoice's current one.`}>
        {report.slippedOut.length === 0 ? empty(`Nothing slipped out of this ${unit}.`) : (
          <div className="text-xs">
            <GridHead>
              <div className="col-span-2">Invoice</div>
              <div className="col-span-3">Customer</div>
              <div className="col-span-1">Expected</div>
              <div className="col-span-2 text-right">Expected amount</div>
              <div className="col-span-1 text-right">Received</div>
              <div className="col-span-1 text-right">Slipped</div>
              <div className="col-span-2 text-right">What happened</div>
            </GridHead>
            {report.slippedOut.map((x: any) => (
              <div key={x.inv.id} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-border/50">
                <div className="col-span-2 font-mono">{x.inv.invoiceNumber}</div>
                <div className="col-span-3 truncate">{custLink(x.inv)}</div>
                <div className="col-span-1 font-mono text-muted-foreground">{fmtDate(x.inv.expectedPaymentDate)}</div>
                <div className="col-span-2 text-right font-mono">{fmtCur(x.forecastAmt)}</div>
                <div className="col-span-1 text-right font-mono">{fmtCur(x.received)}</div>
                <div className="col-span-1 text-right font-mono text-red-700">{fmtCur(x.slipped)}</div>
                <div className="col-span-2 text-right">
                  {x.landedLater > 0
                    ? <Chip tone="amber">Landed later · {fmtDate(x.firstLater)}</Chip>
                    : <Chip tone="red">{isCurrent ? "Not received yet" : "Still open"}</Chip>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Panel title={`Late arrivals · received in ${per.label}, expected earlier`}>
          {report.late.length === 0 ? empty("No late arrivals.") : (
            <div className="text-xs">
              <GridHead>
                <div className="col-span-3">Invoice</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2">Paid on</div>
                <div className="col-span-2">Was expected</div>
                <div className="col-span-2 text-right">Amount</div>
              </GridHead>
              {report.late.map((x: any) => (
                <div key={x.p.id} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-border/50">
                  <div className="col-span-3 font-mono">{x.p.invoice_number}</div>
                  <div className="col-span-3 truncate">{custLink(x.inv, x.p.customer_name)}</div>
                  <div className="col-span-2 font-mono text-muted-foreground">{fmtDate(x.p.payment_date)}</div>
                  <div className="col-span-2"><Chip tone="amber">{periodLabelOf(mode, x.exp)}</Chip></div>
                  <div className="col-span-2 text-right font-mono">{fmtCur(Number(x.p.amount || 0))}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title={`Pulled in early · received in ${per.label}, expected later`}>
          {report.early.length === 0 ? empty("No early payments.") : (
            <div className="text-xs">
              <GridHead>
                <div className="col-span-3">Invoice</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-2">Paid on</div>
                <div className="col-span-2">Was expected</div>
                <div className="col-span-2 text-right">Amount</div>
              </GridHead>
              {report.early.map((x: any) => (
                <div key={x.p.id} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-border/50">
                  <div className="col-span-3 font-mono">{x.p.invoice_number}</div>
                  <div className="col-span-3 truncate">{custLink(x.inv, x.p.customer_name)}</div>
                  <div className="col-span-2 font-mono text-muted-foreground">{fmtDate(x.p.payment_date)}</div>
                  <div className="col-span-2"><Chip tone="violet">{periodLabelOf(mode, x.exp)}</Chip></div>
                  <div className="col-span-2 text-right font-mono">{fmtCur(Number(x.p.amount || 0))}</div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel title={`Expected date changes crossing ${per.label}`}
        footer="From the audit log: hand edits to expected payment dates. Automatic recalculations from payment history are not logged as changes.">
        {report.pushed.length + report.pulled.length === 0 ? empty(`No expected dates were moved out of or into this ${unit}.`) : (
          <div className="text-xs">
            <GridHead>
              <div className="col-span-2">Change</div>
              <div className="col-span-2">Invoice</div>
              <div className="col-span-2">Customer</div>
              <div className="col-span-1">From</div>
              <div className="col-span-1">To</div>
              <div className="col-span-2">Changed by / on</div>
              <div className="col-span-2 text-right">Open amount</div>
            </GridHead>
            {[...report.pushed.map((x: any) => ({ ...x, kind: "out" })), ...report.pulled.map((x: any) => ({ ...x, kind: "in" }))].map((x: any, i: number) => (
              <div key={(x.a.id ?? i) + x.kind} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center border-b border-border/50">
                <div className="col-span-2">{x.kind === "out" ? <Chip tone="red">Pushed out</Chip> : <Chip tone="green">Pulled in</Chip>}</div>
                <div className="col-span-2 font-mono">{x.inv?.invoiceNumber ?? x.a.invoice_number ?? "—"}</div>
                <div className="col-span-2 truncate">{custLink(x.inv)}</div>
                <div className="col-span-1 font-mono text-muted-foreground">{fmtDate(x.oldV)}</div>
                <div className="col-span-1 font-mono">{fmtDate(x.newV)}</div>
                <div className="col-span-2 text-muted-foreground truncate">{x.by || "—"}{x.when ? " · " + fmtDate(String(x.when).slice(0, 10)) : ""}</div>
                <div className="col-span-2 text-right font-mono">{fmtCur(report.openOf(x.inv))}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
