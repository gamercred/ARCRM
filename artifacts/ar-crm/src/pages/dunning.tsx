import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={"w-9 h-5 rounded-full transition-colors relative shrink-0 " + (on ? "bg-primary" : "bg-muted")}>
      <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " + (on ? "left-4" : "left-0.5")} />
    </button>
  );
}

function channelStyle(ch: string) {
  if (ch === "Task") return "bg-violet-500/15 text-violet-700";
  if (ch && ch.includes("SMS")) return "bg-amber-500/15 text-amber-700";
  return "bg-blue-500/15 text-blue-700";
}

export default function Dunning() {
  const qc = useQueryClient();

  const { data: seq } = useQuery({
    queryKey: ["dunning-seq"],
    queryFn: async () => {
      const { data } = await supabase.from("dunning_sequences").select("*").order("id").limit(1).maybeSingle();
      return data;
    },
  });
  const { data: steps } = useQuery({
    queryKey: ["dunning-steps", seq?.id],
    enabled: !!seq?.id,
    queryFn: async () => {
      const { data } = await supabase.from("dunning_steps").select("*").eq("sequence_id", seq.id).order("sort_order");
      return data ?? [];
    },
  });
  const { data: templates } = useQuery({
    queryKey: ["dunning-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("dunning_templates").select("*").order("id");
      return data ?? [];
    },
  });
  const { data: stats } = useQuery({
    queryKey: ["dunning-stats"],
    queryFn: async () => {
      const { data } = await supabase.from("dunning_stats").select("*").order("sort_order");
      return data ?? [];
    },
  });

  async function toggleStep(id: number, cur: boolean) {
    await supabase.from("dunning_steps").update({ enabled: !cur }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["dunning-steps", seq?.id] });
  }

  const stepList = Array.isArray(steps) ? steps : [];
  const tplList = Array.isArray(templates) ? templates : [];
  const statList = Array.isArray(stats) ? stats : [];

  function dayLabel(d: number) {
    return d < 0 ? `Day ${d}` : `Day ${d}`;
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dunning &amp; correspondence</h1>
          <p className="text-sm text-muted-foreground mt-1">Automated reminder sequences and templates that nudge customers before a human has to.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted/40">Templates</button>
          <button className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground">+ New sequence</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sequence steps */}
        <Card className="bg-card lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">{seq?.name ?? "Sequence"}</CardTitle>
              {seq?.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 font-medium">Active</span>}
            </div>
            <span className="text-xs text-muted-foreground">{seq?.enrolled_count ?? 0} customers enrolled</span>
          </CardHeader>
          <CardContent>
            <div className="relative pl-6">
              <div className="absolute left-[9px] top-1 bottom-1 w-px bg-border" />
              <div className="space-y-5">
                {stepList.map((st: any) => (
                  <div key={st.id} className="relative">
                    <div className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-primary bg-card" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{dayLabel(st.day_offset)} · {st.title}</div>
                        <div className="text-sm text-muted-foreground">{st.description}</div>
                        {st.meta && <div className="text-xs text-muted-foreground/70 mt-0.5">{st.meta}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={"text-[11px] px-2 py-0.5 rounded font-medium " + channelStyle(st.channel)}>{st.channel}</span>
                        <Toggle on={st.enabled} onClick={() => toggleStep(st.id, st.enabled)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right column: templates + stats */}
        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Templates</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {tplList.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">Used {t.used_count?.toLocaleString?.() ?? t.used_count}×</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Sent this week</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {statList.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b border-border/60 last:border-0 py-1">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-mono font-medium">{s.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
