ALTER TABLE "papers" ADD COLUMN "structure_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "question_parts" ADD COLUMN "edited_by_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "edited_by_admin" boolean DEFAULT false NOT NULL;