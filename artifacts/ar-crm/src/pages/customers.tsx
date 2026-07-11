import { useState } from "react";
import { useLocation } from "wouter";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useListInvoices } from "@/lib/supabase-hooks";

export default function Customers() {
  const [, navigate] = useLocation();
  const { data: invoicesData, isLoading } = useListInvoices({ pageSize: 100000 });
  const invoices = invoicesData?.invoices ?? [];
  const [search, setSearch] = useState("");

  const map = new Map<string, { id: any; name: string; count: number; outstanding: number }>();
  for (const inv of invoices) {
    const id = String(inv.customerId);
    const cur = map.get(id) || { id: inv.customerId, name: inv.customerName, count: 0, outstanding: 0 };
    const out = Number(inv.amount) - Number(inv.paidAmount ?? 0);
    cur.count++;
    cur.outstanding += out > 0 ? out : 0;
    map.set(id, cur);
  }
  let customers = Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  if (search.trim()) {
    const q = search.toLowerCase();
    customers = customers.filter((c) => c.name.toLowerCase().includes(q) || String(c.id).toLowerCase().includes(q));
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <h1 className="text-3xl font-bold tracking-tight">Customers</h1>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customers by name or ID..."
        className="w-full max-w-md bg-background border border-border rounded px-3 py-2 text-sm"
      />
      <div className="w-full rounded-md border border-border bg-card overflow-hidden">
        <Table className="w-full text-sm">
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-transparent border-b-border">
              <TableHead className="text-sm font-semibold p-2">Customer Name</TableHead>
              <TableHead className="text-sm font-semibold p-2">Customer ID</TableHead>
              <TableHead className="text-sm font-semibold p-2 text-right">Invoices</TableHead>
              <TableHead className="text-sm font-semibold p-2 text-right">Total Outstanding</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <TableCell key={j} className="p-2"><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : customers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">No customers found.</TableCell>
              </TableRow>
            ) : (
              customers.map((c) => (
                <TableRow
                  key={String(c.id)}
                  onClick={() => navigate(`/customer/${c.id}`)}
                  className="cursor-pointer hover:bg-muted/40 transition-colors"
                >
                  <TableCell className="p-2 font-medium">{c.name}</TableCell>
                  <TableCell className="p-2 text-muted-foreground">{String(c.id)}</TableCell>
                  <TableCell className="p-2 text-right font-mono">{c.count}</TableCell>
                  <TableCell className="p-2 text-right font-mono text-primary">{formatCurrency(c.outstanding)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
