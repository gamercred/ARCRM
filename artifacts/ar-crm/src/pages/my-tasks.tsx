import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";

function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function hoursLeft(sentAt: string): number {
  const deadline = new Date(sentAt).getTime() + 48 * 3600 * 1000;
  return Math.round((deadline - Date.now()) / (3600 * 1000));
}

export default function MyTasks() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  const { data: reminders, isLoading } = useQuery({
    queryKey: ["reminders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reminders").select("*").eq("done", false).order("remind_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: inbound } = useQuery({
    queryKey: ["inbound-tasks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_messages")
        .select("*, email_threads(customer_id, customer_name, subject)")
        .eq("direction", "inbound")
        .eq("task_done", false)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invoices } = useAllInvoices();

  async function markReminderDone(id: number) {
    const { error } = await supabase.from("reminders").update({ done: true }).eq("id", id);
    if (error) { alert("Could not update: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["reminders"] });
  }
  async function markEmailDone(id: number) {
    const { error } = await supabase.from("email_messages").update({ task_done: true }).eq("id", id);
    if (error) { alert("Could not update: " + error.message); return; }
    qc.invalidateQueries({ queryKey: ["inbound-tasks"] });
  }

  // map customer_id -> analyst name (from that customer's invoices)
  const custToAnalyst = new Map<string, string>();
  (Array.isArray(invoices) ? invoices : []).forEach((i: any) => {
    if (i.customerId && i.analystName && !custToAnalyst.has(String(i.customerId))) {
      custToAnalyst.set(String(i.customerId), i.analystName);
    }
  });

  const remList = Array.isArray(reminders) ? reminders : [];
  const today = todayISO();
  const overdue = remList.filter((r: any) => r.remind_date < today);
  const dueToday = remList.filter((r: any) => r.remind_date === today);
  const upcoming = remList.filter((r: any) => r.remind_date > today);

  // group inbound emails by analyst
  const inList = Array.isArray(inbound) ? inbound : [];
  const byAnalyst = new Map<string, any[]>();
  inList.forEach((m: any) => {
    const cid = m.email_threads?.customer_id ? String(m.email_threads.customer_id) : null;
    const analyst = (cid && custToAnalyst.get(cid)) || "Unassigned";
    if (!byAnalyst.has(analyst)) byAnalyst.set(analyst, []);
    byAnalyst.get(analyst)!.push(m);
  });
  const analystGroups = Array.from(byAnalyst.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  function ReminderSection({ title, items, tone }: { title: string; items: any[]; tone: string }) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className={"text-xs font-semibold uppercase tracking-wider " + tone}>{title} ({items.length})</div>
        {items.map((r: any) => (
          <div key={r.id} className="flex items-start gap-3 rounded border border-border bg-card p-3">
            <div className="w-24 shrink-0 text-sm font-mono text-muted-foreground">{fmtUS(r.remind_date)}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <Link href={`/customer/${r.customer_id}`} className="text-primary hover:underline font-medium">{r.customer_name || r.customer_id}</Link>
                {r.invoice_number && <span className="text-muted-foreground"> · Invoice {r.invoice_number}</span>}
              </div>
              {r.note && <div className="text-sm text-muted-foreground mt-0.5 break-words">{r.note}</div>}
            </div>
            <button onClick={() => markReminderDone(r.id)} className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-muted/40">Mark done</button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">Follow-up reminders and inbound customer emails needing a reply.</p>
      </div>

      {/* Inbound emails */}
      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Inbound Emails · reply within 48h</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {inList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No inbound emails to action. 🎉</p>
          ) : (
            analystGroups.map(([analyst, items]) => (
              <div key={analyst} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">{analyst} ({items.length})</div>
                {items.map((m: any) => {
                  const hrs = hoursLeft(m.sent_at);
                  const overdueEmail = hrs < 0;
                  return (
                    <div key={m.id} className="flex items-start gap-3 rounded border border-border bg-card p-3">
                      <div className="w-28 shrink-0">
                        <div className={"text-xs font-semibold " + (overdueEmail ? "text-red-400" : hrs < 12 ? "text-amber-400" : "text-muted-foreground")}>
                          {overdueEmail ? `${Math.abs(hrs)}h overdue` : `${hrs}h left`}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(m.sent_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                      </div>
                      <div onClick={() => navigate(`/mailbox?thread=${m.thread_id}`)} className="flex-1 min-w-0 cursor-pointer hover:opacity-80">
                        <div className="text-sm font-medium truncate">{m.email_threads?.customer_name || m.from_email}</div>
                        <div className="text-xs text-muted-foreground">From: {m.from_email}</div>
                        {m.subject && <div className="text-sm mt-0.5 truncate">{m.subject}</div>}
                        <div className="text-[10px] text-primary hover:underline mt-0.5">Open in mailbox to reply →</div>
                      </div>
                      <button onClick={() => markEmailDone(m.id)} className="shrink-0 text-xs px-2 py-1 rounded border border-border hover:bg-muted/40">Mark done</button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Reminders */}
      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Reminders</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
          ) : remList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open reminders. Set one from a customer's Communications &amp; Notes.</p>
          ) : (
            <>
              <ReminderSection title="Overdue" items={overdue} tone="text-red-400" />
              <ReminderSection title="Due today" items={dueToday} tone="text-amber-400" />
              <ReminderSection title="Upcoming" items={upcoming} tone="text-muted-foreground" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
