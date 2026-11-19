CREATE TABLE "mark_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"original_filename" text,
	"file_size" integer,
	"page_count" integer,
	"status" "paper_status" DEFAULT 'uploaded' NOT NULL,
	"status_reason" text,
	"reader_version" text,
	"published_at" timestamp,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mark_schemes_paper_id_unique" UNIQUE("paper_id")
);
--> statement-breakpoint
CREATE TABLE "ms_regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mark_scheme_id" uuid NOT NULL,
	"question_id" uuid,
	"part_id" uuid,
	"label" text NOT NULL,
	"page" integer NOT NULL,
	"x0" real NOT NULL,
	"y0" real NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"edited_by_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD CONSTRAINT "mark_schemes_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mark_schemes" ADD CONSTRAINT "mark_schemes_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ms_regions" ADD CONSTRAINT "ms_regions_mark_scheme_id_mark_schemes_id_fk" FOREIGN KEY ("mark_scheme_id") REFERENCES "public"."mark_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ms_regions" ADD CONSTRAINT "ms_regions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ms_regions" ADD CONSTRAINT "ms_regions_part_id_question_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."question_parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ms_regions_scheme_idx" ON "ms_regions" USING btree ("mark_scheme_id");--> statement-breakpoint
CREATE INDEX "ms_regions_question_idx" ON "ms_regions" USING btree ("question_id");