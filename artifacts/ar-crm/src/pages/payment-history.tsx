import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  CalendarDays, Building2, Search, ChevronRight, Copy, X, ArrowDownLeft, History, Clock, CheckCircle2, Plus,
} from "lucide-react";
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
function money(n: number): string {
  return formatCurrency(n, "USD");
}
function dsoText(d: number | null | undefined): string {
  if (d === null || d === undefined) return "—";
  if (d > 0) return d + "d late";
  if (d < 0) return Math.abs(d) + "d early";
  return "On time";
}
function dsoTone(d: number | null | undefined): string {
  if (d === null || d === undefined) return "text-muted-foreground";
  if (d > 15) return "text-red-700";
  if (d > 0) return "text-amber-700";
  return "text-emerald-700";
}
function DelayBadge({ d }: { d: number | null | undefined }) {
  if (d === null || d === undefined) return <span className="text-muted-foreground">—</span>;
  const cls = d > 15
    ? "bg-red-50 text-red-700 border-red-200"
    : d > 0
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return <span className={"inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium " + cls}>{dsoText(d)}</span>;
}
const TILE_COLORS = [
  "bg-orange-100 text-orange-700", "bg-blue-100 text-blue-700", "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700", "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
];
function initials(name: string): string {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}
function tileColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

