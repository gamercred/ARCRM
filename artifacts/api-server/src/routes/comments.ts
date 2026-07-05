import { Router } from "express";
import { db } from "@workspace/db";
import { commentsTable, analystsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListInvoiceCommentsParams, CreateInvoiceCommentParams, CreateInvoiceCommentBody } from "@workspace/api-zod";

const router = Router();

router.get("/invoices/:id/comments", async (req, res) => {
  const params = ListInvoiceCommentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const rows = await db.select().from(commentsTable).where(eq(commentsTable.invoiceId, params.data.id));
  const analysts = await db.select().from(analystsTable);
  const analystMap = new Map(analysts.map((a) => [a.id, a.name]));

  res.json(
    rows.map((c) => ({
      id: c.id,
      invoiceId: c.invoiceId,
      authorId: c.authorId,
      authorName: analystMap.get(c.authorId) ?? "Unknown",
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    }))
  );
});

router.post("/invoices/:id/comments", async (req, res) => {
  const params = CreateInvoiceCommentParams.safeParse(req.params);
  const body = CreateInvoiceCommentBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const inserted = await db.insert(commentsTable).values({
    invoiceId: params.data.id,
    authorId: body.data.authorId,
    body: body.data.body,
  }).returning();

  const analysts = await db.select().from(analystsTable).where(eq(analystsTable.id, body.data.authorId));
  const authorName = analysts[0]?.name ?? "Unknown";

  const c = inserted[0];
  res.status(201).json({
    id: c.id,
    invoiceId: c.invoiceId,
    authorId: c.authorId,
    authorName,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
  });
});

export default router;
