import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

// ISO (yyyy-mm-dd) -> mm/dd/yyyy for display
function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

export function ExpectedDateCell({ invoice, editable = true }: { invoice: any; editable?: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(invoice.expectedPaymentDate ?? "");
  const [isOverride, setIsOverride] = useState<boolean>(!!invoice.expectedIsOverride);
  const [saving, setSaving] = useState(false);

  async function save(newVal: string) {
    const prev = value;
    setValue(newVal);
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ expected_payment_date: newVal || null })
      .eq("id", invoice.id);
    if (!error) {
      await logAudit(invoice, "expected_payment_date", prev, newVal);
      setIsOverride(!!newVal);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
    setSaving(false);
    if (error) {
      alert("Could not save: " + error.message);
      setValue(prev);
    }
  }

  if (!editable) {
    return (
      <span
        className="text-sm"
        style={{ color: isOverride ? undefined : "#8A97A8" }}
        title={isOverride ? "Set by analyst" : "Auto: due date + 7 days"}
      >
        {fmtUS(value)}
      </span>
    );
  }

  return (
    <input
      type="date"
      value={value}
      disabled={saving}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => save(e.target.value)}
      className="w-full bg-background border border-border rounded px-2 py-1 text-sm"
      style={{ color: isOverride ? undefined : "#8A97A8" }}
      title={isOverride ? "Set by analyst" : "Auto: due date + 7 days — pick a date to override"}
    />
  );
}