export default function PaymentHistory() {
  const [view, setView] = useState<"week" | "customer">("week");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([toISO(weekStart(new Date()))]));
  const [openCust, setOpenCust] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<any | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: drawerContact } = useQuery({
    queryKey: ["drawer-contact", drawer?.customer_id],
    enabled: !!drawer?.customer_id,
    queryFn: async () => {
      const { data } = await supabase.from("customer_contacts").select("email, name")
        .eq("customer_id", String(drawer.customer_id)).order("is_primary", { ascending: false }).limit(1).maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setDrawer(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }
  function copyRef(ref: string) {
    navigator.clipboard?.writeText(ref).then(() => showToast(`Copied reference "${ref}"`)).catch(() => showToast("Copy failed"));
  }

  const all = Array.isArray(payments) ? payments : [];
  const q = search.trim().toLowerCase();
  const filtered = q
    ? all.filter((p: any) => (String(p.customer_name || "") + " " + String(p.customer_id || "") + " " + String(p.invoice_number || "") + " " + String(p.reference || "")).toLowerCase().includes(q))
    : all;

  const thisWeek = weekStart(new Date());
  const thisISO = toISO(thisWeek);
  const lastISO = toISO(addDays(thisWeek, -7));

  // ---------- weeks ----------
  const weeks = useMemo(() => {
    const m = new Map<string, { iso: string; start: Date; payments: any[]; total: number; customers: Set<string> }>();
    if (!q) m.set(thisISO, { iso: thisISO, start: thisWeek, payments: [], total: 0, customers: new Set() });
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
    list.forEach((w) => w.payments.sort((a: any, b: any) => (a.payment_date < b.payment_date ? 1 : -1)));
    return list;
  }, [payments, search]);

  // ---------- customers ----------
  const customerStats = (rows: any[]) => {
    const m = new Map<string, { key: string; id: any; name: string; payments: any[] }>();
    rows.forEach((p: any) => {
      const key = String(p.customer_id || p.customer_name || "—");
      if (!m.has(key)) m.set(key, { key, id: p.customer_id, name: p.customer_name || key, payments: [] });
      m.get(key)!.payments.push(p);
    });
    return Array.from(m.values()).map((c) => {
      const timed = c.payments.filter((p) => p.days_from_due !== null && p.days_from_due !== undefined);
      const avgDso = timed.length ? Math.round(timed.reduce((s, p) => s + p.days_from_due, 0) / timed.length) : null;
      const total = c.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
      return { ...c, avgDso, total, count: c.payments.length };
    });
  };
  const customers = useMemo(
    () => customerStats(filtered).sort((a, b) => (b.avgDso ?? -9999) - (a.avgDso ?? -9999)),
    [payments, search],
  );
  const allCustomers = useMemo(() => customerStats(all), [payments]);

  // ---------- KPI cards ----------
  const weekPays = (iso: string) => all.filter((p: any) => p.payment_date && toISO(weekStart(fromISO(p.payment_date))) === iso);
  const thisWeekPays = weekPays(thisISO);
  const lastWeekPays = weekPays(lastISO);
  const thisWeekTotal = thisWeekPays.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const lastWeekTotal = lastWeekPays.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const timedAll = all.filter((p: any) => p.days_from_due !== null && p.days_from_due !== undefined);
  const portfolioDso = timedAll.length ? Math.round(timedAll.reduce((s: number, p: any) => s + p.days_from_due, 0) / timedAll.length) : null;
  const slowest = allCustomers.filter((c) => c.avgDso !== null).sort((a, b) => (b.avgDso as number) - (a.avgDso as number))[0];
  const onTimeCount = timedAll.filter((p: any) => p.days_from_due <= 0).length;
  const onTimeRate = timedAll.length ? Math.round((onTimeCount / timedAll.length) * 100) : null;
  const filteredTotal = filtered.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  // drawer details
  const drawerCust = drawer ? allCustomers.find((c) => c.key === String(drawer.customer_id || drawer.customer_name || "—")) : null;
  const drawerDue = drawer && drawer.payment_date && drawer.days_from_due !== null && drawer.days_from_due !== undefined
    ? toISO(addDays(fromISO(drawer.payment_date), -Number(drawer.days_from_due)))
    : null;

  const isOpen = (iso: string) => (q ? true : expanded.has(iso));
  function toggleWeek(iso: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(iso)) n.delete(iso); else n.add(iso);
      return n;
    });
  }
  const allOpen = weeks.length > 0 && weeks.every((w) => expanded.has(w.iso));
  function toggleAll() {
    setExpanded(allOpen ? new Set() : new Set(weeks.map((w) => w.iso)));
  }

  const segBtn = (active: boolean) =>
    "px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all " +
    (active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
          <p className="text-sm text-muted-foreground mt-1">Every payment recorded in Cash application — by week or by customer.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-muted p-0.5 rounded-lg flex items-center border border-border">
            <button onClick={() => setView("week")} className={segBtn(view === "week")}><CalendarDays className="w-3.5 h-3.5" />By week</button>
            <button onClick={() => setView("customer")} className={segBtn(view === "customer")}><Building2 className="w-3.5 h-3.5" />By customer</button>
          </div>
          <Link href="/cash-application" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90">
            <Plus className="w-3.5 h-3.5" />Record payment
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received this week</span>
            <span className="p-1 rounded bg-primary/10 text-primary"><ArrowDownLeft className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-2xl font-semibold font-mono tracking-tight">{money(thisWeekTotal)}</div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border text-[11px]">
            <span className={thisWeekPays.length ? "text-emerald-700 font-medium" : "text-muted-foreground"}>
              {thisWeekPays.length ? `${thisWeekPays.length} payment${thisWeekPays.length === 1 ? "" : "s"} recorded` : "No payments yet"}
            </span>
            <span className="text-muted-foreground font-mono">{weekLabel(thisWeek)}</span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Received prior week</span>
            <span className="p-1 rounded bg-muted text-muted-foreground"><History className="w-3.5 h-3.5" /></span>
          </div>
          <div className={"text-2xl font-semibold font-mono tracking-tight " + (lastWeekTotal ? "" : "text-muted-foreground")}>{money(lastWeekTotal)}</div>
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border text-[11px]">
            <span className="text-muted-foreground">
              {lastWeekPays.length ? `${lastWeekPays.length} payment${lastWeekPays.length === 1 ? "" : "s"} recorded` : "No payments recorded"}
            </span>
            <span className="text-muted-foreground font-mono">{weekLabel(addDays(thisWeek, -7))}</span>
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Portfolio avg DSO</span>
            {portfolioDso !== null && portfolioDso > 15
              ? <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Attention</span>
              : <span className="p-1 rounded bg-muted text-muted-foreground"><Clock className="w-3.5 h-3.5" /></span>}
          </div>
          <div className="flex items-baseline gap-2">
            <span className={"text-2xl font-semibold font-mono tracking-tight " + dsoTone(portfolioDso)}>{dsoText(portfolioDso)}</span>
            <span className="text-xs text-muted-foreground">vs due date</span>
          </div>
          <div className="mt-2.5 pt-2 border-t border-border text-[11px] text-muted-foreground truncate">
            {slowest && slowest.avgDso !== null && slowest.avgDso > 0
              ? <>Slowest payer: <strong className="text-foreground">{dsoText(slowest.avgDso)}</strong> ({slowest.name})</>
              : "No late payers so far"}
          </div>
        </div>

        <div className="bg-card p-4 rounded-xl border border-border">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">On-time rate</span>
            <span className="p-1 rounded bg-emerald-50 text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /></span>
          </div>
          <div className="text-2xl font-semibold font-mono tracking-tight">{onTimeRate === null ? "—" : onTimeRate + "%"}</div>
          <div className="mt-2.5 pt-2 border-t border-border text-[11px] text-muted-foreground">
            {timedAll.length ? `${onTimeCount} of ${timedAll.length} payments on or before due date` : "No payments with a due date yet"}
          </div>
        </div>
      </div>

      {/* Main table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-3.5 border-b border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by customer, invoice # or reference…"
                className="w-full bg-background pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            {view === "week" && (
              <button onClick={toggleAll} className="shrink-0 text-xs bg-background border border-border px-2.5 py-1.5 rounded-lg hover:bg-muted/40">
                {allOpen ? "Collapse all" : "Expand all"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-[11px] text-muted-foreground">Total received{q ? " (filtered)" : ""}:</span>
            <span className="text-xs font-mono font-medium bg-muted px-2 py-0.5 rounded border border-border">{money(filteredTotal)}</span>
          </div>
        </div>

        {isLoading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : view === "week" ? (
          <div className="text-xs">
            <div className="grid grid-cols-12 px-5 py-2.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              <div className="col-span-5">Week / payment</div>
              <div className="col-span-2 text-right">Payments</div>
              <div className="col-span-2 text-right">Customers</div>
              <div className="col-span-3 text-right">Total received</div>
            </div>
            {weeks.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No payments match your search.</p>}
            {weeks.map((w) => {
              const open = isOpen(w.iso);
              return (
                <div key={w.iso} className="border-b border-border/70">
                  <div onClick={() => toggleWeek(w.iso)} className={"grid grid-cols-12 px-5 py-3 items-center cursor-pointer select-none hover:bg-muted/30 " + (w.iso === thisISO ? "bg-primary/5" : "")}>
                    <div className="col-span-5 flex items-center gap-2.5">
                      <ChevronRight className={"w-4 h-4 text-muted-foreground transition-transform " + (open ? "rotate-90" : "")} />
                      <span className="font-semibold text-sm">{weekLabel(w.start)}</span>
                      {w.iso === thisISO && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">This week</span>}
                    </div>
                    <div className="col-span-2 text-right font-mono">{w.payments.length}</div>
                    <div className="col-span-2 text-right font-mono">{w.customers.size}</div>
                    <div className="col-span-3 text-right font-mono font-semibold text-sm">{money(w.total)}</div>
                  </div>
                  {open && (
                    <div className="bg-muted/20 border-t border-border/50">
                      {w.payments.length === 0 ? (
                        <p className="px-6 py-3 text-muted-foreground">No payments recorded yet this week.</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-12 px-6 py-2 text-[10px] uppercase font-semibold text-muted-foreground tracking-wider border-b border-border/50">
                            <div className="col-span-2">Paid on</div>
                            <div className="col-span-2">Invoice #</div>
                            <div className="col-span-3">Customer</div>
                            <div className="col-span-2">Reference</div>
                            <div className="col-span-2 text-right">Amount</div>
                            <div className="col-span-1 text-right">Vs due</div>
                          </div>
                          {w.payments.map((p: any) => (
                            <div key={p.id} className="grid grid-cols-12 px-6 py-2.5 items-center border-b border-border/40 last:border-0 hover:bg-primary/5">
                              <div className="col-span-2 font-mono text-muted-foreground">{formatDate(p.payment_date)}</div>
                              <div className="col-span-2">
                                <button onClick={() => setDrawer(p)} className="font-mono text-primary font-medium hover:underline">{p.invoice_number}</button>
                              </div>
                              <div className="col-span-3 truncate">
                                {p.customer_id
                                  ? <Link href={`/customer/${p.customer_id}`} className="font-medium hover:text-primary">{p.customer_name}</Link>
                                  : <span className="font-medium">{p.customer_name}</span>}
                              </div>
                              <div className="col-span-2 font-mono text-muted-foreground text-[11px] flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{p.reference || "—"}</span>
                                {p.reference && <Copy onClick={() => copyRef(p.reference)} className="w-3 h-3 shrink-0 cursor-pointer opacity-40 hover:opacity-100" />}
                              </div>
                              <div className="col-span-2 text-right font-mono font-medium">{money(Number(p.amount))}</div>
                              <div className="col-span-1 text-right"><DelayBadge d={p.days_from_due} /></div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-xs">
            <div className="grid grid-cols-12 px-5 py-2.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">
              <div className="col-span-4">Customer</div>
              <div className="col-span-2 text-right">Lifetime received</div>
              <div className="col-span-2 text-right">Avg DSO</div>
              <div className="col-span-2 text-right">Payments</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            {customers.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>}
            {customers.map((c) => (
              <div key={c.key} className="border-b border-border/70">
                <div onClick={() => setOpenCust(openCust === c.key ? null : c.key)} className="grid grid-cols-12 px-5 py-3 items-center cursor-pointer hover:bg-muted/30">
                  <div className="col-span-4 flex items-center gap-3 min-w-0">
                    <div className={"w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 " + tileColor(c.key)}>{initials(c.name)}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.id ? "ID " + c.id : "—"}</div>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-mono font-semibold text-sm">{money(c.total)}</div>
                  <div className="col-span-2 text-right"><DelayBadge d={c.avgDso} /></div>
                  <div className="col-span-2 text-right font-mono">{c.count}</div>
                  <div className="col-span-2 text-right">
                    {c.id && (
                      <Link href={`/customer/${c.id}`} onClick={(e: any) => e.stopPropagation()}
                        className="px-2.5 py-1 text-xs font-medium text-primary border border-primary/30 rounded-md hover:bg-primary hover:text-primary-foreground">
                        View profile
                      </Link>
                    )}
                  </div>
                </div>
                {openCust === c.key && (
                  <div className="bg-muted/20 border-t border-border/50">
                    {c.payments.map((p: any) => (
                      <div key={p.id} className="grid grid-cols-12 px-6 py-2 items-center border-b border-border/40 last:border-0">
                        <div className="col-span-3 font-mono text-muted-foreground">{formatDate(p.payment_date)}</div>
                        <div className="col-span-3"><button onClick={() => setDrawer(p)} className="font-mono text-primary hover:underline">{p.invoice_number}</button></div>
                        <div className="col-span-2 font-mono text-muted-foreground truncate">{p.reference || "—"}</div>
                        <div className="col-span-2 text-right font-mono">{money(Number(p.amount))}</div>
                        <div className="col-span-2 text-right"><DelayBadge d={p.days_from_due} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="px-5 py-3 bg-muted/20 border-t border-border text-xs text-muted-foreground">
          {view === "week"
            ? <>Showing <strong className="text-foreground">{weeks.length} week{weeks.length === 1 ? "" : "s"}</strong> · {filtered.length} payment{filtered.length === 1 ? "" : "s"}</>
            : <>Showing <strong className="text-foreground">{customers.length} customer{customers.length === 1 ? "" : "s"}</strong> · {filtered.length} payment{filtered.length === 1 ? "" : "s"}</>}
        </div>
      </div>

      {/* Slide-out drawer */}
      {drawer && (
        <>
          <div onClick={() => setDrawer(null)} className="fixed inset-0 bg-black/20 z-40" />
          <aside className="fixed top-0 right-0 h-full w-full max-w-lg bg-card border-l border-border shadow-2xl z-50 flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded bg-primary/10 text-primary flex items-center justify-center font-mono font-semibold text-xs border border-primary/20">AR</div>
                <div>
                  <h3 className="text-sm font-bold font-mono">{drawer.invoice_number}</h3>
                  <p className="text-xs text-muted-foreground">{drawer.customer_name}</p>
                </div>
              </div>
              <button onClick={() => setDrawer(null)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              <div className="bg-muted/30 border border-border rounded-xl p-4">
                <div className="flex items-center justify-between text-muted-foreground mb-1">
                  <span>Payment amount</span>
                  <DelayBadge d={drawer.days_from_due} />
                </div>
                <div className="text-3xl font-bold font-mono">{money(Number(drawer.amount))}</div>
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Recorded in Cash application
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Payment details</h4>
                <dl className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  <div className="flex justify-between p-2.5"><dt className="text-muted-foreground">Paid on</dt><dd className="font-mono">{formatDate(drawer.payment_date)}</dd></div>
                  <div className="flex justify-between p-2.5 bg-muted/20"><dt className="text-muted-foreground">Invoice due date</dt><dd className="font-mono">{drawerDue ? formatDate(drawerDue) : "—"}</dd></div>
                  <div className="flex justify-between p-2.5">
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-mono flex items-center gap-1.5">
                      {drawer.reference || "—"}
                      {drawer.reference && <Copy onClick={() => copyRef(drawer.reference)} className="w-3 h-3 cursor-pointer opacity-50 hover:opacity-100" />}
                    </dd>
                  </div>
                  <div className="flex justify-between p-2.5 bg-muted/20"><dt className="text-muted-foreground">Vs due date</dt><dd className={"font-mono " + dsoTone(drawer.days_from_due)}>{dsoText(drawer.days_from_due)}</dd></div>
                </dl>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Customer snapshot</h4>
                  {drawer.customer_id && <Link href={`/customer/${drawer.customer_id}`} className="text-[11px] font-medium text-primary hover:underline">Open profile</Link>}
                </div>
                <div className="p-3.5 rounded-lg border border-border space-y-2.5">
                  <div className="flex justify-between"><span className="text-muted-foreground">Primary AP contact</span><span className="font-medium">{drawerContact?.email || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Average DSO</span><span className={"font-medium " + dsoTone(drawerCust?.avgDso)}>{dsoText(drawerCust?.avgDso)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Payments recorded</span><span className="font-mono">{drawerCust?.count ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Lifetime received</span><span className="font-mono">{money(drawerCust?.total ?? 0)}</span></div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Audit trail</h4>
                <div className="space-y-3 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
                  <div className="relative">
                    <span className="absolute -left-6 top-1 w-2 h-2 rounded-full bg-emerald-500" />
                    <p className="font-medium">Payment recorded against <span className="font-mono">{drawer.invoice_number}</span></p>
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {drawer.created_at ? new Date(drawer.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                      {drawer.author ? " by " + drawer.author : ""}
                    </p>
                  </div>
                  {drawerDue && (
                    <div className="relative">
                      <span className="absolute -left-6 top-1 w-2 h-2 rounded-full bg-amber-400" />
                      <p className="font-medium">Invoice due</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{formatDate(drawerDue)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border bg-muted/20 flex items-center gap-3">
              {drawer.customer_id && (
                <Link href={`/customer/${drawer.customer_id}`} className="flex-1 py-2 px-3 text-xs font-medium text-center bg-primary text-primary-foreground rounded-lg hover:opacity-90">
                  Open customer profile
                </Link>
              )}
              <button onClick={() => setDrawer(null)} className="flex-1 py-2 px-3 text-xs font-medium border border-border rounded-lg hover:bg-muted/40">Close</button>
            </div>
          </aside>
        </>
      )}

      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-foreground text-background px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium">{toast}</div>
      )}
    </div>
  );
}
