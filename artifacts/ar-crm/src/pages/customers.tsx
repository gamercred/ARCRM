import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Building2 } from "lucide-react";
import { useListInvoices } from "@/lib/supabase-hooks";

export default function Customers() {
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card">
              <CardContent className="p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-40" />
              </CardContent>
            </Card>
          ))
        ) : (
          customers.map((c) => (
            <Link key={String(c.id)} href={`/customer/${c.id}`}>
              <Card className="bg-card hover:bg-secondary/50 transition-colors cursor-pointer border-border group relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform" />
                <CardHeader className="pb-2 flex flex-row justify-between items-start">
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{c.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">ID: {String(c.id)}</p>
                  </div>
                  <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                        <Building2 className="w-3 h-3" /> Invoices
                      </div>
                      <div className="text-xl font-semibold">{c.count}</div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Outstanding</div>
                      <div className="text-xl font-mono text-primary">{formatCurrency(c.outstanding)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
