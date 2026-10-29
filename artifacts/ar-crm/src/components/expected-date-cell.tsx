import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y}`;
}

function sourceInfo(inv: any): { text: string; cls: string; tip: string } {
  const src = inv.expectedSource ?? (inv.expectedIsOverride ? "manual" : "default");
  if (src === "manual") {
    return { text: "Set by analyst", cls: "text-foreground/60", tip: "Set by analyst" };
  }
  if (src === "history") {
    const a = Number(inv.expectedHistoryAvg ?? 0);
    const n = Number(inv.expectedHistoryCount ?? 0);
    const habit = a > 0 ? `${a}d late` : a < 0 ? `${Math.abs(a)}d early` : "on time";
    return {
      text: `From history · avg ${habit} · ${n} payment${n === 1 ? "" : "s"}`,
      cls: "text-violet-700",
      tip: `Auto: due date ${a >= 0 ? "+" : "−"} ${Math.abs(a)} days, based on this customer's ${n} recorded payment${n === 1 ? "" : "s"}`,
    };
  }
  return { text: "Default · due date + 7", cls: "text-muted-foreground", tip: "Auto: due date + 7 days (no payment history yet)" };
}

export function ExpectedDateCell({ invoice, editable = true }: { invoice: any; editable?: boolean }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string>(invoice.expectedPaymentDate ?? "");
  const [saving, setSaving] = useState(false);
  const isOverride = !!invoice.expectedIsOverride;
  const src = sourceInfo(invoice);

  // keep in step when the calculated date changes (e.g. after a new payment)
  useEffect(() => {
    if (!saving) setValue(invoice.expectedPaymentDate ?? "");
  }, [invoice.expectedPaymentDate]);

  async function save(newVal: string) {
    const prev = value;
    setValue(newVal);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ expected_payment_date: newVal || null })
        .eq("id", invoice.id);
      if (error) {
        alert("Could not save: " + error.message);
        setValue(prev);
        return;
      }
      try { await logAudit(invoice, "expected_payment_date", prev, newVal); } catch (e) { console.warn("audit log failed", e); }
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["all-invoices"] });
    } catch (e: any) {
      alert("Could not save: " + (e?.message || e));
      setValue(prev);
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <div title={src.tip}>
        <div className="text-sm" style={{ color: isOverride ? undefined : "hsl(var(--muted-foreground))" }}>{fmtUS(value)}</div>
        <div className={"text-[10px] leading-tight mt-0.5 " + src.cls}>{src.text}</div>
      </div>
    );
  }

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <input
        type="date"
        value={value}
        disabled={saving}
        onChange={(e) => save(e.target.value)}
        className="w-full bg-background border border-border rounded px-2 py-1 text-sm cursor-pointer"
        style={{ colorScheme: "light", minWidth: "130px", color: isOverride ? undefined : "hsl(var(--muted-foreground))" }}
        title={isOverride ? "Set by analyst" : src.tip + " — pick a date to override"}
      />
      <div className={"text-[10px] leading-tight mt-0.5 flex items-center gap-1.5 " + src.cls}>
        <span>{saving ? "Saving…" : src.text}</span>
        {isOverride && !saving && (
          <button onClick={() => save("")} className="text-primary hover:underline" title="Clear the hand-set date and go back to the automatic one">
            reset to auto
          </button>
        )}
      </div>
    </div>
  );
}
