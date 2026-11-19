import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Auth (BetterAuth core tables + role)                                */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["admin", "teacher"]);
/** New sign-ups wait as "pending" until an admin approves them (rejecting deletes the account). */
export const accountStatus = pgEnum("account_status", ["pending", "active"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("teacher"),
  status: accountStatus("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export const board = pgEnum("board", ["edexcel", "cambridge"]);

export const subjects = pgTable(
  "subjects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    board: board("board").notNull(),
    qualification: text("qualification").notNull(), // e.g. "International GCSE"
    name: text("name").notNull(), // e.g. "Mathematics A"
    specCode: text("spec_code").notNull(), // e.g. "4MA1"
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subjects_board_spec_idx").on(t.board, t.specCode)],
);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    code: text("code").notNull(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("topics_subject_code_idx").on(t.subjectId, t.code),
    index("topics_parent_idx").on(t.parentId),
  ],
);

export const paperStatus = pgEnum("paper_status", [
  "uploaded",
  "processing",
  "needs_review",
  "published",
  "failed",
]);

export const papers = pgTable(
  "papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    paperCode: text("paper_code").notNull(), // e.g. "4MA1/1H"
    series: text("series").notNull(), // e.g. "June", "January", "November"
    year: integer("year").notNull(),
    tier: text("tier"), // "F" | "H" | null
    fileKey: text("file_key").notNull(),
    originalFilename: text("original_filename"),
    fileSize: integer("file_size"),
    pageCount: integer("page_count"),
    pageWidth: real("page_width"),
    pageHeight: real("page_height"),
    parserKey: text("parser_key").notNull(), // "edexcel" | "cambridge"
    parserVersion: text("parser_version"),
    status: paperStatus("status").notNull().default("uploaded"),
    statusReason: text("status_reason"),
    /** Admin split/merged questions or added/removed parts: a parser re-run would undo that. */
    structureEdited: boolean("structure_edited").notNull().default(false),
    publishedAt: timestamp("published_at"),
    uploadedBy: text("uploaded_by").references(() => user.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("papers_subject_idx").on(t.subjectId),
    index("papers_status_idx").on(t.status),
    uniqueIndex("papers_identity_idx").on(t.subjectId, t.paperCode, t.series, t.year),
  ],
);

/* ------------------------------------------------------------------ */
/* Question bank                                                       */
/* ------------------------------------------------------------------ */

export const questionStatus = pgEnum("question_status", ["auto", "reviewed"]);

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => papers.id, { onDelete: "cascade" }),
    number: integer("number").notNull(), // original number on the source paper
    totalMarks: integer("total_marks").notNull().default(0),
    confidence: real("confidence").notNull().default(1),
    status: questionStatus("status").notNull().default("auto"),
    warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
    text: text("text").notNull().default(""),
    /** Admin changed total_marks; re-runs keep it. */
    editedByAdmin: boolean("edited_by_admin").notNull().default(false),
  },
  (t) => [index("questions_paper_number_idx").on(t.paperId, t.number)],
);

export const questionParts = pgTable(
  "question_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    label: text("label").notNull(), // "a", "b(i)"
    sortOrder: integer("sort_order").notNull(),
    marks: integer("marks").notNull().default(0),
    text: text("text").notNull().default(""),
    /** Admin changed label/marks; re-runs keep them. */
    editedByAdmin: boolean("edited_by_admin").notNull().default(false),
  },
  (t) => [index("question_parts_question_idx").on(t.questionId)],
);

export const regionOwner = pgEnum("region_owner", ["question", "part"]);

/**
 * A rectangle on the ORIGINAL PDF, in PDF points with a top-left origin
 * (what PyMuPDF returns). `page` is 0-based. Convert only via src/lib/coords.ts.
 */
export const regions = pgTable(
  "regions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerType: regionOwner("owner_type").notNull(),
    ownerId: uuid("owner_id").notNull(),
    page: integer("page").notNull(),
    x0: real("x0").notNull(),
    y0: real("y0").notNull(),
    x1: real("x1").notNull(),
    y1: real("y1").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    editedByAdmin: boolean("edited_by_admin").notNull().default(false),
  },
  (t) => [index("regions_owner_idx").on(t.ownerType, t.ownerId)],
);

export const topicSource = pgEnum("topic_source", ["ai", "admin"]);

export const questionTopics = pgTable(
  "question_topics",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    source: topicSource("source").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.questionId, t.topicId] }),
    index("question_topics_topic_idx").on(t.topicId),
  ],
);

/* ------------------------------------------------------------------ */
/* A teacher's school branding (logo, watermark), used on their papers  */
/* ------------------------------------------------------------------ */

export type Watermark = {
  kind: "none" | "school" | "text" | "logo";
  /** Used when kind = "text". */
  text?: string;
  strength: "light" | "medium";
};

export const userBranding = pgTable("user_branding", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  school: text("school"),
  /** Private storage key of the logo (PNG or JPEG), or null. */
  logoKey: text("logo_key"),
  logoType: text("logo_type"),
  watermark: jsonb("watermark").$type<Watermark>().notNull().default({ kind: "none", strength: "light" }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* What teachers build                                                 */
/* ------------------------------------------------------------------ */

export type PaperHeader = {
  school?: string;
  /** Unused (logos live in the owner's branding). */
  logoKey?: string;
  /** Put the owner's school logo above the title (default true when they have one). */
  showLogo?: boolean;
  /** Print the owner's watermark on every page (default true when they have one). */
  showWatermark?: boolean;
  className?: string;
  title?: string;
  timeAllowed?: string;
  instructions?: string;
  targetMarks?: number;
};

export const builtPapers = pgTable(
  "built_papers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled paper"),
    headerJson: jsonb("header_json").$type<PaperHeader>().notNull().default({}),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("built_papers_owner_idx").on(t.ownerId)],
);

/** The serial number shown to students is NEVER stored: it is position + 1. */
export const builtPaperItems = pgTable(
  "built_paper_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    builtPaperId: uuid("built_paper_id")
      .notNull()
      .references(() => builtPapers.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    partIds: jsonb("part_ids").$type<string[]>().notNull().default([]), // [] = whole question
  },
  (t) => [index("built_paper_items_paper_idx").on(t.builtPaperId, t.position)],
);
