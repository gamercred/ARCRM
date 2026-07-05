import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const analystsTable = pgTable("analysts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAnalystSchema = createInsertSchema(analystsTable).omit({ id: true, createdAt: true });
export type InsertAnalyst = z.infer<typeof insertAnalystSchema>;
export type Analyst = typeof analystsTable.$inferSelect;
