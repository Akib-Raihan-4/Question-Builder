CREATE TYPE "public"."box_doc" AS ENUM('paper', 'ms');--> statement-breakpoint
CREATE TABLE "user_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"doc" "box_doc" NOT NULL,
	"owner_type" "region_owner" NOT NULL,
	"owner_id" uuid NOT NULL,
	"boxes" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_boxes" ADD CONSTRAINT "user_boxes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_boxes_owner_idx" ON "user_boxes" USING btree ("user_id","doc","owner_type","owner_id");