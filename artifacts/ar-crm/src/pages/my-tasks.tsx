import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MyTasks() {
  const qc = useQueryClient();
  const { data: reminders, isLoading } = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .eq("done", false)
        .order("remind_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function markDone(id: number) {
    const { error } = await supabase.from("reminders").update({ done: true }).eq("id", id);
    if (error) { alert("Could not update: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["reminders"] });
  }

  const list = Array.isArray(reminders) ? reminders : [];
  const today = todayISO();
  const overdue = list.filter((r: any) => r.remind_date < today);
  const dueToday = list.filter((r: any) => r.remind_date === today);
  const upcoming = list.filter((r: any) => r.remind_date > today);

  function Section({ title, items, tone }: { title: string; items: any[]; tone: string }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className={"text-xs font-semibold uppercase tracking-wider " + tone}>{title} ({items.length})</div>
        {items.map((r: any) => (
          <div key={r.id} className="flex items-start gap-3 rounded border border-border bg-card p-3">
            <div className="w-24 shrink-0 text-sm font-mono text-muted-foreground">{fmtUS(r.remind_date)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <Link href={`/customer/${r.customer_id}`} className="text-primary hover:underline font-medium">
                  {r.customer_name || r.customer_id}
                </Link>
                {r.invoice_number && <span className="text-muted-foreground"> · Invoice {r.invoice_number}</span>}
              </div>
              {r.note && <div className="text-sm text-muted-foreground mt-0.5 break-words">{r.note}</div>}
              {r.author && <div className="text-[10px] text-muted-foreground mt-1">set by {r.author}</div>}
            </div>
            <button onClick={() => markDone(r.id)}
              className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-muted/40">
              Mark done
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">Your follow-up reminders. Inbound customer emails will appear here once the mailbox is live.</p>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open reminders. Set one from a customer's Communications &amp; Notes.</p>
          ) : (
            <>
              <Section title="Overdue" items={overdue} tone="text-red-400" />
              <Section title="Due today" items={dueToday} tone="text-amber-400" />
              <Section title="Upcoming" items={upcoming} tone="text-muted-foreground" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
