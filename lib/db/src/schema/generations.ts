import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const generationsTable = pgTable("generations", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().default("pending"),
  uploadedImageUrl: text("uploaded_image_url"),
  previewImageUrl: text("preview_image_url"),
  modelGlbUrl: text("model_glb_url"),
  modelObjUrl: text("model_obj_url"),
  modelUsdzUrl: text("model_usdz_url"),
  furnitureType: text("furniture_type"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGenerationSchema = createInsertSchema(generationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGeneration = z.infer<typeof insertGenerationSchema>;
export type Generation = typeof generationsTable.$inferSelect;
