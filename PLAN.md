# Papersmith — Build Plan

> Source: "Question Paper Builder — Build Plan for Claude Code" (Akib Raihan, 17 Nov 2026).
> **Current focus: Pearson Edexcel International GCSE first** (4MA1, 4PH1, 4CH1, 4BI1). Cambridge IGCSE is
> a second parser behind the same interface, added later.
> **Deviation:** the database is hosted Neon Postgres (`DATABASE_URL` in `.env.local`); the Compose
> `postgres` service is optional (`--profile localdb`).

## Overview

Teachers open past exam papers, click a question (or one part of it), and it lands in their own paper.
Questions are numbered by the order they're picked, marks total automatically, and the paper exports as a
clean PDF.

- **Admin**: uploads past papers, runs auto-segmentation, fixes and approves question boxes, tags topics.
- **Teacher**: browses approved papers, clicks to add questions, reorders, saves, exports.

**Core idea**: questions are never stored as images. Each question is a set of rectangles (page + bbox) on
the original PDF. Preview and export crop the original PDF on the fly, so output stays vector-sharp and
fixing a crop is a database edit.

MVP: text-based PDFs only; internal use behind login — papers are the boards' copyright and must never be
exposed publicly.

## How the app runs

**Admin path (once per paper)**
1. Upload a PDF with details (subject, year, series, paper).
2. Save PDF to storage, create a `papers` row, queue a job.
3. Worker sends the PDF to the Python processor → questions, parts, marks, regions as JSON.
4. Save JSON; paper shows "needs review".
5. Admin fixes boxes, confirms topics, clicks Publish.

**Teacher path (every use)**
1. Pick a paper; the browser loads the PDF and its regions in one request.
2. pdf.js draws pages; invisible click areas sit on each question and part.
3. Click Q3(a) → `{questionId, partIds}` added to the builder list (no server call).
4. Preview: number = position + 1, marks from the part, total = sum.
5. Open another paper, click Q8 → it becomes question 2. Drag to reorder renumbers.
6. List auto-saves to `built_papers` every few seconds.
7. Export: server crops each region with pdf-lib, draws new numbers and Total lines, returns one PDF.

## Tech stack

| Layer | Choice |
|---|---|
| Web app | Next.js 15 (App Router), TypeScript, Tailwind, shadcn/ui |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| PDF analysis | Python 3.12, FastAPI, PyMuPDF, pdfplumber |
| Jobs | pg-boss (Postgres-backed queue) |
| File storage | S3-compatible (MinIO locally) — original PDFs only |
| PDF viewing | pdfjs-dist |
| PDF export | pdf-lib |
| Builder state | Zustand + dnd-kit |
| Auth | BetterAuth (email + password), roles: admin, teacher |
| Topic tagging | Claude API (suggest only, admin confirms) |
| Dev/deploy | Docker Compose: web, processor, minio (+ optional postgres) |

```
apps/web/                 Next.js app (UI + API routes + job worker)
  src/db/schema.ts        Drizzle schema
  src/lib/coords.ts       coordinate conversions (one place only)
  src/lib/export/         pdf-lib paper + mark scheme assembly
services/processor/       FastAPI + PyMuPDF segmentation
  parsers/base.py, edexcel.py (cambridge.py later)
  tests/fixtures/         sample PDFs + expected JSON
docker-compose.yml
samples/                  real past papers for development (gitignored)
```

## Core concepts

1. **A question is a list of regions, not an image.** Region = `{ page, x0, y0, x1, y1 }`. A question can
   span pages (ordered regions). Each part ((a), (b), (b)(i)) has its own regions.
2. **One coordinate system, converted in one file.** Store PDF points, top-left origin (PyMuPDF).
   `src/lib/coords.ts` is the only converter: pdf.js = × viewport scale; pdf-lib = `pageHeight - y`.
3. **Crops exclude everything carrying old numbering.** Start right of the number column; stop above any
   Total line; skip margin text ("DO NOT WRITE IN THIS AREA"), headers/footers, barcode, page numbers,
   "Turn over", "BLANK PAGE". The app draws its own number and total line. Part labels and per-part marks
   stay inside the crop.

Edge case: picking only (b) and (c) keeps original labels; warn "Part (b) may depend on (a)".

## Database schema

| Table | Key columns | Notes |
|---|---|---|
| subjects | id, board, qualification, name, spec_code | e.g. Edexcel, International GCSE, Mathematics A, 4MA1 |
| topics | id, subject_id, parent_id, code, name | spec tree |
| papers | id, subject_id, paper_code, series, year, tier, file_key, page_count, page_width, page_height, parser_key, parser_version, status | uploaded → processing → needs_review → published / failed |
| questions | id, paper_id, number, total_marks, confidence, status, text | |
| question_parts | id, question_id, label, sort_order, marks, text | |
| regions | id, owner_type, owner_id, page, x0, y0, x1, y1, sort_order, edited_by_admin | owner: question or part |
| question_topics | question_id, topic_id, source | ai or admin |
| built_papers | id, owner_id, title, header_json, created_at, updated_at | |
| built_paper_items | id, built_paper_id, position, question_id, part_ids | [] = whole question |
| user (+ BetterAuth) | … + role | admin or teacher |

Rules: never store the serial number (position + 1). Item marks = sum of chosen parts (or total_marks).
Publish requires parts' marks to sum to the question total. Indexes on questions(paper_id, number),
regions(owner_type, owner_id), question_topics(topic_id).

