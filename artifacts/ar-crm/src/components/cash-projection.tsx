import { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAllInvoices } from "@/lib/supabase-hooks";

function fmtCur(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
// Sunday of the week containing d
function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay()); // 0 = Sunday
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

  const { weeks, maxTotal, grand } = useMemo(() => {
    const map = new Map<number, { start: Date; total: number; count: number }>();
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
      if (!map.has(key)) map.set(key, { start: ws, total: 0, count: 0 });
      const b = map.get(key)!;
      b.total += open;
      b.count += 1;
      grand += open;
    });
    const weeks = Array.from(map.values()).sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, 12);
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
            {weeks.map((w) => (
              <div key={w.start.getTime()} className="flex items-center gap-3">
                <div className="w-32 shrink-0 text-xs text-muted-foreground">{fmtRange(w.start)}</div>
                <div className="flex-1 bg-muted/30 rounded h-6 relative overflow-hidden">
                  <div className="h-full bg-primary/70 rounded" style={{ width: maxTotal ? `${Math.max(4, (w.total / maxTotal) * 100)}%` : "0%" }} />
                </div>
                <div className="w-28 shrink-0 text-right text-sm font-mono">{fmtCur(w.total)}</div>
                <div className="w-14 shrink-0 text-right text-xs text-muted-foreground">{w.count} inv</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
