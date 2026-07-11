import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { getAuditName } from "@/lib/audit";

function useAllComments() {
  return useQuery({
    queryKey: ["invoice-comments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_comments")
        .select("*")
        .order("comment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, any[]>();
      for (const c of data ?? []) {
        const key = String(c.invoice_number);
        const arr = map.get(key) ?? [];
        arr.push(c);
        map.set(key, arr);
      }
      return map;
    },
  });
}

export function CommentHistoryCell({ invoice, editable = true }: { invoice: any; editable?: boolean }) {
  const qc = useQueryClient();
  const { data: byInvoice } = useAllComments();
  const comments = byInvoice?.get(String(invoice.invoiceNumber)) ?? [];
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("invoice_comments").insert({
      invoice_id: invoice.id,
      invoice_number: invoice.invoiceNumber,
      comment_text: text.trim(),
      comment_date: date,
      author: getAuditName() || null,
    });
    setSaving(false);
    if (error) {
      alert("Could not add comment: " + error.message);
      return;
    }
    setText("");
    qc.invalidateQueries({ queryKey: ["invoice-comments"] });
  }

  if (!editable) {
    if (comments.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
    return (
      <div className="space-y-1">
        {comments.map((c: any) => (
          <div key={c.id} className="text-sm">
            <span className="text-muted-foreground">{c.comment_date}:</span> {c.comment_text}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {comments.map((c: any) => (
        <div key={c.id} className="text-sm border-b border-border/40 pb-0.5">
          <span className="text-muted-foreground">
            {c.comment_date}{c.author ? " · " + c.author : ""}:
          </span>{" "}
          {c.comment_text}
        </div>
      ))}
      <div className="flex flex-col gap-1 pt-1">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bg-background border border-border rounded px-1 py-0.5 text-xs"
        />
        <div className="flex gap-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add comment..."
            className="flex-1 bg-background border border-border rounded px-2 py-1 text-sm"
          />
          <button
            onClick={add}
            disabled={saving}
            className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
