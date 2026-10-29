import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";

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
function weekLabel(start: Date): string {
  const e = addDays(start, 4);
  return start.getMonth() === e.getMonth()
    ? `${start.getDate()} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
    : `${start.getDate()} ${MONTHS[start.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
}

function dsoCls(d: number | null) {
  if (d === null || d === undefined) return "text-muted-foreground";
  if (d > 15) return "text-red-700";
  if (d > 0) return "text-orange-700";
  return "text-emerald-700";
}
function dsoLabel(d: number | null) {
  if (d === null || d === undefined) return "—";
  if (d > 0) return d + "d late";
  if (d < 0) return Math.abs(d) + "d early";
  return "on time";
}

export default function PaymentHistory() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"customer" | "week">("customer");
  const [openCust, setOpenCust] = useState<string | null>(null);
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = Array.isArray(payments) ? payments : [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? all.filter((p: any) => (String(p.customer_name || "") + " " + String(p.customer_id || "") + " " + String(p.invoice_number || "") + " " + String(p.reference || "")).toLowerCase().includes(q))
    : all;

  // ---------- by customer ----------
  const customers = useMemo(() => {
    const m = new Map<string, { key: string; name: string; payments: any[] }>();
    filtered.forEach((p: any) => {
      const key = String(p.customer_id || p.customer_name || "—");
      if (!m.has(key)) m.set(key, { key, name: p.customer_name || key, payments: [] });
      m.get(key)!.payments.push(p);
    });
    const rows = Array.from(m.values()).map((c) => {
      const timed = c.payments.filter((p) => p.days_from_due !== null && p.days_from_due !== undefined);
      const avgDso = timed.length ? Math.round(timed.reduce((s, p) => s + p.days_from_due, 0) / timed.length) : null;
      const onTime = timed.length ? Math.round((timed.filter((p) => p.days_from_due <= 0).length / timed.length) * 100) : null;
      const totalPaid = c.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      return { ...c, avgDso, onTime, count: c.payments.length, totalPaid };
    });
    return rows.sort((a, b) => (b.avgDso ?? -9999) - (a.avgDso ?? -9999));
  }, [payments, search]);

  // ---------- by week ----------
  const thisWeek = weekStart(new Date());
  const thisISO = toISO(thisWeek);
  const lastISO = toISO(addDays(thisWeek, -7));
  const weeks = useMemo(() => {
    const m = new Map<string, { iso: string; start: Date; payments: any[]; total: number; customers: Set<string> }>();
    m.set(thisISO, { iso: thisISO, start: thisWeek, payments: [], total: 0, customers: new Set() });
    filtered.forEach((p: any) => {
      if (!p.payment_date) return;
      const start = weekStart(fromISO(p.payment_date));
      const iso = toISO(start);
      if (!m.has(iso)) m.set(iso, { iso, start, payments: [], total: 0, customers: new Set() });
      const w = m.get(iso)!;
      w.payments.push(p);
      w.total += Number(p.amount || 0);
      w.customers.add(String(p.customer_id || p.customer_name || ""));
    });
    const list = Array.from(m.values()).sort((a, b) => (a.iso < b.iso ? 1 : -1));
    list.forEach((w) => w.payments.sort((a: any, b: any) => (a.payment_date < b.payment_date ? -1 : 1)));
    return list;
  }, [payments, search]);
  const thisWeekTotal = weeks.find((w) => w.iso === thisISO)?.total ?? 0;
  const lastWeekTotal = weeks.find((w) => w.iso === lastISO)?.total ?? 0;

  // portfolio-wide average
  const timedAll = all.filter((p: any) => p.days_from_due !== null && p.days_from_due !== undefined);
  const portfolioDso = timedAll.length ? Math.round(timedAll.reduce((s: number, p: any) => s + p.days_from_due, 0) / timedAll.length) : null;

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
          <p className="text-sm text-muted-foreground mt-1">Payments recorded in Cash application — by customer, or week by week.</p>
        </div>
        <div className="flex items-center gap-4">
          {portfolioDso !== null && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Portfolio avg DSO</div>
              <div className={"text-2xl font-bold " + dsoCls(portfolioDso)}>{dsoLabel(portfolioDso)}</div>
            </div>
          )}
          <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
            <button onClick={() => setView("customer")}
              className={"px-4 py-1.5 " + (view === "customer" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/40")}>By customer</button>
            <button onClick={() => setView("week")}
              className={"px-4 py-1.5 border-l border-border " + (view === "week" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted/40")}>By week</button>
          </div>
        </div>
      </div>

      {view === "week" && (
        <div className="grid grid-cols-2 gap-4 max-w-xl">
          <Card className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Received this week</div>
            <div className="text-2xl font-bold font-mono text-primary mt-1">{formatCurrency(thisWeekTotal, "USD")}</div>
            <div className="text-xs text-muted-foreground mt-1">{weekLabel(thisWeek)}</div>
          </CardContent></Card>
          <Card className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Received last week</div>
            <div className="text-2xl font-bold font-mono mt-1">{formatCurrency(lastWeekTotal, "USD")}</div>
            <div className="text-xs text-muted-foreground mt-1">{weekLabel(addDays(thisWeek, -7))}</div>
          </CardContent></Card>
        </div>
      )}

      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{view === "customer" ? "Customers" : "Weeks"}</CardTitle>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer, invoice or reference…" className="bg-background border border-border rounded px-2 py-1 text-xs w-64" />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-muted-foreground text-sm">Loading…</p>
          ) : view === "customer" ? (
            customers.length === 0 ? (
              <p className="p-6 text-center text-muted-foreground text-sm">No payments recorded yet. Record payments in Cash application to build history.</p>
            ) : (
              <div>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                  <div className="col-span-4">Customer</div>
                  <div className="col-span-2 text-right">Avg DSO</div>
                  <div className="col-span-2 text-right">On-time</div>
                  <div className="col-span-1 text-right"># Pmts</div>
                  <div className="col-span-3 text-right">Total paid</div>
                </div>
                {customers.map((c) => (
                  <div key={c.key} className="border-b border-border/50">
                    <div onClick={() => setOpenCust(openCust === c.key ? null : c.key)} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center cursor-pointer hover:bg-muted/30">
                      <div className="col-span-4 font-medium truncate"><span className="text-muted-foreground mr-1">{openCust === c.key ? "▾" : "▸"}</span>{c.name}</div>
                      <div className={"col-span-2 text-right font-semibold " + dsoCls(c.avgDso)}>{dsoLabel(c.avgDso)}</div>
                      <div className="col-span-2 text-right">{c.onTime === null ? "—" : c.onTime + "%"}</div>
                      <div className="col-span-1 text-right">{c.count}</div>
                      <div className="col-span-3 text-right font-mono">{formatCurrency(c.totalPaid, "USD")}</div>
                    </div>
                    {openCust === c.key && (
                      <div className="bg-muted/20 px-4 py-2">
                        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
                          <div className="col-span-3">Invoice</div>
                          <div className="col-span-3">Paid on</div>
                          <div className="col-span-2">Reference</div>
                          <div className="col-span-2 text-right">Amount</div>
                          <div className="col-span-2 text-right">vs due</div>
                        </div>
                        {c.payments.map((p: any) => (
                          <div key={p.id} className="grid grid-cols-12 gap-2 text-xs items-center py-1 border-t border-border/40">
                            <div className="col-span-3">{p.invoice_number}</div>
                            <div className="col-span-3">{formatDate(p.payment_date)}</div>
                            <div className="col-span-2 text-muted-foreground truncate">{p.reference || "—"}</div>
                            <div className="col-span-2 text-right font-mono">{formatCurrency(Number(p.amount), "USD")}</div>
                            <div className={"col-span-2 text-right " + dsoCls(p.days_from_due)}>{dsoLabel(p.days_from_due)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                <div className="col-span-5">Week</div>
                <div className="col-span-2 text-right"># Payments</div>
                <div className="col-span-2 text-right">Customers</div>
                <div className="col-span-3 text-right">Total received</div>
              </div>
              {weeks.map((w) => (
                <div key={w.iso} className="border-b border-border/50">
                  <div onClick={() => w.payments.length && setOpenWeek(openWeek === w.iso ? null : w.iso)}
                    className={"grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center " + (w.payments.length ? "cursor-pointer hover:bg-muted/30" : "") + (w.iso === thisISO ? " bg-primary/5" : "")}>
                    <div className="col-span-5 font-medium">
                      <span className="text-muted-foreground mr-1">{w.payments.length ? (openWeek === w.iso ? "▾" : "▸") : " "}</span>
                      {weekLabel(w.start)}
                      {w.iso === thisISO && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-medium">This week</span>}
                    </div>
                    <div className="col-span-2 text-right">{w.payments.length}</div>
                    <div className="col-span-2 text-right">{w.customers.size}</div>
                    <div className="col-span-3 text-right font-mono font-semibold">{formatCurrency(w.total, "USD")}</div>
                  </div>
                  {openWeek === w.iso && (
                    <div className="bg-muted/20 px-4 py-2">
                      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
                        <div className="col-span-2">Paid on</div>
                        <div className="col-span-2">Invoice</div>
                        <div className="col-span-3">Customer</div>
                        <div className="col-span-2">Reference</div>
                        <div className="col-span-2 text-right">Amount</div>
                        <div className="col-span-1 text-right">vs due</div>
                      </div>
                      {w.payments.map((p: any) => (
                        <div key={p.id} className="grid grid-cols-12 gap-2 text-xs items-center py-1 border-t border-border/40">
                          <div className="col-span-2">{formatDate(p.payment_date)}</div>
                          <div className="col-span-2">{p.invoice_number}</div>
                          <div className="col-span-3 truncate">
                            {p.customer_id ? <Link href={`/customer/${p.customer_id}`} className="text-primary hover:underline">{p.customer_name}</Link> : p.customer_name}
                          </div>
                          <div className="col-span-2 text-muted-foreground truncate">{p.reference || "—"}</div>
                          <div className="col-span-2 text-right font-mono">{formatCurrency(Number(p.amount), "USD")}</div>
                          <div className={"col-span-1 text-right " + dsoCls(p.days_from_due)}>{dsoLabel(p.days_from_due)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
