import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { getAuditName } from "@/lib/audit";
import { formatCurrency, formatDate } from "@/lib/format";

export default function CashApplication() {
  const qc = useQueryClient();
  const { data: invoices } = useAllInvoices();
  const [filter, setFilter] = useState<"open" | "paid" | "all">("open");
  const [search, setSearch] = useState("");
  const [payFor, setPayFor] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const all = Array.isArray(invoices) ? invoices : [];

  const { data: payments } = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(15);
      return data ?? [];
    },
  });
  const recentPayments = Array.isArray(payments) ? payments : [];

  const rows = useMemo(() => {
    let list = all.map((i: any) => ({ ...i, outstanding: Number(i.amount) - Number(i.paidAmount ?? 0) }));
    if (filter === "open") list = list.filter((i) => i.outstanding > 0.01);
    if (filter === "paid") list = list.filter((i) => i.outstanding <= 0.01);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((i) => (i.invoiceNumber + " " + i.customerName).toLowerCase().includes(q));
    return list.slice(0, 200);
  }, [invoices, filter, search]);

  function openPay(inv: any) {
    setPayFor(inv);
    setAmount(String((Number(inv.amount) - Number(inv.paidAmount ?? 0)).toFixed(2)));
    setReference("");
    setMsg(null);
  }

  async function recordPayment() {
    if (!payFor) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) { setMsg("Enter a valid amount."); return; }
    if (!payDate) { setMsg("Pick a payment date."); return; }
    setSaving(true); setMsg(null);
    try {
      const { error: pErr } = await supabase.from("payments").insert({
        invoice_id: payFor.id, invoice_number: payFor.invoiceNumber,
        customer_id: payFor.customerId, customer_name: payFor.customerName,
        amount: amt, payment_date: payDate, reference: reference.trim() || null,
        author: getAuditName() || null,
      });
      if (pErr) { setMsg("Save failed: " + pErr.message); return; }
      const newPaid = Number(payFor.paidAmount ?? 0) + amt;
      const fullyPaid = newPaid >= Number(payFor.amount) - 0.01;
      const upd: any = { paid_amount: newPaid };
      if (fullyPaid) upd.status = "Paid";
      const { error: iErr } = await supabase.from("invoices").update(upd).eq("id", payFor.id);
      if (iErr) { setMsg("Payment saved, but invoice update failed: " + iErr.message); }
      else setMsg("Payment recorded ✓");
      setPayFor(null);
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["all-invoices"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) { setMsg("Save failed: " + (e?.message || e)); } finally { setSaving(false); }
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cash application</h1>
        <p className="text-sm text-muted-foreground mt-1">Record payments against invoices from your bank tracking sheet.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice list */}
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0 gap-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Invoices</CardTitle>
            <div className="flex items-center gap-2">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="bg-background border border-border rounded px-2 py-1 text-xs w-32" />
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-background border border-border rounded px-2 py-1 text-xs">
                <option value="open">Open</option>
                <option value="paid">Paid</option>
                <option value="all">All</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[560px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50">
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="p-2 font-medium">Invoice</th>
                    <th className="p-2 font-medium">Customer</th>
                    <th className="p-2 font-medium text-right">Outstanding</th>
                    <th className="p-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No invoices.</td></tr>
                  ) : rows.map((i: any) => (
                    <tr key={i.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="p-2">{i.invoiceNumber}</td>
                      <td className="p-2 truncate max-w-[160px]">{i.customerName}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(i.outstanding, "USD")}</td>
                      <td className="p-2 text-right">
                        {i.outstanding > 0.01 ? (
                          <button onClick={() => openPay(i)} className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground">Record payment</button>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-medium">Paid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Right: payment form + recent */}
        <div className="space-y-6">
          {payFor && (
            <Card className="bg-card">
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">Record payment</CardTitle>
                <button onClick={() => setPayFor(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  {payFor.invoiceNumber} · {payFor.customerName}<br />
                  Invoice total {formatCurrency(payFor.amount, "USD")} · Outstanding {formatCurrency(Number(payFor.amount) - Number(payFor.paidAmount ?? 0), "USD")}
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Amount</label>
                  <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Payment date</label>
                  <input value={payDate} onChange={(e) => setPayDate(e.target.value)} type="date" style={{ colorScheme: "light" }} className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Reference</label>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / bank ref" className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1" />
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={recordPayment} disabled={saving} className="px-4 py-1.5 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Save payment"}</button>
                  {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="bg-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Recent payments</CardTitle></CardHeader>
            <CardContent>
              {recentPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentPayments.map((p: any) => (
                    <div key={p.id} className="text-xs border-b border-border/60 pb-1.5">
                      <div className="flex justify-between">
                        <span className="font-medium">{p.invoice_number}</span>
                        <span className="font-mono">{formatCurrency(Number(p.amount), "USD")}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span className="truncate max-w-[120px]">{p.customer_name}</span>
                        <span>{formatDate(p.payment_date)}{p.reference ? " · " + p.reference : ""}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
