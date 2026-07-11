import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

export const STAGE_OPTIONS = [
  "Sales Copied in the email",
  "Escalated to Sales email 1 - AM/CSM",
  "Escalated to Sales email 2 - AM/CSM",
  "Sent to Soft Paywall",
  "Sent to Legal review for Hardpaywall",
  "Suspension Notification to the customer",
  "Hardpaywall Implemented",
  "Initiated Demand Letter in Ironclad",
  "Demand Letter sent to customer",
  "Termination",
  "Write Off",
];

export function ActualStageCell({ invoice, editable = true }: { invoice: any; editable?: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(invoice.actualInvoiceStage ?? "");
  const [saving, setSaving] = useState(false);

  async function save(newVal: string) {
    const prev = value;
    setValue(newVal);
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ actual_invoice_stage: newVal || null })
      .eq("id", invoice.id);
    if (!error) {
      await logAudit(invoice, "actual_invoice_stage", prev, newVal);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
    setSaving(false);
    if (error) {
      alert("Could not save: " + error.message);
      setValue(prev);
    }
  }

  if (!editable) return <span className="text-sm">{value || "—"}</span>;
  return (
    <select
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => save(e.target.value)}
      className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
    >
      <option value="">—</option>
      {STAGE_OPTIONS.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
