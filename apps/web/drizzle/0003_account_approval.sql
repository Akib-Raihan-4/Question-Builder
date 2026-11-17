CREATE TYPE "public"."account_status" AS ENUM('pending', 'active');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" "account_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "approved_by" text;--> statement-breakpoint
-- Accounts that existed before sign-up opened were created by an admin: keep them active.
UPDATE "user" SET "status" = 'active', "approved_at" = now();
