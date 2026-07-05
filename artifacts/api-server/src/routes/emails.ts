import { Router } from "express";
import { db } from "@workspace/db";
import { emailThreadsTable, emailMessagesTable, invoicesTable, analystsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListEmailThreadsQueryParams,
  CreateEmailThreadBody,
  GetEmailThreadParams,
  ReplyEmailThreadParams,
  ReplyEmailThreadBody,
  CloseEmailThreadParams,
} from "@workspace/api-zod";

const router = Router();

async function buildThread(thread: typeof emailThreadsTable.$inferSelect, analystMap: Map<number, string>) {
  const messages = await db.select().from(emailMessagesTable).where(eq(emailMessagesTable.threadId, thread.id));
  const invoice = await db.select().from(invoicesTable).where(eq(invoicesTable.id, thread.invoiceId));

  return {
    id: thread.id,
    subject: thread.subject,
    invoiceId: thread.invoiceId,
    invoiceNumber: invoice[0]?.invoiceNumber ?? thread.invoiceId,
    customerId: thread.customerId,
    customerName: invoice[0]?.customerName ?? thread.customerId,
    customerEmail: thread.customerEmail,
    analystId: thread.analystId,
    analystName: analystMap.get(thread.analystId) ?? "Unknown",
    status: thread.status,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    messages: messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      direction: m.direction,
      from: m.fromAddress,
      to: m.toAddress,
      body: m.body,
      sentAt: m.sentAt.toISOString(),
    })),
  };
}

router.get("/emails", async (req, res) => {
  const parsed = ListEmailThreadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const { analystId, status, invoiceId } = parsed.data;

  let threads = await db.select().from(emailThreadsTable);

  if (analystId != null) threads = threads.filter((t) => t.analystId === analystId);
  if (status && status !== "all") threads = threads.filter((t) => t.status === status);
  if (invoiceId) threads = threads.filter((t) => t.invoiceId === invoiceId);

  threads.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const analysts = await db.select().from(analystsTable);
  const analystMap = new Map(analysts.map((a) => [a.id, a.name]));

  const result = await Promise.all(threads.map((t) => buildThread(t, analystMap)));
  res.json(result);
});

router.post("/emails", async (req, res) => {
  const body = CreateEmailThreadBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { invoiceId, analystId, to, body: emailBody } = body.data;

  const invoiceRows = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  const invoice = invoiceRows[0];
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  const analystRows = await db.select().from(analystsTable).where(eq(analystsTable.id, analystId));
  const analyst = analystRows[0];
  if (!analyst) {
    res.status(404).json({ error: "Analyst not found" });
    return;
  }

  const subject = `Collections Follow-up: Invoice ${invoice.invoiceNumber} - ${invoice.customerName}`;

  const [thread] = await db.insert(emailThreadsTable).values({
    subject,
    invoiceId,
    customerId: invoice.customerId,
    customerEmail: to,
    analystId,
    status: "awaiting_reply",
  }).returning();

  await db.insert(emailMessagesTable).values({
    threadId: thread.id,
    direction: "outbound",
    fromAddress: analyst.email,
    toAddress: to,
    body: emailBody,
  });

  const analystMap = new Map([[analyst.id, analyst.name]]);
  res.status(201).json(await buildThread(thread, analystMap));
});

router.get("/emails/:id", async (req, res) => {
  const params = GetEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const analysts = await db.select().from(analystsTable);
  const analystMap = new Map(analysts.map((a) => [a.id, a.name]));
  res.json(await buildThread(rows[0], analystMap));
});

router.post("/emails/:id/reply", async (req, res) => {
  const params = ReplyEmailThreadParams.safeParse({ id: Number(req.params.id) });
  const body = ReplyEmailThreadBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const threadRows = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, params.data.id));
  if (!threadRows.length) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }
  const thread = threadRows[0];
  const analysts = await db.select().from(analystsTable).where(eq(analystsTable.id, thread.analystId));
  const analyst = analysts[0];

  const isInbound = body.data.direction === "inbound";
  const [message] = await db.insert(emailMessagesTable).values({
    threadId: thread.id,
    direction: body.data.direction,
    fromAddress: isInbound ? thread.customerEmail : (analyst?.email ?? "collections@company.com"),
    toAddress: isInbound ? (analyst?.email ?? "collections@company.com") : thread.customerEmail,
    body: body.data.body,
  }).returning();

  const newStatus = isInbound ? "open" : "awaiting_reply";
  await db.update(emailThreadsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(emailThreadsTable.id, thread.id));

  res.status(201).json({
    id: message.id,
    threadId: message.threadId,
    direction: message.direction,
    from: message.fromAddress,
    to: message.toAddress,
    body: message.body,
    sentAt: message.sentAt.toISOString(),
  });
});

router.post("/emails/:id/close", async (req, res) => {
  const params = CloseEmailThreadParams.safeParse({ id: Number(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, params.data.id));
  if (!rows.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await db.update(emailThreadsTable)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(emailThreadsTable.id, params.data.id));

  const updated = await db.select().from(emailThreadsTable).where(eq(emailThreadsTable.id, params.data.id));
  const analysts = await db.select().from(analystsTable);
  const analystMap = new Map(analysts.map((a) => [a.id, a.name]));
  res.json(await buildThread(updated[0], analystMap));
});

export default router;
