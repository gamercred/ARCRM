import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

export function ImportArButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets["AR Aging"] ?? wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

      const fmt = (v: any) => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        const s = String(v || "");
        return s.length >= 10 ? s.slice(0, 10) : s || "1970-01-01";
      };
      const num = (v: any) => {
        const n = Number(String(v).replace(/[^0-9.-]/g, ""));
        return isNaN(n) ? 0 : n;
      };
      const slug = (name: string) =>
        name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "") +
        "@import.local";

      const rows = raw.filter(
        (r) =>
          String(r["Invoice number"] || "").trim() !== "" &&
          String(r["Txn currency"] || "").toLowerCase() !== "total",
      );

      let del = await supabase.from("invoices").delete().neq("id", "__none__");
      if (del.error) throw new Error("Clearing invoices: " + del.error.message);
      del = await supabase.from("analysts").delete().neq("id", 0);
      if (del.error) throw new Error("Clearing analysts: " + del.error.message);

      const collectors = Array.from(
        new Set(
          rows.map((r) => String(r["Collector"] || "").trim()).filter((c) => c.length > 0),
        ),
      );
      const nameToId = new Map<string, number>();
      if (collectors.length > 0) {
        const ins = await supabase
          .from("analysts")
          .insert(collectors.map((name) => ({ name, email: slug(name) })))
          .select();
        if (ins.error) throw new Error("Creating analysts: " + ins.error.message);
        for (const a of ins.data as any[]) nameToId.set(a.name, a.id);
      }

      const invoiceRows = rows.map((r) => {
        const category = String(r["Category"] || "").trim();
        const subCategory = String(r["Sub Category"] || "").trim();
        const comments = String(r["Comments"] || "").trim();
        const collector = String(r["Collector"] || "").trim();
        const isDisputed = category.toLowerCase() === "dispute";
        const noteParts = [category, subCategory, comments].filter(Boolean);
        return {
          id: crypto.randomUUID(),
          invoice_number: String(r["Invoice number"]),
          customer_id: String(r["Customer ID"] || ""),
          customer_name: String(r["Customer name"] || ""),
          amount: num(r["Total Open (USD)"]),
          paid_amount: 0,
          currency: "USD",
          issue_date: fmt(r["Invoice date"]),
          due_date: fmt(r["Due date"]),
          analyst_id: collector ? nameToId.get(collector) ?? null : null,
          is_disputed: isDisputed,
          dispute_reason: isDisputed ? subCategory || comments || null : null,
          notes: noteParts.join(" — ") || null,
        };
      });

      const insInv = await supabase.from("invoices").insert(invoiceRows);
      if (insInv.error) throw new Error("Inserting invoices: " + insInv.error.message);

      alert(
        `Imported ${invoiceRows.length} invoices and ${collectors.length} collectors into Supabase. Reloading...`,
      );
      window.location.reload();
    } catch (err: any) {
      alert("Import failed: " + (err?.message || err));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        style={{ display: "none" }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium disabled:opacity-50"
      >
        {busy ? "Importing..." : "Import AR Sheet"}
      </button>
    </>
  );
}
