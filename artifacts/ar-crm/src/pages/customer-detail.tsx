import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getAuditName } from "@/lib/audit";
import { useListInvoices } from "@/lib/supabase-hooks";
import { StatusCell } from "@/components/status-cell";
import { ActualStageCell } from "@/components/actual-stage-cell";
import { CommentHistoryCell } from "@/components/comment-history-cell";
import { ExpectedDateCell } from "@/components/expected-date-cell";
import { ColumnFilter } from "@/components/column-filter";

export default function CustomerDetail() {
  const [, params] = useRoute("/customer/:id");
  const customerId = params?.id ?? "";
  const { data: apContact } = useQuery({
    queryKey: ["customer-contact", customerId],
    queryFn: async () => {
      const { data } = await supabase.from("customer_contacts").select("email").eq("customer_id", String(customerId)).maybeSingle();
      return data?.email ?? null;
    },
    enabled: !!customerId,
  });
  const qc = useQueryClient();
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);

  const { data: invoicesData, isLoading } = useListInvoices({ pageSize: 100000 });
  const rawInvoices = (Array.isArray(invoicesData?.invoices) ? invoicesData.invoices : []).filter(
    (i: any) => String(i.customerId) === String(customerId),
  );
  const customerName = rawInvoices[0]?.customerName ?? "Customer";

  const totalOutstanding = rawInvoices.reduce((sum: number, i: any) => {
    const out = Number(i.amount) - Number(i.paidAmount ?? 0);
    return sum + (out > 0 ? out : 0);
  }, 0);
  const overdueBalance = rawInvoices.reduce((sum: number, i: any) => {
    const out = Number(i.amount) - Number(i.paidAmount ?? 0);
    return sum + (out > 0 && Number(i.daysAged ?? 0) > 0 ? out : 0);
  }, 0);
  const avgDaysAged = rawInvoices.length
    ? Math.round(rawInvoices.reduce((s: number, i: any) => s + Number(i.daysAged ?? 0), 0) / rawInvoices.length)
    : 0;
  const maxDaysAged = rawInvoices.reduce((m: number, i: any) => Math.max(m, Number(i.daysAged ?? 0)), 0);
  const risk =
    maxDaysAged > 90
      ? { label: "High Risk", cls: "bg-red-500/20 text-red-400" }
      : maxDaysAged > 30
        ? { label: "Medium Risk", cls: "bg-amber-500/20 text-amber-400" }
        : { label: "Low Risk", cls: "bg-emerald-500/20 text-emerald-400" };

  const { data: allComments } = useQuery({
    queryKey: ["invoice-comments-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_comments")
        .select("*")
        .order("comment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const invoiceNumbers = new Set(rawInvoices.map((i: any) => String(i.invoiceNumber)));
  const customerComments = (Array.isArray(allComments) ? allComments : []).filter((c: any) => invoiceNumbers.has(String(c.invoice_number)));

  const [noteInvoice, setNoteInvoice] = useState("");
  const [noteDate, setNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [savingEpd, setSavingEpd] = useState(false);
  const [epdInvoice, setEpdInvoice] = useState("");
  async function saveExpectedDate(newVal: string) {
    if (!epdInvoice) { alert("Pick an invoice first."); return; }
    const inv = rawInvoices.find((i: any) => String(i.invoiceNumber) === epdInvoice);
    if (!inv) return;
    setSavingEpd(true);
    const prev = inv.expectedIsOverride ? inv.expectedPaymentDate : "";
    const { error } = await supabase.from("invoices").update({ expected_payment_date: newVal || null }).eq("id", inv.id);
    if (!error) {
      await logAudit(inv, "expected_payment_date", prev, newVal);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } else {
      alert("Could not save: " + error.message);
    }
    setSavingEpd(false);
  }

  async function addNote() {
    if (!noteText.trim() || !noteInvoice) return;
    const inv = rawInvoices.find((i: any) => String(i.invoiceNumber) === noteInvoice);
    setSavingNote(true);
    const { error } = await supabase.from("invoice_comments").insert({
      invoice_id: inv ? String(inv.id) : null,
      invoice_number: noteInvoice,
      comment_text: noteText.trim(),
      comment_date: noteDate,
      author: getAuditName() || null,
    });
    setSavingNote(false);
    if (error) {
      alert("Could not add note: " + error.message);
      return;
    }
    setNoteText("");
    qc.invalidateQueries({ queryKey: ["invoice-comments"] });
    qc.invalidateQueries({ queryKey: ["invoice-comments-all"] });
  }

  const COLS: { key: string; label: string; get: (i: any) => any; sortable?: boolean }[] = [
    { key: "invoiceNumber", label: "Invoice #", get: (i) => i.invoiceNumber },
    { key: "issueDate", label: "Invoice Date", get: (i) => formatDate(i.issueDate) },
    { key: "dueDate", label: "Due Date", get: (i) => formatDate(i.dueDate) },
    { key: "daysAged", label: "Days Aged", get: (i) => i.daysAged, sortable: true },
    { key: "amount", label: "Total Open (USD)", get: (i) => i.amount, sortable: true },
    { key: "category", label: "Category", get: (i) => i.category },
    { key: "invoiceStage", label: "Invoice Stage", get: (i) => i.invoiceStage },
    { key: "actualInvoiceStage", label: "Actual Invoice Stage", get: (i) => i.actualInvoiceStage },
    { key: "manualStatus", label: "Status", get: (i) => i.manualStatus },
  ];

  const distinctVals: Record<string, string[]> = {};
  for (const c of COLS) {
    const set = new Set<string>();
    for (const inv of rawInvoices) set.add(String(c.get(inv) ?? ""));
    distinctVals[c.key] = Array.from(set).sort();
  }

  const filteredInvoices = rawInvoices.filter((inv: any) =>
    COLS.every((c) => {
      const f = colFilters[c.key] || "";
      return !f || String(c.get(inv) ?? "") === f;
    }),
  );

  const sortedInvoices = [...filteredInvoices];
  if (sort && (sort.key === "daysAged" || sort.key === "amount")) {
    const col = COLS.find((c) => c.key === sort.key);
    if (col) {
      sortedInvoices.sort((a, b) => {
        const av = Number(col.get(a) ?? 0);
        const bv = Number(col.get(b) ?? 0);
        return sort.dir === "asc" ? av - bv : bv - av;
      });
    }
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-center gap-4">
        <Link href="/customers" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customer Profile: {customerName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-muted-foreground">ID: {String(customerId)}</span>
            <span className={"text-xs px-2 py-0.5 rounded font-medium " + risk.cls}>{risk.label} (auto)</span>
          </div>
          {apContact && (
            <div className="text-sm text-muted-foreground mt-1">AP Contact: <a href={"mailto:" + apContact} className="text-primary hover:underline">{apContact}</a></div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Outstanding</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono text-primary">{formatCurrency(totalOutstanding)}</div></CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Overdue Balance</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono text-destructive">{formatCurrency(overdueBalance)}</div></CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg. Days Aged</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold font-mono">{avgDaysAged}</div><p className="text-xs text-muted-foreground mt-1">across open invoices</p></CardContent>
        </Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Expected Payment Date</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Invoice</label>
              <select value={epdInvoice} onChange={(e) => setEpdInvoice(e.target.value)} className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1">
                <option value="">Select invoice…</option>
                {rawInvoices.map((i: any) => (<option key={i.id} value={String(i.invoiceNumber)}>{i.invoiceNumber}</option>))}
              </select>
            </div>
            {epdInvoice && (() => {
              const inv = rawInvoices.find((i: any) => String(i.invoiceNumber) === epdInvoice);
              const cur = inv?.expectedPaymentDate ?? "";
              const isOv = !!inv?.expectedIsOverride;
              return (
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground">Date {isOv ? "(set)" : "(auto: due + 7)"}</label>
                  <input type="date" min="2020-01-01" max="2035-12-31" defaultValue={cur} key={epdInvoice}
                    onChange={(e) => saveExpectedDate(e.target.value)} disabled={savingEpd}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-sm mt-1 cursor-pointer"
                    style={{ colorScheme: "dark" }} />
                </div>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        <div className="lg:col-span-2">
          <Card className="bg-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Active Invoice Ledger</CardTitle></CardHeader>
            <CardContent>
              <Table className="table-fixed w-full text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b-border bg-muted/30">
                    {COLS.map((c) => (
                      <TableHead key={c.key} className="text-sm font-semibold p-2">
                        <div className="flex items-center gap-1">
                          <ColumnFilter
                            label={c.label}
                            values={distinctVals[c.key] || []}
                            value={colFilters[c.key] || ""}
                            onChange={(v) => setColFilters((prev) => ({ ...prev, [c.key]: v }))}
                          />
                          {c.sortable && (
                            <button
                              onClick={() =>
                                setSort((prev) =>
                                  prev && prev.key === c.key
                                    ? { key: c.key, dir: prev.dir === "asc" ? "desc" : "asc" }
                                    : { key: c.key, dir: "asc" },
                                )
                              }
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                              title="Sort"
                            >
                              {sort && sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                            </button>
                          )}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j} className="p-2"><Skeleton className="h-4 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : sortedInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">No invoices for this customer.</TableCell>
                    </TableRow>
                  ) : (
                    sortedInvoices.map((invoice: any) => (
                      <TableRow key={invoice.id} className="hover:bg-muted/40 transition-colors align-top">
                        <TableCell className="text-sm p-2 break-words">{invoice.invoiceNumber}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{formatDate(invoice.issueDate)}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{formatDate(invoice.dueDate)}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{invoice.daysAged ?? "—"}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{formatCurrency(invoice.amount, "USD")}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{invoice.category ?? "—"}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{invoice.invoiceStage || "—"}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{<ActualStageCell invoice={invoice} editable={false} />}</TableCell>
                        <TableCell className="text-sm p-2 break-words">{<StatusCell invoice={invoice} editable={false} />}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-1 flex">
          <Card className="bg-card flex flex-col w-full">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Communications &amp; Notes</CardTitle></CardHeader>
            <CardContent className="space-y-4 flex flex-col flex-1 min-h-0">
              <div className="space-y-2 border-b border-border pb-4">
                <select
                  value={noteInvoice}
                  onChange={(e) => setNoteInvoice(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
                >
                  <option value="">Select invoice…</option>
                  {rawInvoices.map((i: any) => (
                    <option key={i.id} value={String(i.invoiceNumber)}>{i.invoiceNumber}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={noteDate}
                  onChange={(e) => setNoteDate(e.target.value)}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs"
                />
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add a note…"
                  rows={2}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-sm resize-none"
                />
                <button
                  onClick={addNote}
                  disabled={savingNote || !noteInvoice || !noteText.trim()}
                  className="w-full px-2 py-1 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
                >
                  New Note
                </button>
              </div>
              <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
                {customerComments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                ) : (
                  customerComments.map((c: any) => (
                    <div key={c.id} className="border-l-2 border-primary/60 pl-3">
                      <div className="text-xs text-muted-foreground">
                        {c.comment_date}{c.author ? " · " + c.author : ""} · {c.invoice_number}
                      </div>
                      <div className="text-sm break-words">{c.comment_text}</div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
