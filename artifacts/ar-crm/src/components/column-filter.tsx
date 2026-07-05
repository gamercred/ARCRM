import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export function ColumnFilter({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const active = value !== "";
  return (
    <div className="flex items-center gap-1">
      <span>{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={`p-0.5 rounded hover:bg-muted ${active ? "text-blue-500" : "text-muted-foreground"}`}
            title="Filter"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem onClick={() => onChange("")}>
            <span className={!active ? "font-semibold" : ""}>All</span>
          </DropdownMenuItem>
          {values.map((v) => (
            <DropdownMenuItem key={v} onClick={() => onChange(v)}>
              <span className={value === v ? "font-semibold text-blue-500" : ""}>
                {v || "(blank)"}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
