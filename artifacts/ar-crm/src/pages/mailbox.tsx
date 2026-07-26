import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { getAuditName } from "@/lib/audit";

function fmtWhen(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Mailbox() {
  const qc = useQueryClient();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { data: threads } = useQuery({
    queryKey: ["email-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function send() {
    if (!to.trim() || !subject.trim() || !body.trim()) {
      setStatusMsg("Fill in To, Subject and Message first.");
      return;
    }
    setSending(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject: subject.trim(), body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatusMsg("Send failed: " + (data.error || res.status));
        return;
      }
      // save thread + message so it shows in the mailbox
      const { data: thread, error: tErr } = await supabase
        .from("email_threads")
        .insert({ customer_name: to.trim(), subject: subject.trim(), last_message_at: new Date().toISOString() })
        .select()
        .single();
      if (!tErr && thread) {
        await supabase.from("email_messages").insert({
          thread_id: thread.id,
          direction: "outbound",
          from_email: "me",
          to_email: to.trim(),
          subject: subject.trim(),
          body: body.trim(),
          gmail_message_id: data.id,
          gmail_thread_id: data.threadId,
          sent_at: new Date().toISOString(),
        });
      }
      setStatusMsg("Sent ✓");
      setTo(""); setSubject(""); setBody("");
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    } catch (e: any) {
      setStatusMsg("Send failed: " + (e?.message || e));
    } finally {
      setSending(false);
    }
  }

  const list = Array.isArray(threads) ? threads : [];

  return (
    <div className="p-6 w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Mailbox</h1>
        <p className="text-sm text-muted-foreground mt-1">Send collection emails from the tool. (Test mode — sending from the connected Gmail.)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Compose</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com"
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Invoice reminder"
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} placeholder="Type your email…"
                className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1 resize-none" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={send} disabled={sending}
                className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
                {sending ? "Sending…" : "Send"}
              </button>
              {statusMsg && <span className="text-xs text-muted-foreground">{statusMsg}</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sent Threads</CardTitle></CardHeader>
          <CardContent>
            {list.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No emails sent yet.</p>
            ) : (
              <div className="space-y-2">
                {list.map((t: any) => (
                  <div key={t.id} className="rounded border border-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{t.customer_name || t.customer_id || "—"}</div>
                      <div className="text-xs text-muted-foreground">{fmtWhen(t.last_message_at)}</div>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">{t.subject}</div>
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
