import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useListInvoices, useListAnalysts } from "@/lib/supabase-hooks";
import { StatusCell } from "@/components/status-cell";
import { ActualStageCell } from "@/components/actual-stage-cell";
import { CommentsCell } from "@/components/comments-cell";

export default function AnalystDashboard() {
  const [, params] = useRoute("/analyst/:id");
  const analystId = params?.id ? Number(params.id) : 0;

  const { data: analysts } = useListAnalysts();
  const analyst = analysts?.find((a: any) => a.id === analystId);

  const { data: invoicesData, isLoading } = useListInvoices({ analystId, pageSize: 100000 });
  const invoices = invoicesData?.invoices ?? [];

  const totalOutstanding = invoices.reduce((sum: number, i: any) => {
    const out = Number(i.amount) - Number(i.paidAmount ?? 0);
    return sum + (out > 0 ? out : 0);
  }, 0);

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/analysts" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{analyst?.name ?? "Analyst"}'s Portfolio</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{analyst?.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portfolio Size</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{invoices.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Assigned invoices</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalOutstanding)}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Assigned Invoices — edit Status, Actual Stage &amp; Comments here
        </h2>
        <div className="w-full">
          <Table className="table-fixed w-full text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-border bg-muted/30">
                <TableHead className="text-sm font-semibold p-2">Customer</TableHead>
                <TableHead className="text-sm font-semibold p-2">Invoice #</TableHead>
                <TableHead className="text-sm font-semibold p-2">Due Date</TableHead>
                <TableHead className="text-sm font-semibold p-2">Days Aged</TableHead>
                <TableHead className="text-sm font-semibold p-2">Total Open (USD)</TableHead>
                <TableHead className="text-sm font-semibold p-2">Invoice Stage</TableHead>
                <TableHead className="text-sm font-semibold p-2">Actual Invoice Stage</TableHead>
                <TableHead className="text-sm font-semibold p-2">Status</TableHead>
                <TableHead className="text-sm font-semibold p-2">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j} className="p-2"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No invoices in portfolio.</TableCell>
                </TableRow>
              ) : (
                invoices.map((invoice: any) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/40 transition-colors align-top">
                    <TableCell className="text-sm p-2 break-words">{invoice.customerName}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.daysAged ?? "—"}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{formatCurrency(invoice.amount, "USD")}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.invoiceStage || "—"}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<ActualStageCell invoice={invoice} />}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<StatusCell invoice={invoice} />}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<CommentsCell invoice={invoice} />}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
