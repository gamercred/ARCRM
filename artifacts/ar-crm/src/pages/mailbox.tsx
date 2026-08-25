import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { EmailChips } from "@/components/email-chips";

function fmtWhen(ts: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function Mailbox() {
  const qc = useQueryClient();
  const [openThread, setOpenThread] = useState<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("thread");
    if (t) setOpenThread(Number(t));
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyCc, setReplyCc] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [replyMsg, setReplyMsg] = useState<string | null>(null);
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

  useEffect(() => {
    // prefill reply fields when thread/messages change
    const thread = (Array.isArray(threads) ? threads : []).find((t) => t.id === openThread);
    const msgs = Array.isArray(messages) ? messages : [];
    const lastIn = msgs.filter((m) => m.direction === "inbound").slice(-1)[0];
    if (openThread !== null) {
      setReplyTo((lastIn?.from_email || thread?.customer_name || "").trim());
      const subj = thread?.subject ? (thread.subject.startsWith("Re:") ? thread.subject : "Re: " + thread.subject) : "Re:";
      setReplySubject(subj);
    }
  }, [openThread, messages, threads]);

  useEffect(() => {
    // auto-refresh inbound every 60s
    const id = setInterval(() => { refreshInbox(); }, 60000);
    return () => clearInterval(id);
  }, []);

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

  async function sendReply() {
    if (openThread === null) return;
    const thread = (Array.isArray(threads) ? threads : []).find((t: any) => t.id === openThread);
    const lastInbound = (Array.isArray(messages) ? messages : []).filter((m: any) => m.direction === "inbound").slice(-1)[0];
    const toAddr = (replyTo || lastInbound?.from_email || thread?.customer_name || "").trim();
    if (!toAddr) { setReplyMsg("No recipient found for this thread."); return; }
    if (!replyBody.trim()) { setReplyMsg("Write a reply first."); return; }
    const subject = (replySubject || "Re:").trim();
    setSendingReply(true); setReplyMsg(null);
    try {
      const res = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: toAddr, cc: replyCc.trim() || undefined, subject, body: replyBody.trim() }) });
      const data = await res.json();
      if (!res.ok || !data.ok) { setReplyMsg("Send failed: " + (data.error || res.status)); return; }
      await supabase.from("email_messages").insert({ thread_id: openThread, direction: "outbound", from_email: "me", to_email: toAddr, cc: replyCc.trim() || null, subject, body: replyBody.trim(), gmail_message_id: data.id, gmail_thread_id: data.threadId, sent_at: new Date().toISOString() });
      await supabase.from("email_threads").update({ last_message_at: new Date().toISOString() }).eq("id", openThread);
      await supabase.from("email_messages").update({ task_done: true }).eq("thread_id", openThread).eq("direction", "inbound");
      qc.invalidateQueries({ queryKey: ["inbound-tasks"] });
      setReplyBody(""); setReplyCc(""); setReplyMsg("Sent ✓");
      qc.invalidateQueries({ queryKey: ["email-messages", openThread] });
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    } catch (e: any) { setReplyMsg("Send failed: " + (e?.message || e)); } finally { setSendingReply(false); }
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
                      {m.cc && <span className="text-muted-foreground">Cc: {m.cc}</span>}
                      <span>{fmtWhen(m.sent_at)}</span>
                    </div>
                    {m.subject && <div className="text-sm font-medium mb-1">{m.subject}</div>}
                    <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>
                  </div>
                ))}
              </div>
            )}
            {openThread !== null && (
              <div className="mt-4 border-t border-border pt-3 space-y-2">
                <label className="text-xs text-muted-foreground">Reply</label>
                <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="To"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm mb-2" />
                <input value={replySubject} onChange={(e) => setReplySubject(e.target.value)} placeholder="Subject"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm mb-2" />
                <div className="mb-2"><EmailChips value={replyCc} onChange={setReplyCc} placeholder="Cc (optional)" /></div>
                <textarea value={replyBody} onChange={(e) => setReplyBody(e.target.value)} rows={4}
                  placeholder="Type your reply…"
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm resize-none" />
                <div className="flex items-center gap-3">
                  <button onClick={sendReply} disabled={sendingReply}
                    className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">
                    {sendingReply ? "Sending…" : "Send reply"}
                  </button>
                  {replyMsg && <span className="text-xs text-muted-foreground">{replyMsg}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
