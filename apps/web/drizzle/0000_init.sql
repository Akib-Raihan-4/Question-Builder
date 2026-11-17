CREATE TYPE "public"."board" AS ENUM('edexcel', 'cambridge');--> statement-breakpoint
CREATE TYPE "public"."paper_status" AS ENUM('uploaded', 'processing', 'needs_review', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."question_status" AS ENUM('auto', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."region_owner" AS ENUM('question', 'part');--> statement-breakpoint
CREATE TYPE "public"."topic_source" AS ENUM('ai', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'teacher');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "built_paper_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"built_paper_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"question_id" uuid NOT NULL,
	"part_ids" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "built_papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text DEFAULT 'Untitled paper' NOT NULL,
	"header_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"paper_code" text NOT NULL,
	"series" text NOT NULL,
	"year" integer NOT NULL,
	"tier" text,
	"file_key" text NOT NULL,
	"page_count" integer,
	"page_width" real,
	"page_height" real,
	"parser_key" text NOT NULL,
	"parser_version" text,
	"status" "paper_status" DEFAULT 'uploaded' NOT NULL,
	"status_reason" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer NOT NULL,
	"marks" integer DEFAULT 0 NOT NULL,
	"text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_topics" (
	"question_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"source" "topic_source" NOT NULL,
	CONSTRAINT "question_topics_question_id_topic_id_pk" PRIMARY KEY("question_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paper_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"total_marks" integer DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"status" "question_status" DEFAULT 'auto' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_type" "region_owner" NOT NULL,
	"owner_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"x0" real NOT NULL,
	"y0" real NOT NULL,
	"x1" real NOT NULL,
	"y1" real NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"edited_by_admin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board" "board" NOT NULL,
	"qualification" text NOT NULL,
	"name" text NOT NULL,
	"spec_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'teacher' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "built_paper_items" ADD CONSTRAINT "built_paper_items_built_paper_id_built_papers_id_fk" FOREIGN KEY ("built_paper_id") REFERENCES "public"."built_papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "built_paper_items" ADD CONSTRAINT "built_paper_items_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "built_papers" ADD CONSTRAINT "built_papers_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papers" ADD CONSTRAINT "papers_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_parts" ADD CONSTRAINT "question_parts_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_topics" ADD CONSTRAINT "question_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_paper_id_papers_id_fk" FOREIGN KEY ("paper_id") REFERENCES "public"."papers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "built_paper_items_paper_idx" ON "built_paper_items" USING btree ("built_paper_id","position");--> statement-breakpoint
CREATE INDEX "built_papers_owner_idx" ON "built_papers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "papers_subject_idx" ON "papers" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "papers_status_idx" ON "papers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "question_parts_question_idx" ON "question_parts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_topics_topic_idx" ON "question_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "questions_paper_number_idx" ON "questions" USING btree ("paper_id","number");--> statement-breakpoint
CREATE INDEX "regions_owner_idx" ON "regions" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_board_spec_idx" ON "subjects" USING btree ("board","spec_code");--> statement-breakpoint
CREATE UNIQUE INDEX "topics_subject_code_idx" ON "topics" USING btree ("subject_id","code");--> statement-breakpoint
CREATE INDEX "topics_parent_idx" ON "topics" USING btree ("parent_id");