import { pgTable, text, numeric, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const invoicesTable = pgTable("invoices", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  customerId: text("customer_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 15, scale: 2 }).default("0").notNull(),
  currency: text("currency").default("USD").notNull(),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date").notNull(),
  analystId: integer("analyst_id"),
  netsuiteId: text("netsuite_id"),
  salesforceId: text("salesforce_id"),
  lastContactDate: date("last_contact_date"),
  notes: text("notes"),
  ptpDate: date("ptp_date"),
  ptpAmount: numeric("ptp_amount", { precision: 15, scale: 2 }),
  isDisputed: boolean("is_disputed").default(false).notNull(),
  disputeReason: text("dispute_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvoiceSchema = createInsertSchema(invoicesTable);
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoicesTable.$inferSelect;
