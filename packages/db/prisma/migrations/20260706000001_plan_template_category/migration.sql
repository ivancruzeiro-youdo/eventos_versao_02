-- Add category column to PlanTemplateQuestion (tables already exist in DB)
ALTER TABLE "PlanTemplateQuestion" ADD COLUMN IF NOT EXISTS "category" TEXT;
