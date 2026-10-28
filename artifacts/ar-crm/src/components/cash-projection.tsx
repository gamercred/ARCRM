import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAllInvoices } from "@/lib/supabase-hooks";

const WEEK_MS = 7 * 86400000;
const FUTURE_WEEKS = 26; // this week + 25 ahead
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}
// Fixed start of the projection: week of 12 Jul 2026
const ANCHOR = weekStart(new Date("2026-07-12T00:00:00")).getTime();

function fmtCur(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function fmtUS(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${m}/${d}/${y}` : iso;
}
function rangeLabel(startMs: number): string {
  const s = new Date(startMs);
  const e = new Date(startMs + 6 * 86400000);
  return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]}`;
}

type Week = { key: number; total: number; count: number; items: any[] };

export function CashProjection() {
  const { data: invoices, isLoading } = useAllInvoices();
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  const [showAllThis, setShowAllThis] = useState(false);
  const [showAllNext, setShowAllNext] = useState(false);

  const d = useMemo(() => {
    const thisWeek = weekStart(new Date()).getTime();
    const start = Math.min(ANCHOR, thisWeek);
    const lastKey = thisWeek + (FUTURE_WEEKS - 1) * WEEK_MS;
    const map = new Map<number, Week>();
    for (let t = start; t <= lastKey; t += WEEK_MS) map.set(t, { key: t, total: 0, count: 0, items: [] });
    const beyond: Week = { key: -1, total: 0, count: 0, items: [] };
    let grand = 0;

    (Array.isArray(invoices) ? invoices : []).forEach((inv: any) => {
      const iso = inv.expectedPaymentDate;
      if (!iso) return;
      const open = Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0);
      if (open <= 0) return;
      const dt = new Date(iso + "T00:00:00");
      if (isNaN(dt.getTime())) return;
      let key = weekStart(dt).getTime();
      if (key < start) key = start; // fold anything before the start into the first week
      const b = key > lastKey ? beyond : map.get(key);
      if (!b) return;
      b.total += open; b.count += 1; b.items.push({ ...inv, open });
      grand += open;
    });

    const all = Array.from(map.values()).sort((a, z) => a.key - z.key);
    all.forEach((w) => w.items.sort((a: any, z: any) => z.open - a.open));
    beyond.items.sort((a: any, z: any) => z.open - a.open);

    const earlier = all.filter((w) => w.key < thisWeek);
    const current = all.find((w) => w.key === thisWeek)!;
    const next = all.find((w) => w.key === thisWeek + WEEK_MS)!;
    const comingUp = all.filter((w) => w.key >= thisWeek + 2 * WEEK_MS && w.key <= thisWeek + 7 * WEEK_MS);
    const later = all.filter((w) => w.key > thisWeek + 7 * WEEK_MS);

    const futureMax = [...comingUp, ...later].reduce((m, w) => Math.max(m, w.total), 0);
    const earlierMax = earlier.reduce((m, w) => Math.max(m, w.total), 0);
    const earlierTotal = earlier.reduce((s, w) => s + w.total, 0);
    const earlierCount = earlier.reduce((s, w) => s + w.count, 0);
    return { thisWeek, current, next, comingUp, later, earlier, beyond, grand, futureMax, earlierMax, earlierTotal, earlierCount };
  }, [invoices]);

  function InvoiceRows({ items, limit }: { items: any[]; limit?: number }) {
    const list = limit ? items.slice(0, limit) : items;
    return (
      <div className="space-y-1">
        {list.map((it: any) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 text-xs items-center">
            <div className="col-span-3 font-medium">{it.invoiceNumber}</div>
            <div className="col-span-5 truncate">
              <Link href={`/customer/${it.customerId}`} className="hover:underline">{it.customerName}</Link>
            </div>
            <div className="col-span-2 opacity-70">{fmtUS(it.expectedPaymentDate)}</div>
            <div className="col-span-2 text-right font-mono">{fmtCur(it.open)}</div>
          </div>
        ))}
      </div>
    );
  }

  function Hero({ w, label, strong, showAll, setShowAll }: { w: Week; label: string; strong: boolean; showAll: boolean; setShowAll: (v: boolean) => void }) {
    const box = strong
      ? "bg-primary text-primary-foreground border-primary"
      : "bg-primary/10 text-foreground border-primary/30";
    return (
      <div className={"rounded-lg border p-4 " + box}>
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</div>
          <div className="text-xs opacity-80">{rangeLabel(w.key)}</div>
        </div>
        <div className="text-3xl font-bold font-mono mt-2">{fmtCur(w.total)}</div>
        <div className="text-xs opacity-80 mt-0.5">{w.count} invoice{w.count === 1 ? "" : "s"} expected</div>
        {w.count > 0 && (
          <div className="mt-3 pt-3 border-t border-current/20">
            <InvoiceRows items={w.items} limit={showAll ? undefined : 4} />
            {w.count > 4 && (
              <button onClick={() => setShowAll(!showAll)} className="text-xs underline opacity-80 hover:opacity-100 mt-2">
                {showAll ? "Show fewer" : `Show all ${w.count}`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function Row({ w, size, max }: { w: Week; size: "normal" | "compact" | "dim"; max: number }) {
    const pct = max > 0 ? (w.total / max) * 100 : 0;
    const isOpen = openWeek === w.key;
    const pad = size === "normal" ? "py-2" : "py-1";
    const text = size === "normal" ? "text-sm" : "text-xs";
    const bar = size === "normal" ? "h-3" : "h-1.5";
    const tone = size === "dim" ? "text-muted-foreground" : "";
    const barColor = size === "dim" ? "bg-muted-foreground/30" : size === "compact" ? "bg-primary/45" : "bg-primary/70";
    return (
      <div>
        <div onClick={() => w.count && setOpenWeek(isOpen ? null : w.key)}
          className={"grid grid-cols-12 gap-3 items-center px-2 rounded " + pad + " " + text + " " + tone + (w.count ? " cursor-pointer hover:bg-muted/30" : " opacity-60")}>
          <div className="col-span-2">{w.count ? (isOpen ? "▾ " : "▸ ") : "  "}{rangeLabel(w.key)}</div>
          <div className="col-span-7"><div className={"rounded bg-muted " + bar}><div className={"rounded " + bar + " " + barColor} style={{ width: pct + "%" }} /></div></div>
          <div className="col-span-2 text-right font-mono">{fmtCur(w.total)}</div>
          <div className="col-span-1 text-right text-muted-foreground">{w.count} inv</div>
        </div>
        {isOpen && <div className="px-4 py-2 bg-muted/20 rounded mb-1"><InvoiceRows items={w.items} /></div>}
      </div>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Projected cash inflow — weekly</CardTitle>
        <span className="text-xs text-muted-foreground">From 12 Jul 2026 · {fmtCur(d.grand)} expected</span>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : (
          <>
            {/* Tier 1 — this week + next week */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Hero w={d.current} label="This week" strong={true} showAll={showAllThis} setShowAll={setShowAllThis} />
              <Hero w={d.next} label="Next week" strong={false} showAll={showAllNext} setShowAll={setShowAllNext} />
            </div>

            {/* Tier 2 — weeks 3 to 8 */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-2">Coming up</div>
              {d.comingUp.map((w) => <Row key={w.key} w={w} size="normal" max={d.futureMax} />)}
            </div>

            {/* Tier 3 — week 9 onwards */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 px-2">Later</div>
              {d.later.map((w) => <Row key={w.key} w={w} size="compact" max={d.futureMax} />)}
              {d.beyond.count > 0 && (
                <div className="grid grid-cols-12 gap-3 items-center px-2 py-1 text-xs text-muted-foreground">
                  <div className="col-span-9">Beyond {FUTURE_WEEKS} weeks</div>
                  <div className="col-span-2 text-right font-mono">{fmtCur(d.beyond.total)}</div>
                  <div className="col-span-1 text-right">{d.beyond.count} inv</div>
                </div>
              )}
            </div>

            {/* Earlier weeks — collapsed */}
            {d.earlier.length > 0 && (
              <div className="border-t border-border pt-3">
                <div onClick={() => setShowEarlier(!showEarlier)}
                  className="grid grid-cols-12 gap-3 items-center px-2 py-1 text-xs text-muted-foreground cursor-pointer hover:bg-muted/30 rounded">
                  <div className="col-span-9">{showEarlier ? "▾" : "▸"} Earlier weeks ({d.earlier.length} weeks, expected date already passed)</div>
                  <div className="col-span-2 text-right font-mono">{fmtCur(d.earlierTotal)}</div>
                  <div className="col-span-1 text-right">{d.earlierCount} inv</div>
                </div>
                {showEarlier && d.earlier.map((w) => <Row key={w.key} w={w} size="dim" max={d.earlierMax} />)}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
