import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useAllInvoices } from "@/lib/supabase-hooks";
import { formatCurrency, formatDate } from "@/lib/format";

const WEEK_MS = 7 * 86400000;
const HORIZON = 22;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday
  return x;
}
function shortDate(d: Date): string {
  return d.getDate() + " " + MONTHS[d.getMonth()];
}
// Fiscal year Feb–Jan: Q1 Feb–Apr, Q2 May–Jul, Q3 Aug–Oct, Q4 Nov–Jan
function fiscalQuarter(d: Date) {
  const m = d.getMonth();
  const q = Math.floor(((m - 1 + 12) % 12) / 3) + 1;
  const startMonth = 1 + (q - 1) * 3;
  const startYear = m === 0 ? d.getFullYear() - 1 : d.getFullYear();
  const endMonthRaw = startMonth + 2;
  const endMonth = endMonthRaw % 12;
  const endYear = startYear + (endMonthRaw > 11 ? 1 : 0);
  return {
    key: startYear + "-Q" + q,
    short: "Q" + q,
    label: "Q" + q + " · " + MONTHS[startMonth] + " " + startYear + " – " + MONTHS[endMonth] + " " + endYear,
  };
}

type Bucket = { total: number; count: number; items: any[] };

export default function Forecast() {
  const { data: invoices, isLoading } = useAllInvoices();
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const data = useMemo(() => {
    const thisWeek = weekStart(new Date()).getTime();
    const weeks: { idx: number; start: Date; end: Date; q: ReturnType<typeof fiscalQuarter>; b: Bucket }[] = [];
    for (let i = 0; i < HORIZON; i++) {
      const start = new Date(thisWeek + i * WEEK_MS);
      const end = new Date(start.getTime() + 6 * 86400000);
      weeks.push({ idx: i, start, end, q: fiscalQuarter(end), b: { total: 0, count: 0, items: [] } });
    }
    const prior: Bucket = { total: 0, count: 0, items: [] };
    const beyond: Bucket = { total: 0, count: 0, items: [] };
    let noDate = 0;

    (Array.isArray(invoices) ? invoices : []).forEach((inv: any) => {
      const open = Number(inv.amount ?? 0) - Number(inv.paidAmount ?? 0);
      if (open <= 0.01) return;
      const iso = inv.expectedPaymentDate;
      if (!iso) { noDate += open; return; }
      const d = new Date(iso + "T00:00:00");
      if (isNaN(d.getTime())) { noDate += open; return; }
      const key = weekStart(d).getTime();
      const row = { ...inv, open };
      let target: Bucket;
      if (key < thisWeek) target = prior;
      else {
        const idx = Math.round((key - thisWeek) / WEEK_MS);
        target = idx < HORIZON ? weeks[idx].b : beyond;
      }
      target.total += open; target.count += 1; target.items.push(row);
    });

    // group weeks by fiscal quarter, in order
    const quarters: { key: string; label: string; short: string; total: number; count: number; weeks: typeof weeks }[] = [];
    weeks.forEach((w) => {
      let g = quarters.find((x) => x.key === w.q.key);
      if (!g) { g = { key: w.q.key, label: w.q.label, short: w.q.short, total: 0, count: 0, weeks: [] }; quarters.push(g); }
      g.weeks.push(w); g.total += w.b.total; g.count += w.b.count;
    });
    weeks.forEach((w) => w.b.items.sort((a, z) => (a.expectedPaymentDate < z.expectedPaymentDate ? -1 : 1)));

    const horizonTotal = weeks.reduce((s, w) => s + w.b.total, 0);
    const maxWeek = weeks.reduce((m, w) => Math.max(m, w.b.total), 0);
    return { weeks, quarters, prior, beyond, noDate, horizonTotal, maxWeek };
  }, [invoices]);

  function InvoiceList({ items }: { items: any[] }) {
    return (
      <div className="bg-muted/20 px-4 py-2">
        <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground pb-1">
          <div className="col-span-3">Invoice</div>
          <div className="col-span-4">Customer</div>
          <div className="col-span-2">Expected</div>
          <div className="col-span-3 text-right">Open amount</div>
        </div>
        {items.map((it: any) => (
          <div key={it.id} className="grid grid-cols-12 gap-2 text-xs items-center py-1 border-t border-border/40">
            <div className="col-span-3">{it.invoiceNumber}</div>
            <div className="col-span-4 truncate"><Link href={`/customer/${it.customerId}`} className="text-primary hover:underline">{it.customerName}</Link></div>
            <div className="col-span-2 text-muted-foreground">{formatDate(it.expectedPaymentDate)}</div>
            <div className="col-span-3 text-right font-mono">{formatCurrency(it.open, "USD")}</div>
          </div>
        ))}
      </div>
    );
  }

  function ExtraRow({ id, label, sub, b }: { id: string; label: string; sub: string; b: Bucket }) {
    if (b.count === 0) return null;
    return (
      <div className="border-b border-border/50">
        <div onClick={() => setOpenWeek(openWeek === id ? null : id)} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm items-center cursor-pointer hover:bg-muted/30">
          <div className="col-span-5 font-medium"><span className="text-muted-foreground mr-1">{openWeek === id ? "▾" : "▸"}</span>{label} <span className="text-xs text-muted-foreground">· {sub}</span></div>
          <div className="col-span-4" />
          <div className="col-span-1 text-right text-muted-foreground">{b.count}</div>
          <div className="col-span-2 text-right font-mono">{formatCurrency(b.total, "USD")}</div>
        </div>
        {openWeek === id && <InvoiceList items={b.items} />}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">22-week cash forecast</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Booked AR — open invoices by expected payment date, grouped by fiscal quarter (FY Feb–Jan). Week 1 is the current week.
          Scheduled billings and new bookings will be added as separate sources later.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Next 22 weeks</div>
          <div className="text-2xl font-bold font-mono text-primary mt-1">{formatCurrency(data.horizonTotal, "USD")}</div>
        </CardContent></Card>
        {data.quarters.slice(0, 2).map((q) => (
          <Card key={q.key} className="bg-card"><CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">{q.label}</div>
            <div className="text-2xl font-bold font-mono mt-1">{formatCurrency(q.total, "USD")}</div>
            <div className="text-xs text-muted-foreground mt-1">{q.count} invoices</div>
          </CardContent></Card>
        ))}
        <Card className="bg-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Expected date passed</div>
          <div className="text-2xl font-bold font-mono text-red-700 mt-1">{formatCurrency(data.prior.total, "USD")}</div>
          <div className="text-xs text-muted-foreground mt-1">{data.prior.count} invoices — need a new date</div>
        </CardContent></Card>
      </div>

      <Card className="bg-card">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Weekly forecast</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
                <div className="col-span-1">Week</div>
                <div className="col-span-2">Week ending</div>
                <div className="col-span-1">Qtr</div>
                <div className="col-span-5">Share of horizon</div>
                <div className="col-span-1 text-right">Inv</div>
                <div className="col-span-2 text-right">Expected</div>
              </div>

              <ExtraRow id="prior" label="Prior" sub="expected date already passed" b={data.prior} />

              {data.quarters.map((q) => (
                <div key={q.key}>
                  {q.weeks.map((w) => {
                    const id = "w" + w.idx;
                    const pct = data.maxWeek > 0 ? (w.b.total / data.maxWeek) * 100 : 0;
                    return (
                      <div key={id} className="border-b border-border/50">
                        <div onClick={() => w.b.count && setOpenWeek(openWeek === id ? null : id)}
                          className={"grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center " + (w.b.count ? "cursor-pointer hover:bg-muted/30" : "text-muted-foreground")}>
                          <div className="col-span-1">{w.b.count ? (openWeek === id ? "▾ " : "▸ ") : "  "}{w.idx + 1}</div>
                          <div className="col-span-2">{shortDate(w.end)}</div>
                          <div className="col-span-1"><span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{w.q.short}</span></div>
                          <div className="col-span-5"><div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-primary/70" style={{ width: pct + "%" }} /></div></div>
                          <div className="col-span-1 text-right">{w.b.count}</div>
                          <div className="col-span-2 text-right font-mono">{formatCurrency(w.b.total, "USD")}</div>
                        </div>
                        {openWeek === id && <InvoiceList items={w.b.items} />}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-sm items-center bg-muted/40 border-b border-border font-semibold">
                    <div className="col-span-9">{q.label} subtotal</div>
                    <div className="col-span-1 text-right">{q.count}</div>
                    <div className="col-span-2 text-right font-mono">{formatCurrency(q.total, "USD")}</div>
                  </div>
                </div>
              ))}

              <ExtraRow id="beyond" label="Beyond 22 weeks" sub="expected after the horizon" b={data.beyond} />

              <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center font-bold">
                <div className="col-span-9">Total — next 22 weeks</div>
                <div className="col-span-1 text-right">{data.weeks.reduce((s, w) => s + w.b.count, 0)}</div>
                <div className="col-span-2 text-right font-mono text-primary">{formatCurrency(data.horizonTotal, "USD")}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
