import { Router } from "express";
import { db } from "@workspace/db";
import { analystsTable, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetAnalystParams, GetAnalystSummaryParams } from "@workspace/api-zod";

const router = Router();

function computeStatus(dueDate: string, today: Date) {
  const due = new Date(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "not_due";
  if (diffDays === 0) return "current";
  if (diffDays <= 30) return "overdue_1_30";
  if (diffDays <= 60) return "overdue_31_60";
  if (diffDays <= 90) return "overdue_61_90";
  return "overdue_90_plus";
}

router.get("/analysts", async (_req, res) => {
  const analysts = await db.select().from(analystsTable);
  const invoices = await db.select().from(invoicesTable);

  const result = analysts.map((a) => {
    const portfolio = invoices.filter((inv) => inv.analystId === a.id);
    const totalOutstanding = portfolio.reduce(
      (sum, inv) => sum + Number(inv.amount) - Number(inv.paidAmount),
      0
    );
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      portfolioCount: portfolio.length,
      totalOutstanding,
    };
  });

  res.json(result);
});

router.get("/analysts/:id", async (req, res) => {
  const params = GetAnalystParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(analystsTable).where(eq(analystsTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const a = rows[0];
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.analystId, a.id));
  const totalOutstanding = invoices.reduce(
    (sum, inv) => sum + Number(inv.amount) - Number(inv.paidAmount),
    0
  );
  res.json({
    id: a.id,
    name: a.name,
    email: a.email,
    portfolioCount: invoices.length,
    totalOutstanding,
  });
});

router.get("/analysts/:id/summary", async (req, res) => {
  const params = GetAnalystSummaryParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(analystsTable).where(eq(analystsTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const analyst = rows[0];
  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.analystId, analyst.id));
  const today = new Date();

  const buckets = {
    notDue: { count: 0, amount: 0 },
    current: { count: 0, amount: 0 },
    overdue1to30: { count: 0, amount: 0 },
    overdue31to60: { count: 0, amount: 0 },
    overdue61to90: { count: 0, amount: 0 },
    overdue90plus: { count: 0, amount: 0 },
  };

  let totalOutstanding = 0;

  for (const inv of invoices) {
    const outstanding = Number(inv.amount) - Number(inv.paidAmount);
    totalOutstanding += outstanding;
    const status = computeStatus(inv.dueDate, today);
    const key =
      status === "not_due" ? "notDue" :
      status === "current" ? "current" :
      status === "overdue_1_30" ? "overdue1to30" :
      status === "overdue_31_60" ? "overdue31to60" :
      status === "overdue_61_90" ? "overdue61to90" : "overdue90plus";
    buckets[key].count++;
    buckets[key].amount += outstanding;
  }

  res.json({
    analystId: analyst.id,
    analystName: analyst.name,
    totalInvoices: invoices.length,
    totalOutstanding,
    aging: buckets,
  });
});

export default router;
