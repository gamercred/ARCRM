import { Router } from "express";
import { db } from "@workspace/db";
import { invoicesTable, analystsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListInvoicesQueryParams,
  GetInvoiceParams,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
} from "@workspace/api-zod";

const router = Router();

function computeStatus(dueDate: string, today: Date) {
  const due = new Date(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { status: "not_due", overdueDays: 0 };
  if (diffDays === 0) return { status: "current", overdueDays: 0 };
  if (diffDays <= 30) return { status: "overdue_1_30", overdueDays: diffDays };
  if (diffDays <= 60) return { status: "overdue_31_60", overdueDays: diffDays };
  if (diffDays <= 90) return { status: "overdue_61_90", overdueDays: diffDays };
  return { status: "overdue_90_plus", overdueDays: diffDays };
}

function formatInvoice(row: typeof invoicesTable.$inferSelect, analysts: Map<number, string>, today: Date) {
  const { status, overdueDays } = computeStatus(row.dueDate, today);
  const analystName = row.analystId ? (analysts.get(row.analystId) ?? null) : null;
  return {
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    customerName: row.customerName,
    customerEmail: row.customerEmail ?? null,
    amount: Number(row.amount),
    paidAmount: Number(row.paidAmount),
    currency: row.currency,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    status,
    overdueDays,
    analystId: row.analystId ?? null,
    analystName,
    netsuiteId: row.netsuiteId ?? null,
    salesforceId: row.salesforceId ?? null,
    lastContactDate: row.lastContactDate ?? null,
    notes: row.notes ?? null,
    ptpDate: row.ptpDate ?? null,
    ptpAmount: row.ptpAmount ? Number(row.ptpAmount) : null,
    isDisputed: row.isDisputed ?? false,
    disputeReason: row.disputeReason ?? null,
  };
}

router.get("/invoices", async (req, res) => {
  const parsed = ListInvoicesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { status, analystId, customerId, search, disputed, page, pageSize } = parsed.data;
  const today = new Date();

  const allInvoices = await db.select().from(invoicesTable);
  const analystRows = await db.select().from(analystsTable);
  const analystMap = new Map(analystRows.map((a) => [a.id, a.name]));

  let formatted = allInvoices.map((inv) => formatInvoice(inv, analystMap, today));

  if (status && status !== "all") {
    formatted = formatted.filter((inv) => inv.status === status);
  }
  if (analystId != null) {
    formatted = formatted.filter((inv) => inv.analystId === analystId);
  }
  if (customerId) {
    formatted = formatted.filter((inv) => inv.customerId === customerId);
  }
  if (disputed != null) {
    formatted = formatted.filter((inv) => inv.isDisputed === disputed);
  }
  if (search) {
    const q = search.toLowerCase();
    formatted = formatted.filter(
      (inv) =>
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q)
    );
  }

  const total = formatted.length;
  const p = page ?? 1;
  const ps = pageSize ?? 50;
  const paginated = formatted.slice((p - 1) * ps, p * ps);

  res.json({ invoices: paginated, total, page: p, pageSize: ps });
});

router.get("/invoices/:id", async (req, res) => {
  const params = GetInvoiceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const analystRows = await db.select().from(analystsTable);
  const analystMap = new Map(analystRows.map((a) => [a.id, a.name]));
  res.json(formatInvoice(rows[0], analystMap, new Date()));
});

router.patch("/invoices/:id", async (req, res) => {
  const params = UpdateInvoiceParams.safeParse(req.params);
  const body = UpdateInvoiceBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body.data.analystId !== undefined) update.analystId = body.data.analystId;
  if (body.data.notes !== undefined) update.notes = body.data.notes;
  if (body.data.lastContactDate !== undefined) update.lastContactDate = body.data.lastContactDate;
  if (body.data.ptpDate !== undefined) update.ptpDate = body.data.ptpDate;
  if (body.data.ptpAmount !== undefined) update.ptpAmount = body.data.ptpAmount;
  if (body.data.isDisputed !== undefined) update.isDisputed = body.data.isDisputed;
  if (body.data.disputeReason !== undefined) update.disputeReason = body.data.disputeReason;

  await db.update(invoicesTable).set(update).where(eq(invoicesTable.id, params.data.id));
  const rows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const analystRows = await db.select().from(analystsTable);
  const analystMap = new Map(analystRows.map((a) => [a.id, a.name]));
  res.json(formatInvoice(rows[0], analystMap, new Date()));
});

export default router;
