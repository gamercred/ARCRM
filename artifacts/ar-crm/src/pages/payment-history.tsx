import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/format";

export default function PaymentHistory() {
  const [search, setSearch] = useState("");
  const [openCust, setOpenCust] = useState<string | null>(null);

  const { data: payments, isLoading } = useQuery({
    queryKey: ["all-payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const all = Array.isArray(payments) ? payments : [];

  // group by customer
  const customers = useMemo(() => {
    const m = new Map<string, { key: string; name: string; payments: any[] }>();
    all.forEach((p: any) => {
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
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => (r.name + " " + r.key).toLowerCase().includes(q)) : rows;
    // sort worst payers (highest avg DSO) first, nulls last
    return filtered.sort((a, b) => (b.avgDso ?? -9999) - (a.avgDso ?? -9999));
  }, [payments, search]);

  function dsoCls(d: number | null) {
    if (d === null) return "text-muted-foreground";
    if (d > 15) return "text-red-700";
    if (d > 0) return "text-orange-700";
    return "text-emerald-700";
  }
  function dsoLabel(d: number | null) {
    if (d === null) return "—";
    if (d > 0) return d + "d late";
    if (d < 0) return Math.abs(d) + "d early";
    return "on time";
  }

  // portfolio-wide average
  const timedAll = all.filter((p: any) => p.days_from_due !== null && p.days_from_due !== undefined);
  const portfolioDso = timedAll.length ? Math.round(timedAll.reduce((s: number, p: any) => s + p.days_from_due, 0) / timedAll.length) : null;

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payment history</h1>
          <p className="text-sm text-muted-foreground mt-1">Every customer's payment behaviour and average DSO, built from recorded payments.</p>
        </div>
        {portfolioDso !== null && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Portfolio avg DSO</div>
            <div className={"text-2xl font-bold " + dsoCls(portfolioDso)}>{dsoLabel(portfolioDso)}</div>
          </div>
        )}
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Customers</CardTitle>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer…" className="bg-background border border-border rounded px-2 py-1 text-xs w-48" />
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-muted-foreground text-sm">Loading…</p>
          ) : customers.length === 0 ? (
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
                    <div className="col-span-4 font-medium truncate">
                      <span className="text-muted-foreground mr-1">{openCust === c.key ? "▾" : "▸"}</span>{c.name}
                    </div>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
