import { useState, KeyboardEvent } from "react";

// Controlled email-chip input. value/onChange work with a comma-separated string
// so it drops into existing send logic unchanged.
export function EmailChips({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const emails = value.split(",").map((e) => e.trim()).filter(Boolean);

  function addEmail(raw: string) {
    const e = raw.trim().replace(/,$/, "");
    if (!e) return;
    if (emails.includes(e)) { setInput(""); return; }
    const next = [...emails, e].join(", ");
    onChange(next);
    setInput("");
  }

  function removeEmail(idx: number) {
    const next = emails.filter((_, i) => i !== idx).join(", ");
    onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addEmail(input);
    } else if (e.key === "Backspace" && !input && emails.length) {
      removeEmail(emails.length - 1);
    }
  }

  return (
    <div className="w-full bg-background border border-border rounded px-2 py-1 text-sm flex flex-wrap gap-1 items-center min-h-[34px]">
      {emails.map((e, i) => (
        <span key={i} className="flex items-center gap-1 bg-primary/15 text-primary rounded px-2 py-0.5 text-xs">
          {e}
          <button type="button" onClick={() => removeEmail(i)} className="hover:text-red-400 leading-none">×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={(ev) => setInput(ev.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => addEmail(input)}
        placeholder={emails.length === 0 ? (placeholder || "Type email, press Enter") : ""}
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
      />
    </div>
  );
}
