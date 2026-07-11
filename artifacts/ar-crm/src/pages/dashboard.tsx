import { useState } from "react";
import { ImportArButton } from "@/components/import-ar-button";
import { AnalystPicker } from "@/components/analyst-picker";
import { StatusCell } from "@/components/status-cell";
import { CommentHistoryCell } from "@/components/comment-history-cell";
import { ColumnFilter } from "@/components/column-filter";
import { ActualStageCell } from "@/components/actual-stage-cell";
import { useGetDashboardSummary, useGetDashboardAging, useListInvoices, ListInvoicesStatus, useListAnalysts } from "@/lib/supabase-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceDrawer } from "@/components/invoice-drawer";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Clock, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function KpiCard({ label, value, sub, color, icon: Icon }: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  color?: string;
  icon?: React.ElementType;
}) {
  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</CardTitle>
        {Icon && <Icon className={cn("w-4 h-4", color ?? "text-muted-foreground")} />}
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold font-mono", color)}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: aging, isLoading: isLoadingAging } = useGetDashboardAging();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ListInvoicesStatus | "all">("all");
  const [analystId, setAnalystId] = useState<string>("all");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [capsuleFilter, setCapsuleFilter] = useState<string | null>(null);

  const { data: invoicesData, isLoading: isLoadingInvoices } = useListInvoices({
    search: search || undefined,
    status: status !== "all" ? status as ListInvoicesStatus : undefined,
    analystId: analystId !== "all" ? Number(analystId) : undefined,
    pageSize: 100000,
  });

  const { data: analysts } = useListAnalysts();

  const COLS: { key: string; label: string; get: (i: any) => any }[] = [
    { key: "customerId", label: "Customer ID", get: (i) => i.customerId },
    { key: "customerName", label: "Customer Name", get: (i) => i.customerName },
    { key: "invoiceNumber", label: "Invoice #", get: (i) => i.invoiceNumber },
    { key: "issueDate", label: "Invoice Date", get: (i) => formatDate(i.issueDate) },
    { key: "dueDate", label: "Due Date", get: (i) => formatDate(i.dueDate) },
    { key: "txnCurrency", label: "Txn Ccy", get: (i) => i.txnCurrency },
    { key: "txnAmount", label: "Txn Amount", get: (i) => i.txnAmount },
    { key: "daysAged", label: "Days Aged", get: (i) => i.daysAged },
    { key: "amount", label: "Total Open (USD)", get: (i) => i.amount },
    { key: "analystName", label: "Collector", get: (i) => i.analystName },
    { key: "category", label: "Category", get: (i) => i.category },
    { key: "invoiceStage", label: "Invoice Stage", get: (i) => i.invoiceStage },
    { key: "actualInvoiceStage", label: "Actual Invoice Stage", get: (i) => i.actualInvoiceStage },
    { key: "manualStatus", label: "Status", get: (i) => i.manualStatus },
    { key: "comments", label: "Comments", get: (i) => i.comments },
  ];
  const rawInvoices = invoicesData?.invoices ?? [];
  const distinctVals: Record<string, string[]> = {};
  for (const c of COLS) {
    const set = new Set<string>();
    for (const inv of rawInvoices) set.add(String(c.get(inv) ?? ""));
    distinctVals[c.key] = Array.from(set).sort();
  }
  const CAPSULE_STATUSES: Record<string, string[]> = {
    disputed: ["PO Issue", "Billing Issue", "Disputed Billing"],
    ptp: ["P2P (Promise to Pay)", "In-Transit Payment"],
    intransit: ["In-Transit Payment"],
  };
  const filteredInvoices = rawInvoices.filter((inv: any) => {
    const colOk = COLS.every((c) => {
      const f = colFilters[c.key] || "";
      return !f || String(c.get(inv) ?? "") === f;
    });
    if (!colOk) return false;
    if (capsuleFilter) {
      const set = CAPSULE_STATUSES[capsuleFilter] || [];
      if (!set.includes(String(inv.manualStatus ?? ""))) return false;
    }
    return true;
  });
  const sortedInvoices = [...filteredInvoices];
  if (sort && (sort.key === "daysAged" || sort.key === "amount")) {
    const col = COLS.find((c) => c.key === sort.key);
    if (col) {
      sortedInvoices.sort((a, b) => {
        const av = Number(col.get(a) ?? 0);
        const bv = Number(col.get(b) ?? 0);
        return sort.dir === "asc" ? av - bv : bv - av;
      });
    }
  }

  const totalAr = summary?.totalOutstanding ?? 0;

  const agingBuckets = [
    { label: "Not Due", data: aging?.notDue, color: "text-slate-400", bar: "bg-slate-500" },
    { label: "Current", data: aging?.current, color: "text-emerald-400", bar: "bg-emerald-500" },
    { label: "1–30 Days", data: aging?.overdue1to30, color: "text-yellow-400", bar: "bg-yellow-500" },
    { label: "31–60 Days", data: aging?.overdue31to60, color: "text-orange-400", bar: "bg-orange-500" },
    { label: "61–90 Days", data: aging?.overdue61to90, color: "text-red-400", bar: "bg-red-500" },
    { label: "90+ Days", data: aging?.overdue90plus, color: "text-rose-500", bar: "bg-rose-600" },
  ];

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">AR Dashboard</h1>
        <div className="flex items-center gap-3">
          <AnalystPicker />
          <ImportArButton />
          <div className="text-xs text-muted-foreground">
            As of {formatDate(new Date().toISOString())}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Outstanding"
          value={isLoadingSummary ? <Skeleton className="h-7 w-28" /> : formatCurrency(summary?.totalOutstanding ?? 0)}
          sub={`${summary?.totalInvoices ?? 0} open invoices`}
          color="text-primary"
        />
        <KpiCard
          label="Overdue AR"
          value={isLoadingSummary ? <Skeleton className="h-7 w-28" /> : formatCurrency(summary?.overdueAmount ?? 0)}
          sub={`${summary?.overdueCount ?? 0} invoices past due`}
          color="text-destructive"
          icon={TrendingDown}
        />
        <KpiCard
          label="DSO"
          value={isLoadingSummary ? <Skeleton className="h-7 w-16" /> : `${summary?.dso ?? 0} days`}
          sub="Days Sales Outstanding"
          color={summary && summary.dso > 45 ? "text-orange-400" : "text-emerald-400"}
          icon={Clock}
        />
        <div className="grid grid-cols-2 gap-2 col-span-2 lg:col-span-1">
          <Card onClick={() => setCapsuleFilter(capsuleFilter === "disputed" ? null : "disputed")} className={"bg-card cursor-pointer transition " + (capsuleFilter === "disputed" ? "ring-2 ring-amber-400" : "hover:bg-muted/40")}>
            <CardContent className="p-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Disputed
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                {isLoadingSummary ? <Skeleton className="h-5 w-12" /> : summary?.disputedCount ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{isLoadingSummary ? "—" : formatCurrency(summary?.disputedAmount ?? 0)}</div>
            </CardContent>
          </Card>
          <Card onClick={() => setCapsuleFilter(capsuleFilter === "ptp" ? null : "ptp")} className={"bg-card cursor-pointer transition " + (capsuleFilter === "ptp" ? "ring-2 ring-cyan-400" : "hover:bg-muted/40")}>
            <CardContent className="p-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <FileCheck className="w-3 h-3 text-cyan-400" /> PTP / In-Transit
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                {isLoadingSummary ? <Skeleton className="h-5 w-12" /> : (summary?.ptpCount ?? 0) + (summary?.inTransitCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{isLoadingSummary ? "—" : formatCurrency((summary?.ptpAmount ?? 0) + (summary?.inTransitAmount ?? 0))}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Aging Breakdown */}
      <Card className="bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AR Aging Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {agingBuckets.map((bucket) => {
              const pct = totalAr > 0 && bucket.data ? Math.round((bucket.data.amount / totalAr) * 100) : 0;
              return (
                <div key={bucket.label} className="space-y-2">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{bucket.label}</div>
                  {isLoadingAging ? (
                    <Skeleton className="h-5 w-20" />
                  ) : (
                    <>
                      <div className={cn("text-base font-bold font-mono", bucket.color)}>
                        {formatCurrency(bucket.data?.amount ?? 0)}
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full transition-all", bucket.bar)} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{bucket.data?.count ?? 0} inv</span>
                        <span>{pct}%</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center bg-card p-3 rounded-lg border border-border">
        <Input
          placeholder="Search invoices or customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-background"
        />
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[150px] bg-background">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="not_due">Not Due</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="overdue_1_30">1–30 Days</SelectItem>
              <SelectItem value="overdue_31_60">31–60 Days</SelectItem>
              <SelectItem value="overdue_61_90">61–90 Days</SelectItem>
              <SelectItem value="overdue_90_plus">90+ Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={analystId} onValueChange={setAnalystId}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Analyst" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Analysts</SelectItem>
              {analysts?.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(search || status !== "all" || analystId !== "all") && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(""); setStatus("all"); setAnalystId("all"); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Invoice Table */}
      <div className="w-full">
        <Table className="table-fixed w-full text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b-border bg-muted/30">
              {COLS.map((c) => (
                <TableHead key={c.key} className="text-sm font-semibold p-2">
                  <div className="flex items-center gap-1">
                    <ColumnFilter
                      label={c.label}
                      values={distinctVals[c.key] || []}
                      value={colFilters[c.key] || ""}
                      onChange={(v) => setColFilters((prev) => ({ ...prev, [c.key]: v }))}
                    />
                    {(c.key === "daysAged" || c.key === "amount") && (
                      <button
                        onClick={() =>
                          setSort((prev) =>
                            prev && prev.key === c.key
                              ? { key: c.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                              : { key: c.key, dir: "asc" },
                          )
                        }
                        className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                        title="Sort"
                      >
                        {sort && sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                      </button>
                    )}
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoadingInvoices ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 15 }).map((_, j) => (
                    <TableCell key={j} className="p-2"><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-10 text-muted-foreground">No invoices found.</TableCell>
              </TableRow>
            ) : (
              sortedInvoices.map((invoice: any) => (
                <TableRow key={invoice.id} className="hover:bg-muted/40 transition-colors align-top">
                  <TableCell className="text-sm p-2 break-words">{invoice.customerId}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.customerName}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.invoiceNumber}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{formatDate(invoice.issueDate)}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{formatDate(invoice.dueDate)}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.txnCurrency ?? "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.txnAmount != null ? invoice.txnAmount.toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.daysAged ?? "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{formatCurrency(invoice.amount, "USD")}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.analystName ?? "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.category ?? "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{invoice.invoiceStage || "—"}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{<ActualStageCell invoice={invoice} editable={false} />}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{<StatusCell invoice={invoice} editable={false} />}</TableCell>
                  <TableCell className="text-sm p-2 break-words">{<CommentHistoryCell invoice={invoice} editable={false} />}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {invoicesData && (
        <div className="text-xs text-muted-foreground text-right">
          Showing {filteredInvoices.length} of {invoicesData.total} invoices
        </div>
      )}

      <InvoiceDrawer invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />
    </div>
  );
}
