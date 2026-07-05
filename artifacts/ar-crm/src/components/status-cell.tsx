import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const STATUS_OPTIONS = [
  "PO Issue",
  "Disputed Billing",
  "Billing Issue",
  "P2P (Promise to Pay)",
  "In-Transit Payment",
  "No Response",
  "First Reminder Sent",
  "Escalated",
  "Paid",
];

export function StatusCell({ invoice }: { invoice: any }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(invoice.manualStatus ?? "");
  const [saving, setSaving] = useState(false);

  async function save(newVal: string) {
    const prev = value;
    setValue(newVal);
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ status: newVal || null })
      .eq("id", invoice.id);
    if (!error) {
      await logAudit(invoice, "status", prev, newVal);
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["dashboard-aging"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
    setSaving(false);
    if (error) {
      alert("Could not save status: " + error.message);
      setValue(prev);
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => save(e.target.value)}
      className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
    >
      <option value="">—</option>
      {STATUS_OPTIONS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
