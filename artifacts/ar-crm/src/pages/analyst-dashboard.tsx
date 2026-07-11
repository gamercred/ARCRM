import { useState } from "react";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useListInvoices, useListAnalysts } from "@/lib/supabase-hooks";
import { StatusCell } from "@/components/status-cell";
import { ActualStageCell } from "@/components/actual-stage-cell";
import { CommentHistoryCell } from "@/components/comment-history-cell";
import { ColumnFilter } from "@/components/column-filter";

export default function AnalystDashboard() {
  const [, params] = useRoute("/analyst/:id");
  const analystId = params?.id ? Number(params.id) : 0;
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const { data: analysts } = useListAnalysts();
  const analyst = analysts?.find((a: any) => a.id === analystId);

  const { data: invoicesData, isLoading } = useListInvoices({ analystId, pageSize: 100000 });
  const rawInvoices = invoicesData?.invoices ?? [];

  const totalOutstanding = rawInvoices.reduce((sum: number, i: any) => {
    const out = Number(i.amount) - Number(i.paidAmount ?? 0);
    return sum + (out > 0 ? out : 0);
  }, 0);

  const COLS: { key: string; label: string; get: (i: any) => any; sortable?: boolean }[] = [
    { key: "customerId", label: "Customer ID", get: (i) => i.customerId },
    { key: "customerName", label: "Customer Name", get: (i) => i.customerName },
    { key: "invoiceNumber", label: "Invoice #", get: (i) => i.invoiceNumber },
    { key: "issueDate", label: "Invoice Date", get: (i) => formatDate(i.issueDate) },
    { key: "dueDate", label: "Due Date", get: (i) => formatDate(i.dueDate) },
    { key: "daysAged", label: "Days Aged", get: (i) => i.daysAged, sortable: true },
    { key: "amount", label: "Total Open (USD)", get: (i) => i.amount, sortable: true },
    { key: "category", label: "Category", get: (i) => i.category },
    { key: "invoiceStage", label: "Invoice Stage", get: (i) => i.invoiceStage },
    { key: "actualInvoiceStage", label: "Actual Invoice Stage", get: (i) => i.actualInvoiceStage },
    { key: "manualStatus", label: "Status", get: (i) => i.manualStatus },
    { key: "comments", label: "Comments", get: (i) => i.comments },
  ];

  const distinctVals: Record<string, string[]> = {};
  for (const c of COLS) {
    const set = new Set<string>();
    for (const inv of rawInvoices) set.add(String(c.get(inv) ?? ""));
    distinctVals[c.key] = Array.from(set).sort();
  }

  const filteredInvoices = rawInvoices.filter((inv: any) =>
    COLS.every((c) => {
      const f = colFilters[c.key] || "";
      return !f || String(c.get(inv) ?? "") === f;
    }),
  );

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
            <div className="text-2xl font-bold font-mono">{rawInvoices.length}</div>
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
                {COLS.map((c) => (
                  <TableHead key={c.key} className="text-sm font-semibold p-2">
                    <div className="flex items-center gap-1">
                      <ColumnFilter
                        label={c.label}
                        values={distinctVals[c.key] || []}
                        value={colFilters[c.key] || ""}
                        onChange={(v) => setColFilters((prev) => ({ ...prev, [c.key]: v }))}
                      />
                      {c.sortable && (
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
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j} className="p-2"><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : sortedInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-10 text-muted-foreground">No invoices in portfolio.</TableCell>
                </TableRow>
              ) : (
                sortedInvoices.map((invoice: any) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/40 transition-colors align-top">
                    <TableCell className="text-sm p-2 break-words">{invoice.customerId}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.customerName}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.invoiceNumber}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{formatDate(invoice.issueDate)}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{formatDate(invoice.dueDate)}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.daysAged ?? "—"}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{formatCurrency(invoice.amount, "USD")}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.category ?? "—"}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{invoice.invoiceStage || "—"}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<ActualStageCell invoice={invoice} />}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<StatusCell invoice={invoice} />}</TableCell>
                    <TableCell className="text-sm p-2 break-words">{<CommentHistoryCell invoice={invoice} />}</TableCell>
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
