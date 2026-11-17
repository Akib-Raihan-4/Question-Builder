/** Data the admin review screen works with. Coordinates: PDF points, top-left (see coords.ts). */
export type ReviewRegion = {
  id: string;
  ownerType: "question" | "part";
  ownerId: string;
  page: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sortOrder: number;
  editedByAdmin: boolean;
};

export type ReviewPart = {
  id: string;
  questionId: string;
  label: string;
  sortOrder: number;
  marks: number;
  editedByAdmin: boolean;
};

export type ReviewQuestion = {
  id: string;
  number: number;
  totalMarks: number;
  confidence: number;
  warnings: string[];
  editedByAdmin: boolean;
  topicIds: string[];
};

export type ReviewTopic = { id: string; code: string; name: string; parentId: string | null };

export type ReviewPaper = {
  id: string;
  label: string;
  subject: string;
  status: "uploaded" | "processing" | "needs_review" | "published" | "failed";
  structureEdited: boolean;
  parserVersion: string | null;
  pageCount: number | null;
};

export type ReviewData = {
  paper: ReviewPaper;
  questions: ReviewQuestion[];
  parts: ReviewPart[];
  regions: ReviewRegion[];
  topics: ReviewTopic[];
};
