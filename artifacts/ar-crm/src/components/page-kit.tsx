import type { ReactNode } from "react";
import { Search } from "lucide-react";

// Page title block with bottom rule (mockup header)
export function PageHeader({ title, subtitle, eyebrow, actions }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        {eyebrow && <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{eyebrow}</div>}
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// Metric card: label + icon/badge, big mono value, footer line
export function StatCard({ label, value, icon, iconTone = "bg-muted text-muted-foreground", badge, valueClass = "",
  footerLeft, footerRight, onClick, active }: {
  label: ReactNode; value: ReactNode; icon?: ReactNode; iconTone?: string; badge?: ReactNode; valueClass?: string;
  footerLeft?: ReactNode; footerRight?: ReactNode; onClick?: () => void; active?: boolean;
}) {
  return (
    <div onClick={onClick}
      className={"bg-card p-4 rounded-xl border border-border shadow-sm transition-colors hover:border-foreground/20 " +
        (onClick ? "cursor-pointer " : "") + (active ? "ring-2 ring-primary" : "")}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {badge ? badge : icon ? <span className={"p-1 rounded " + iconTone}>{icon}</span> : null}
      </div>
      <div className={"text-2xl font-semibold font-mono tracking-tight " + valueClass}>{value}</div>
      {(footerLeft || footerRight) && (
        <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-border text-[11px] text-muted-foreground">
          <span className="truncate">{footerLeft}</span>
          {footerRight && <span className="font-mono shrink-0">{footerRight}</span>}
        </div>
      )}
    </div>
  );
}

// Panel: optional title/toolbar strip, body, optional footer strip
export function Panel({ title, toolbar, footer, children, className = "" }: {
  title?: ReactNode; toolbar?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={"bg-card rounded-xl border border-border shadow-sm overflow-hidden " + className}>
      {(title || toolbar) && (
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30">
          {title ? <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div> : <span />}
          {toolbar && <div className="flex items-center gap-2 flex-wrap">{toolbar}</div>}
        </div>
      )}
      <div>{children}</div>
      {footer && <div className="px-5 py-3 bg-muted/30 border-t border-border text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = "Search…", className = "sm:w-72" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={"relative w-full " + className}>
      <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-background pl-9 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[];
}) {
  return (
    <div className="bg-muted p-0.5 rounded-lg flex items-center border border-border">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={"px-3 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-all " +
            (value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.icon}{o.label}
        </button>
      ))}
    </div>
  );
}

const CHIP_TONES: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-primary/10 text-primary border-primary/20",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
};
export function Chip({ tone = "neutral", children, className = "" }: {
  tone?: "neutral" | "brand" | "green" | "amber" | "red" | "violet"; children: ReactNode; className?: string;
}) {
  return <span className={"inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium " + CHIP_TONES[tone] + " " + className}>{children}</span>;
}

// Column header row for grid-based tables
export function GridHead({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border">{children}</div>;
}

export const btnPrimary = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 shadow-sm";
export const btnSecondary = "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-card border border-border hover:bg-muted/50 disabled:opacity-50 shadow-sm";
