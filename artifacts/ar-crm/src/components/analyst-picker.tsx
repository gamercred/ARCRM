import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function AnalystPicker() {
  const { data: analysts } = useQuery({
    queryKey: ["analysts-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("analysts").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = localStorage.getItem("auditName") || "";

  return (
    <select
      value={current}
      onChange={(e) => {
        if (e.target.value) localStorage.setItem("auditName", e.target.value);
        else localStorage.removeItem("auditName");
        window.location.reload();
      }}
      className="bg-background border border-border rounded-lg px-3 py-2 text-sm"
      title="Your name (recorded on every change)"
    >
      <option value="">Your name...</option>
      {(analysts as any[] | undefined)?.map((a) => (
        <option key={a.id} value={a.name}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
