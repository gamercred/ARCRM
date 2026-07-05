import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useGetAnalyst, useGetAnalystSummary, useListInvoices } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoiceDrawer } from "@/components/invoice-drawer";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const agingBuckets = [
  { key: "notDue" as const, label: "Not Due", color: "text-slate-400", bar: "bg-slate-500" },
  { key: "current" as const, label: "Current", color: "text-emerald-400", bar: "bg-emerald-500" },
  { key: "overdue1to30" as const, label: "1–30 d", color: "text-yellow-400", bar: "bg-yellow-500" },
  { key: "overdue31to60" as const, label: "31–60 d", color: "text-orange-400", bar: "bg-orange-500" },
  { key: "overdue61to90" as const, label: "61–90 d", color: "text-red-400", bar: "bg-red-500" },
  { key: "overdue90plus" as const, label: "90+ d", color: "text-rose-500", bar: "bg-rose-600" },
];

export default function AnalystDashboard() {
  const [, params] = useRoute("/analyst/:id");
  const analystId = params?.id ? Number(params.id) : 0;

  const { data: analyst, isLoading: isLoadingAnalyst } = useGetAnalyst(analystId, { query: { enabled: !!analystId } });
  const { data: summary, isLoading: isLoadingSummary } = useGetAnalystSummary(analystId, { query: { enabled: !!analystId } });
  const { data: invoicesData, isLoading: isLoadingInvoices } = useListInvoices({ analystId }, { query: { enabled: !!analystId } });

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const totalOutstanding = summary?.totalOutstanding ?? 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/analysts" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          {isLoadingAnalyst ? <Skeleton className="h-8 w-52" /> : (
            <h1 className="text-2xl font-bold tracking-tight">{analyst?.name}'s Portfolio</h1>
          )}
          <p className="text-sm text-muted-foreground mt-0.5">{analyst?.email}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portfolio Size</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold">{summary?.totalInvoices ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Assigned invoices</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-32" /> : (
              <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalOutstanding)}</div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-red-900/30">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">90+ Days (High Risk)</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-28" /> : (
              <div className="text-2xl font-bold font-mono text-destructive">{formatCurrency(summary?.aging.overdue90plus.amount ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{summary?.aging.overdue90plus.count ?? 0} invoices</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">1–90 Days Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Skeleton className="h-8 w-28" /> : (
              <div className="text-2xl font-bold font-mono text-orange-400">
                {formatCurrency(
                  (summary?.aging.overdue1to30.amount ?? 0) +
                  (summary?.aging.overdue31to60.amount ?? 0) +
                  (summary?.aging.overdue61to90.amount ?? 0)
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {(summary?.aging.overdue1to30.count ?? 0) + (summary?.aging.overdue31to60.count ?? 0) + (summary?.aging.overdue61to90.count ?? 0)} invoices
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging breakdown mini-bars */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portfolio Aging Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
            {agingBuckets.map((b) => {
              const data = summary?.aging[b.key];
              const pct = totalOutstanding > 0 && data ? Math.round((data.amount / totalOutstanding) * 100) : 0;
              return (
                <div key={b.key} className="space-y-1.5">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{b.label}</div>
                  {isLoadingSummary ? <Skeleton className="h-5 w-16" /> : (
                    <>
                      <div className={cn("text-sm font-bold font-mono", b.color)}>
                        {formatCurrency(data?.amount ?? 0)}
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={cn("h-1.5 rounded-full", b.bar)} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground">{data?.count ?? 0} inv · {pct}%</div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invoice Table */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Assigned Invoices</h2>
        <div className="rounded-md border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-border bg-muted/30">
                <TableHead className="font-mono uppercase tracking-wider text-xs">Invoice #</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs">Customer</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs text-right">Amount</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs">Due Date</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs text-center">Days OD</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs">Status</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs">Last Contact</TableHead>
                <TableHead className="font-mono uppercase tracking-wider text-xs">Flags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingInvoices ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoicesData?.invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">No invoices in portfolio.</TableCell>
                </TableRow>
              ) : (
                invoicesData?.invoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                  >
                    <TableCell className="font-mono text-sm">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="font-medium">{invoice.customerName}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{formatCurrency(invoice.amount, invoice.currency)}</TableCell>
                    <TableCell className="text-sm">{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {invoice.overdueDays > 0 ? (
                        <span className={cn(
                          "font-semibold",
                          invoice.overdueDays > 90 ? "text-rose-500" :
                          invoice.overdueDays > 60 ? "text-red-400" :
                          invoice.overdueDays > 30 ? "text-orange-400" : "text-yellow-400"
                        )}>{invoice.overdueDays}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><InvoiceStatusBadge status={invoice.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {invoice.lastContactDate ? formatDate(invoice.lastContactDate) : <span className="italic text-xs">No contact</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {invoice.isDisputed && (
                          <Badge className="bg-amber-500/20 text-amber-400 text-[9px] px-1 py-0 h-4 hover:bg-amber-500/30">DISP</Badge>
                        )}
                        {invoice.ptpDate && (
                          <Badge className="bg-cyan-500/20 text-cyan-400 text-[9px] px-1 py-0 h-4 hover:bg-cyan-500/30">PTP</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <InvoiceDrawer invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />
    </div>
  );
}
