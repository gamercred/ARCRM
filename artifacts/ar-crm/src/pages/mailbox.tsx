import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

function fmtWhen(ts: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Mailbox() {
  const qc = useQueryClient();
  const [openThread, setOpenThread] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const { data: threads } = useQuery({
    queryKey: ["email-threads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_threads").select("*").order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["email-messages", openThread],
    enabled: openThread !== null,
    queryFn: async () => {
      const { data, error } = await supabase.from("email_messages").select("*").eq("thread_id", openThread).order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function refreshInbox() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/fetch-emails", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) { setRefreshMsg("Refresh failed: " + (data.error || res.status)); return; }
      setRefreshMsg(`Fetched ${data.inserted} new email(s).`);
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    } catch (e: any) {
      setRefreshMsg("Refresh failed: " + (e?.message || e));
    } finally {
      setRefreshing(false);
    }
  }

  const list = Array.isArray(threads) ? threads : [];
  const msgs = Array.isArray(messages) ? messages : [];

  return (
    <div className="p-6 w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team Mailbox</h1>
          <p className="text-sm text-muted-foreground mt-1">Inbound &amp; outbound collection emails. (Test mode — connected Gmail.)</p>
        </div>
        <div className="flex items-center gap-3">
          {refreshMsg && <span className="text-xs text-muted-foreground">{refreshMsg}</span>}
          <button onClick={refreshInbox} disabled={refreshing}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
            {refreshing ? "Refreshing…" : "Refresh inbox"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* thread list */}
        <Card className="bg-card lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Conversations</CardTitle></CardHeader>
          <CardContent className="p-0">
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No emails yet. Click Refresh inbox.</p>
            ) : (
              <div className="divide-y divide-border">
                {list.map((t: any) => (
                  <div key={t.id} onClick={() => setOpenThread(t.id)}
                    className={"px-4 py-3 cursor-pointer transition " + (openThread === t.id ? "bg-muted/40" : "hover:bg-muted/20")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{t.customer_name || t.customer_id || "—"}</div>
                      <div className="text-[10px] text-muted-foreground shrink-0">{fmtWhen(t.last_message_at)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{t.subject || "(no subject)"}</div>
                    {t.customer_id && <Link href={`/customer/${t.customer_id}`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-primary hover:underline">View customer</Link>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* thread view */}
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Messages</CardTitle></CardHeader>
          <CardContent>
            {openThread === null ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Select a conversation to read it.</p>
            ) : msgs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No messages.</p>
            ) : (
              <div className="space-y-3">
                {msgs.map((m: any) => (
                  <div key={m.id} className={"rounded border p-3 " + (m.direction === "inbound" ? "border-border bg-muted/20" : "border-primary/40 bg-primary/5 ml-8")}>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{m.direction === "inbound" ? "From: " + m.from_email : "You → " + m.to_email}</span>
                      <span>{fmtWhen(m.sent_at)}</span>
                    </div>
                    {m.subject && <div className="text-sm font-medium mb-1">{m.subject}</div>}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
