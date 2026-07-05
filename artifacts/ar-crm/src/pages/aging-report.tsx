import { useListInvoices } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AgingBucket = "notDue" | "current" | "od1_30" | "od31_60" | "od61_90" | "od90plus";

interface CustomerRow {
  customerId: string;
  customerName: string;
  buckets: Record<AgingBucket, number>;
  total: number;
}

const BUCKET_LABELS: Record<AgingBucket, string> = {
  notDue: "Not Due",
  current: "Current",
  od1_30: "1–30 Days",
  od31_60: "31–60 Days",
  od61_90: "61–90 Days",
  od90plus: "90+ Days",
};

const BUCKET_COLORS: Record<AgingBucket, string> = {
  notDue: "text-slate-400",
  current: "text-emerald-400",
  od1_30: "text-yellow-400",
  od31_60: "text-orange-400",
  od61_90: "text-red-400",
  od90plus: "text-rose-500",
};

function statusToBucket(status: string): AgingBucket {
  switch (status) {
    case "not_due": return "notDue";
    case "current": return "current";
    case "overdue_1_30": return "od1_30";
    case "overdue_31_60": return "od31_60";
    case "overdue_61_90": return "od61_90";
    default: return "od90plus";
  }
}

const buckets: AgingBucket[] = ["notDue", "current", "od1_30", "od31_60", "od61_90", "od90plus"];

export default function AgingReport() {
  const { data: invoicesData, isLoading } = useListInvoices({ pageSize: 500 });

  const invoices = invoicesData?.invoices ?? [];

  // Build customer rows
  const customerMap = new Map<string, CustomerRow>();
  const totals: Record<AgingBucket, number> & { total: number } = {
    notDue: 0, current: 0, od1_30: 0, od31_60: 0, od61_90: 0, od90plus: 0, total: 0,
  };

  for (const inv of invoices) {
    const outstanding = inv.amount - inv.paidAmount;
    if (outstanding <= 0) continue;
    const bucket = statusToBucket(inv.status);

    if (!customerMap.has(inv.customerId)) {
      customerMap.set(inv.customerId, {
        customerId: inv.customerId,
        customerName: inv.customerName,
        buckets: { notDue: 0, current: 0, od1_30: 0, od31_60: 0, od61_90: 0, od90plus: 0 },
        total: 0,
      });
    }
    const row = customerMap.get(inv.customerId)!;
    row.buckets[bucket] += outstanding;
    row.total += outstanding;
    totals[bucket] += outstanding;
    totals.total += outstanding;
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => b.total - a.total);

  const grandTotalOutstanding = totals.od1_30 + totals.od31_60 + totals.od61_90 + totals.od90plus;

  return (
    <div className="p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AR Aging Report</h1>
          <p className="text-sm text-muted-foreground mt-0.5">As of {formatDate(new Date().toISOString())} — by customer, outstanding balance</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Outstanding</div>
          <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totals.total)}</div>
          <div className="text-xs text-destructive">{formatCurrency(grandTotalOutstanding)} overdue</div>
        </div>
      </div>

      <div className="rounded-md border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-mono uppercase tracking-wider text-xs text-muted-foreground sticky left-0 bg-muted/30 min-w-[200px]">
                Customer
              </th>
              {buckets.map((b) => (
                <th key={b} className={cn("text-right px-4 py-3 font-mono uppercase tracking-wider text-xs min-w-[130px]", BUCKET_COLORS[b])}>
                  {BUCKET_LABELS[b]}
                </th>
              ))}
              <th className="text-right px-4 py-3 font-mono uppercase tracking-wider text-xs text-foreground min-w-[140px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                  {buckets.map((b) => (
                    <td key={b} className="px-4 py-3 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                  ))}
                  <td className="px-4 py-3 text-right"><Skeleton className="h-4 w-24 ml-auto" /></td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-muted-foreground">No outstanding invoices.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.customerId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium sticky left-0 bg-card">{row.customerName}</td>
                  {buckets.map((b) => (
                    <td key={b} className={cn("px-4 py-3 text-right font-mono text-xs", row.buckets[b] > 0 ? BUCKET_COLORS[b] : "text-muted-foreground/30")}>
                      {row.buckets[b] > 0 ? formatCurrency(row.buckets[b]) : "—"}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-semibold text-sm">
                    {formatCurrency(row.total)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {/* Totals row */}
          {!isLoading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-muted/40 font-bold">
                <td className="px-4 py-3 font-semibold uppercase tracking-wider text-xs sticky left-0 bg-muted/40">Grand Total</td>
                {buckets.map((b) => (
                  <td key={b} className={cn("px-4 py-3 text-right font-mono text-sm", totals[b] > 0 ? BUCKET_COLORS[b] : "text-muted-foreground/30")}>
                    {totals[b] > 0 ? formatCurrency(totals[b]) : "—"}
                  </td>
                ))}
                <td className="px-4 py-3 text-right font-mono font-bold text-primary text-sm">
                  {formatCurrency(totals.total)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* % composition bar */}
      {!isLoading && totals.total > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">AR Composition</div>
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {buckets.map((b) => {
              const pct = (totals[b] / totals.total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={b}
                  title={`${BUCKET_LABELS[b]}: ${pct.toFixed(1)}%`}
                  style={{ width: `${pct}%` }}
                  className={cn("h-full transition-all", {
                    "bg-slate-500": b === "notDue",
                    "bg-emerald-500": b === "current",
                    "bg-yellow-500": b === "od1_30",
                    "bg-orange-500": b === "od31_60",
                    "bg-red-500": b === "od61_90",
                    "bg-rose-600": b === "od90plus",
                  })}
                />
              );
            })}
          </div>
          <div className="flex gap-4 flex-wrap mt-1">
            {buckets.map((b) => {
              const pct = (totals[b] / totals.total) * 100;
              if (pct === 0) return null;
              return (
                <div key={b} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className={cn("w-2 h-2 rounded-sm", {
                    "bg-slate-500": b === "notDue",
                    "bg-emerald-500": b === "current",
                    "bg-yellow-500": b === "od1_30",
                    "bg-orange-500": b === "od31_60",
                    "bg-red-500": b === "od61_90",
                    "bg-rose-600": b === "od90plus",
                  })} />
                  {BUCKET_LABELS[b]} ({pct.toFixed(1)}%)
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
