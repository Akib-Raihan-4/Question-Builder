ALTER TABLE "papers" ADD COLUMN "original_filename" text;--> statement-breakpoint
ALTER TABLE "papers" ADD COLUMN "file_size" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "papers_identity_idx" ON "papers" USING btree ("subject_id","paper_code","series","year");