## Ingestion pipeline

Upload: board, subject, paper code (`4MA1/1H`), series, year, tier + PDF. Bulk ZIP: names like
`4MA1_1H_2020_06_qp.pdf`.

Segmentation (`POST /segment/qp`, PyMuPDF `get_text("dict")`):
1. Parser from `papers.parser_key`; same JSON from every parser.
2. Drop noise: header/footer bands, margin text, barcode, page number, Turn over, BLANK PAGE, cover, formula sheets.
3. Question starts: bold integer alone in the left number column, increasing by 1.
4. Question ends: board's Total line, else line before next start.
5. Parts: (a), (b), (i), (ii) at part-label x positions; romans nest under letters.
6. Part marks: board pattern, right-aligned; attach to part above.
7. Total: Total line's number, else sum of parts.
8. Regions: start → end, x right of number column → content right edge; split per page.
9. Confidence: 1.0 when marks match and numbers in sequence; < 0.9 flagged.

| Rule | Edexcel International GCSE | Cambridge IGCSE (later) |
|---|---|---|
| Part marks | `(2)` | `[2]` |
| Question end | `(Total for Question 3 = 8 marks)` | `[Total: 8]` on some papers |
| Footer | barcode, Turn over, page number | `© UCLES …`, `[Turn over` |

Measure x-bands and font sizes from real samples before writing rules; thresholds in a per-board config.

Topic tagging: question text + topic list → Claude API → 1–3 codes as JSON, `source = ai`; admin confirms.
Output is versioned with `parser_version`.

## Admin review UI

PDF page left (pdf.js canvas + SVG overlay), question list right. Question = blue outline, part = lighter
fill, low confidence = orange. Drag/resize, draw with modifier key. Split/merge questions, add/remove part,
re-run parser. Publish enabled only when every marks-sum check passes (topics are not required while tagging is postponed).
Edits save debounced; `edited_by_admin` regions survive parser re-runs.

## Teacher builder UI

Left: pickers (subject, year, series, paper) + search (topic, marks, year). pdf.js with hover targets;
click part / click question number. Added questions show a check + Remove.

```
type Item = { questionId: string; partIds: string[] } // [] = whole question
addPart: append to existing item for question (paper order) else push
addQuestion: push { questionId, partIds: [] }
serial(item) = index + 1; itemMarks = parts sum or total_marks; totalMarks = sum
```

Right: header editor (school, logo, class, title, time, instructions), live preview with cropped regions
and board-style totals, dnd-kit reorder, running total with optional target, auto-save, My papers,
duplicate. Cache rendered pages as ImageBitmap keyed `paperId:page`; lazy-load.

## PDF export

pdf-lib `embedPage` with `{left: x0, right: x1, bottom: H - y1, top: H - y0}`. A4, 20 mm margins: header
block, then per item: bold number, regions top to bottom, board-style total line right-aligned. Scale down
only if too wide, never up. Never split a region. Footer: page numbers + "Total for paper = X marks".
Implemented refinements: a region that misses fitting by a little is shrunk (≥ 85%) rather than
leaving a near-empty page, and a short region (e.g. a question's opening lines before a chosen
part) is kept on the same page as the next region.
Later: DOCX export, answer-space control, shuffled versions.

## Build phases

1. **Foundation** — monorepo, Compose, Drizzle schema + migrations, BetterAuth roles, subject seed.
   *Done when:* stack runs; admin can log in; tables exist.
2. **Upload + storage** — upload form (single + ZIP), PDFs in storage, papers rows, job queue → processor.
   *Done when:* uploading creates a paper with status `processing`.
3. **Segmentation** — processor endpoint, noise filtering, question/part/marks, regions, confidence, golden tests.
   *Done when:* on 3 Edexcel samples every number and total is found and part marks add up.
4. **Review UI** — editable boxes, question panel, publish check. *Done when:* a fixed box survives a re-run.
5. **Topic tagging** — *postponed (decided 17 Nov 2026): no categorising for now.* Topics are not
   required to publish and the topic picker is hidden. The AI-suggestion work is parked in
   `git stash` ("Phase 5: AI topic tagging (parked …)") if it's wanted later.
6. **Teacher builder** — click targets, store, preview, reorder, totals, save/load.
   *Done when:* 2020 Q3(a) then 2021 Q8 show as 1 and 2 with correct marks; reorder renumbers.
7. **Export** — layout engine. *Done when:* no old numbers/Total lines; text selectable.
8. **Search + polish** — search (text, year, series, marks; topic search waits for topics), My papers
   with totals, duplicate, empty/error states, usage analytics (most-used questions).
   *Done when:* a 50-mark topic test from search alone in under 5 minutes.

## Working rules

- One phase at a time; run the "Done when" checks and wait for OK before the next.
- Real papers live in `/samples` (never committed); golden fixtures in `services/processor/tests/fixtures`.
- Measure span positions/fonts from 2+ samples before writing the segmenter.
- All coordinate conversions only in `src/lib/coords.ts`, with unit tests.
- Never store a question's serial number.
- Every route requires login; PDFs served only via authenticated routes or short-lived signed URLs.
- Commit after each phase.

Testing: pytest golden tests (processor); Vitest for store + coords; Playwright for one full flow.

Risks: older layouts (per-layout parsers + admin fixes), scanned PDFs (mark `failed` with reason),
cross-part/insert dependencies (warning), copyright (internal only).
