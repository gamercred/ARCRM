import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export function CommentsCell({ invoice }: { invoice: any }) {
  const qc = useQueryClient();
  const original = invoice.comments ?? "";
  const [value, setValue] = useState<string>(original);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (value === original) return;
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ comments: value || null })
      .eq("id", invoice.id);
    if (!error) {
      await logAudit(invoice, "comments", original, value);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
    setSaving(false);
    if (error) alert("Could not save comment: " + error.message);
  }

  return (
    <input
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      placeholder="Add comment..."
      className="bg-background border border-border rounded px-2 py-1 text-sm w-[220px]"
    />
  );
}
