import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAllInvoices } from "@/lib/supabase-hooks";

function fmtCur(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}
function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}
function fmtRange(start: Date): string {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const m = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short" });
  return `${start.getDate()} ${m(start)} – ${end.getDate()} ${m(end)}`;
}

export function CashProjection() {
  const { data: invoices, isLoading } = useAllInvoices();
  const [openWeek, setOpenWeek] = useState<number | null>(null);

  const { weeks, maxTotal, grand } = useMemo(() => {
    const map = new Map<number, { start: Date; total: number; count: number; items: any[] }>();
    let grand = 0;
    (Array.isArray(invoices) ? invoices : []).forEach((inv: any) => {
      const iso = inv.expectedPaymentDate;
      if (!iso) return;
      const open = (inv.amount ?? 0) - (inv.paidAmount ?? 0);
      if (open <= 0) return;
      const d = new Date(iso + "T00:00:00");
      if (isNaN(d.getTime())) return;
      const ws = weekStart(d);
      const key = ws.getTime();
      if (!map.has(key)) map.set(key, { start: ws, total: 0, count: 0, items: [] });
      const b = map.get(key)!;
      b.total += open;
      b.count += 1;
      b.items.push({ ...inv, open });
      grand += open;
    });
    const weeks = Array.from(map.values())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 12);
    weeks.forEach((w) => w.items.sort((a, b) => (a.expectedPaymentDate < b.expectedPaymentDate ? -1 : 1)));
    const maxTotal = weeks.reduce((m, w) => Math.max(m, w.total), 0);
    return { weeks, maxTotal, grand };
  }, [invoices]);

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Projected Cash Inflow — Weekly
        </CardTitle>
        <span className="text-xs text-muted-foreground">Next 12 weeks · {fmtCur(grand)} expected</span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No expected payment dates yet.</p>
        ) : (
          <div className="space-y-2">
            {weeks.map((w) => {
              const key = w.start.getTime();
              const isOpen = openWeek === key;
              return (
                <div key={key} className="rounded">
                  <div
                    onClick={() => setOpenWeek(isOpen ? null : key)}
                    className={"flex items-center gap-3 cursor-pointer rounded px-1 py-0.5 transition " + (isOpen ? "bg-muted/40" : "hover:bg-muted/30")}
                  >
                    <div className="w-4 shrink-0 text-xs text-muted-foreground">{isOpen ? "▾" : "▸"}</div>
                    <div className="w-32 shrink-0 text-xs text-muted-foreground">{fmtRange(w.start)}</div>
                    <div className="flex-1 bg-muted/30 rounded h-6 relative overflow-hidden">
                      <div className="h-full bg-primary/70 rounded" style={{ width: maxTotal ? `${Math.max(4, (w.total / maxTotal) * 100)}%` : "0%" }} />
                    </div>
                    <div className="w-28 shrink-0 text-right text-sm font-mono">{fmtCur(w.total)}</div>
                    <div className="w-14 shrink-0 text-right text-xs text-muted-foreground">{w.count} inv</div>
                  </div>

                  {isOpen && (
                    <div className="ml-7 mt-1 mb-2 border-l border-border pl-3 space-y-1">
                      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
                        <div className="col-span-4">Customer</div>
                        <div className="col-span-3">Invoice #</div>
                        <div className="col-span-2">Exp. Date</div>
                        <div className="col-span-3 text-right">Open (USD)</div>
                      </div>
                      {w.items.map((it: any) => (
                        <div key={it.id} className="grid grid-cols-12 gap-2 text-xs items-center">
                          <div className="col-span-4 truncate">
                            <Link href={`/customer/${it.customerId}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                              {it.customerName}
                            </Link>
                          </div>
                          <div className="col-span-3 truncate">{it.invoiceNumber}</div>
                          <div className="col-span-2 text-muted-foreground">{fmtUS(it.expectedPaymentDate)}</div>
                          <div className="col-span-3 text-right font-mono">{fmtCur(it.open)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
