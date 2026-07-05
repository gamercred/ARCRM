import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db";

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

router.get("/dashboard/summary", async (_req, res) => {
  const invoices = await db.select().from(invoicesTable);
  const today = new Date();

  let totalOutstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let currentCount = 0;
  let notDueCount = 0;
  let disputedCount = 0;
  let disputedAmount = 0;
  let ptpCount = 0;
  let ptpAmountTotal = 0;

  // For DSO: sum of (outstanding * days_since_issue) / total_outstanding
  let weightedAgeDays = 0;

  const customerMap = new Map<string, { customerName: string; outstanding: number; invoiceCount: number }>();

  for (const inv of invoices) {
    const outstanding = Number(inv.amount) - Number(inv.paidAmount);
    if (outstanding <= 0) continue;

    totalOutstanding += outstanding;

    // Weighted age for DSO
    const issuedDate = new Date(inv.issueDate);
    const daysSinceIssue = Math.max(0, Math.floor((today.getTime() - issuedDate.getTime()) / (1000 * 60 * 60 * 24)));
    weightedAgeDays += outstanding * daysSinceIssue;

    const status = computeStatus(inv.dueDate, today);
    if (["overdue_1_30", "overdue_31_60", "overdue_61_90", "overdue_90_plus"].includes(status)) {
      overdueCount++;
      overdueAmount += outstanding;
    } else if (status === "current") {
      currentCount++;
    } else if (status === "not_due") {
      notDueCount++;
    }

    if (inv.isDisputed) {
      disputedCount++;
      disputedAmount += outstanding;
    }

    if (inv.ptpDate) {
      ptpCount++;
      ptpAmountTotal += inv.ptpAmount ? Number(inv.ptpAmount) : outstanding;
    }

    const existing = customerMap.get(inv.customerId);
    if (existing) {
      existing.outstanding += outstanding;
      existing.invoiceCount++;
    } else {
      customerMap.set(inv.customerId, {
        customerName: inv.customerName,
        outstanding,
        invoiceCount: 1,
      });
    }
  }

  // DSO = weighted average age of AR (standard collections method)
  const dso = totalOutstanding > 0 ? Math.round(weightedAgeDays / totalOutstanding) : 0;

  const topCustomers = Array.from(customerMap.entries())
    .map(([customerId, data]) => ({ customerId, ...data }))
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 10);

  res.json({
    totalOutstanding,
    totalInvoices: invoices.length,
    overdueCount,
    overdueAmount,
    currentCount,
    notDueCount,
    collectedThisMonth: 0,
    dso,
    disputedCount,
    disputedAmount,
    ptpCount,
    ptpAmount: ptpAmountTotal,
    topCustomers,
  });
});

router.get("/dashboard/aging", async (_req, res) => {
  const invoices = await db.select().from(invoicesTable);
  const today = new Date();

  const buckets = {
    notDue: { count: 0, amount: 0 },
    current: { count: 0, amount: 0 },
    overdue1to30: { count: 0, amount: 0 },
    overdue31to60: { count: 0, amount: 0 },
    overdue61to90: { count: 0, amount: 0 },
    overdue90plus: { count: 0, amount: 0 },
  };

  for (const inv of invoices) {
    const outstanding = Number(inv.amount) - Number(inv.paidAmount);
    if (outstanding <= 0) continue;
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

  res.json(buckets);
});

export default router;
