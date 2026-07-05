import { useRef, useState } from "react";
import * as XLSX from "xlsx";

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
        return s.length >= 10 ? s.slice(0, 10) : s;
      };
      const num = (v: any) => {
        const n = Number(String(v).replace(/[^0-9.-]/g, ""));
        return isNaN(n) ? 0 : n;
      };

      const rows = raw
        .filter((r) => String(r["Invoice number"] || "").trim() !== "")
        .map((r) => ({
          customerId: r["Customer ID"],
          customerName: r["Customer name"],
          invoiceNumber: r["Invoice number"],
          invoiceDate: fmt(r["Invoice date"]),
          dueDate: fmt(r["Due date"]),
          currency: r["Txn currency"],
          amountUsd: num(r["Total Open (USD)"]),
          collector: r["Collector"],
          category: r["Category"],
          subCategory: r["Sub Category"],
          comments: r["Comments"],
        }));

      const resp = await fetch("/api/import-ar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error || "Import failed");
      alert(
        `Imported ${data.invoices} invoices and ${data.analysts} collectors. Reloading...`,
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
