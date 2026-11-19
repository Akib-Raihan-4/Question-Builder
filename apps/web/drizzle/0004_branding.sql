CREATE TABLE "user_branding" (
	"user_id" text PRIMARY KEY NOT NULL,
	"school" text,
	"logo_key" text,
	"logo_type" text,
	"watermark" jsonb DEFAULT '{"kind":"none","strength":"light"}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_branding" ADD CONSTRAINT "user_branding_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;