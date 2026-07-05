import { supabase } from "@/lib/supabase";

export function getAuditName(): string {
  return localStorage.getItem("auditName") || "Unknown";
}

export async function logAudit(
  invoice: any,
  field: string,
  oldVal: string,
  newVal: string,
) {
  await supabase.from("audit_log").insert({
    invoice_id: invoice.id,
    invoice_number: invoice.invoiceNumber,
    field,
    old_value: oldVal || null,
    new_value: newVal || null,
    changed_by: getAuditName(),
  });
}
