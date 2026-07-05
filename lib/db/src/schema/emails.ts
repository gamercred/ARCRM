import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emailThreadsTable = pgTable("email_threads", {
  id: serial("id").primaryKey(),
  subject: text("subject").notNull(),
  invoiceId: text("invoice_id").notNull(),
  customerId: text("customer_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  analystId: integer("analyst_id").notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const emailMessagesTable = pgTable("email_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  direction: text("direction").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddress: text("to_address").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

export const insertEmailThreadSchema = createInsertSchema(emailThreadsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEmailMessageSchema = createInsertSchema(emailMessagesTable).omit({ id: true, sentAt: true });
export type InsertEmailThread = z.infer<typeof insertEmailThreadSchema>;
export type InsertEmailMessage = z.infer<typeof insertEmailMessageSchema>;
export type EmailThread = typeof emailThreadsTable.$inferSelect;
export type EmailMessage = typeof emailMessagesTable.$inferSelect;
