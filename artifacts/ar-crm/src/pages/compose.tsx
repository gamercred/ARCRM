import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { getAuditName } from "@/lib/audit";
import { EmailChips } from "@/components/email-chips";
import { formatCurrency, formatDate } from "@/lib/format";

export default function Compose() {
  const qc = useQueryClient();
  const { data: invoices } = useAllInvoices();
  const [customerId, setCustomerId] = useState("");
  const [custSearch, setCustSearch] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const all = Array.isArray(invoices) ? invoices : [];
  // distinct customers from invoices
  const customers = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((i: any) => { if (i.customerId && !m.has(String(i.customerId))) m.set(String(i.customerId), i.customerName); });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  const custInvoices = all.filter((i: any) => String(i.customerId) === String(customerId));
  const customerName = custInvoices[0]?.customerName ?? "";

  // AP contact for the selected customer
  const { data: apContact } = useQuery({
    queryKey: ["compose-contact", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await supabase.from("customer_contacts").select("email").eq("customer_id", String(customerId)).order("is_primary", { ascending: false }).limit(1).maybeSingle();
      return data?.email ?? null;
    },
  });

  function onPickCustomer(id: string) {
    setCustomerId(id);
    setCustSearch("");
    setPicked({});
    setBody(""); setSubject("");
    const iv = all.filter((i: any) => String(i.customerId) === String(id));
    setSubject(iv[0] ? `Payment reminder — ${iv[0].customerName}` : "");
  }

  function toggleInv(num: string) {
    setPicked((prev) => ({ ...prev, [num]: !prev[num] }));
  }

  function buildBody() {
    const chosen = custInvoices.filter((i: any) => picked[String(i.invoiceNumber)]);
    if (chosen.length === 0) { setStatus("Tick at least one invoice first."); return; }
    const lines = chosen.map((i: any) => `  • Invoice ${i.invoiceNumber} — due ${formatDate(i.dueDate)} — ${formatCurrency(i.amount, "USD")}`);
    const total = chosen.reduce((s: number, i: any) => s + (i.amount ?? 0), 0);
    const intro = `Hi,\n\nThis is a friendly reminder regarding the following ${chosen.length > 1 ? "invoices" : "invoice"}:\n\n${lines.join("\n")}\n\nTotal Due = ${formatCurrency(total, "USD")}\n\nWe would appreciate an update on the expected payment. Please let us know if you need any documents.\n\nThank you,\n${getAuditName()}`;
    setBody(intro);
    setStatus(null);
  }

  async function send() {
    const toAddr = (to || apContact || "").trim();
    if (!toAddr || !subject.trim() || !body.trim()) { setStatus("Fill in To, Subject and Message first."); return; }
    setSending(true); setStatus(null);
    try {
      const res = await fetch("/api/send-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: toAddr, cc: cc.trim() || undefined, subject: subject.trim(), body: body.trim() }) });
      const data = await res.json();
      if (!res.ok || !data.ok) { setStatus("Send failed: " + (data.error || res.status)); return; }
      const { data: thread } = await supabase.from("email_threads").insert({ customer_id: customerId || null, customer_name: customerName || toAddr, subject: subject.trim(), last_message_at: new Date().toISOString() }).select().single();
      if (thread) {
        await supabase.from("email_messages").insert({ thread_id: thread.id, direction: "outbound", from_email: "me", to_email: toAddr, cc: cc.trim() || null, subject: subject.trim(), body: body.trim(), gmail_message_id: data.id, gmail_thread_id: data.threadId, sent_at: new Date().toISOString() });
      }
      setStatus("Sent ✓"); setBody(""); setPicked({});
      qc.invalidateQueries({ queryKey: ["email-threads"] });
    } catch (e: any) { setStatus("Send failed: " + (e?.message || e)); } finally { setSending(false); }
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compose</h1>
        <p className="text-sm text-muted-foreground mt-1">Send a collection email — pick a customer to pull in their invoices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">New Email</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Customer</label>
              {customerId ? (
                <div className="flex items-center justify-between bg-background border border-border rounded px-2 py-1 text-sm mt-1">
                  <span>{customerName} <span className="text-muted-foreground">({customerId})</span></span>
                  <button onClick={() => { setCustomerId(""); setCustSearch(""); }} className="text-xs text-primary hover:underline">change</button>
                </div>
              ) : (
                <div className="mt-1">
                  <input value={custSearch} onChange={(e) => setCustSearch(e.target.value)} placeholder="Search customer by name or ID…"
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm" />
                  {custSearch.trim() && (
                    <div className="mt-1 max-h-52 overflow-y-auto border border-border rounded bg-background">
                      {customers.filter((c) => (c.name + " " + c.id).toLowerCase().includes(custSearch.trim().toLowerCase())).slice(0, 30).map((c) => (
                        <div key={c.id} onClick={() => onPickCustomer(c.id)} className="px-2 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
                          {c.name} <span className="text-muted-foreground">({c.id})</span>
                        </div>
                      ))}
                      {customers.filter((c) => (c.name + " " + c.id).toLowerCase().includes(custSearch.trim().toLowerCase())).length === 0 && (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No match</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {customerId && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Include invoices:</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {custInvoices.map((i: any) => (
                    <label key={i.id} className="flex items-center gap-1 text-xs cursor-pointer">
                      <input type="checkbox" checked={!!picked[String(i.invoiceNumber)]} onChange={() => toggleInv(String(i.invoiceNumber))} />
                      {i.invoiceNumber} <span className="text-muted-foreground">({formatCurrency(i.amount, "USD")})</span>
                    </label>
                  ))}
                  <button onClick={buildBody} className="text-xs text-primary hover:underline ml-auto">Build email from selected</button>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground">To {apContact && <span className="text-muted-foreground/70">· AP contact: {apContact}</span>}</label>
              <div className="mt-1"><EmailChips value={to || apContact || ""} onChange={setTo} placeholder="Type email, press Enter" /></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cc</label>
              <div className="mt-1"><EmailChips value={cc} onChange={setCc} placeholder="Cc (optional)" /></div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Payment reminder" className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Message</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Pick a customer + invoices then Build email, or write your own…" className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1 resize-none" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={send} disabled={sending} className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">{sending ? "Sending…" : "Send email"}</button>
              {status && <span className="text-xs text-muted-foreground">{status}</span>}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Selected customer</CardTitle></CardHeader>
          <CardContent>
            {!customerId ? (
              <p className="text-sm text-muted-foreground">Pick a customer to see their open invoices.</p>
            ) : (
              <div className="space-y-2">
                <div className="text-sm font-medium">{customerName}</div>
                <div className="text-xs text-muted-foreground">{custInvoices.length} open invoice(s)</div>
                <div className="space-y-1 pt-1">
                  {custInvoices.map((i: any) => (
                    <div key={i.id} className="flex justify-between text-xs border-b border-border/60 py-1">
                      <span>{i.invoiceNumber}</span>
                      <span className="font-mono">{formatCurrency(i.amount, "USD")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
