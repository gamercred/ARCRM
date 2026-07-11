import { useListAnalysts } from "@/lib/supabase-hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowRight, Users, Briefcase } from "lucide-react";

export default function Analysts() {
  const { data: analysts, isLoading } = useListAnalysts();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Team Overview</h1>
      </div>

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
        ) : analysts?.map((analyst) => (
          <Link key={analyst.id} href={`/analyst/${analyst.id}`}>
            <Card className="bg-card hover:bg-secondary/50 transition-colors cursor-pointer border-border group relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-primary transform origin-bottom scale-y-0 group-hover:scale-y-100 transition-transform" />
              <CardHeader className="pb-2 flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">{analyst.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{analyst.email}</p>
                </div>
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      <Briefcase className="w-3 h-3" />
                      Invoices
                    </div>
                    <div className="text-xl font-semibold">{analyst.portfolioCount}</div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
                      Outstanding
                    </div>
                    <div className="text-xl font-mono text-primary">{formatCurrency(analyst.totalOutstanding)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
