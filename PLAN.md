# Papersmith — Build Plan

> Source: "Question Paper Builder — Build Plan for Claude Code" (Akib Raihan, 17 Nov 2026).
> **Current focus: Pearson Edexcel International GCSE first** (4MA1, 4PH1, 4CH1, 4BI1). Cambridge IGCSE is
> a second parser behind the same interface, added later.
> **Also supported:** Edexcel International A Level units (first: Physics Unit 3, WPH13), any other
> paper by marking questions by hand, subjects added by admins, and paper details read from the cover.
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
| Jobs | Next.js `after()` right after each upload/re-run (no worker; fits serverless hosting) |
| File storage | S3-compatible, private (Backblaze B2) — original PDFs and exports |
| PDF viewing | pdfjs-dist |
| PDF export | pdf-lib |
| Builder state | Zustand + dnd-kit |
| Auth | BetterAuth (email + password), roles: admin, teacher |
| Topic tagging | Claude API (suggest only, admin confirms) |
| Dev/deploy | Local: two commands. Hosted: Vercel (web) + Render (processor), see DEPLOY.md |

```
apps/web/                 Next.js app (UI + API routes)
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
DOCX export (added): "exact look" (crops as 200-dpi pictures, editable numbers/totals/header) and
"editable text" (lines rebuilt as Word paragraphs, drawn bands as pictures), built in the processor.
Later: answer-space control, shuffled versions.

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

## Next features (planned 19 Nov 2026)

Order: **A. School logo + watermark** (small) → **B. Answer space** (medium) → **C. Mark schemes**
(large, four steps). Each ends with checks at phone/tablet/desktop and a commit; database changes
go to the TEST branch first, then `npm run db:migrate` against production before deploying.

### A. School logo and watermark
- **Your account → School branding**: school name, logo (PNG/JPG ≤ 1 MB, re-encoded to PNG, stored
  privately in B2 under `branding/<userId>/`), watermark (off / school name / custom text / faded
  logo) and strength. New papers start from these; each paper can switch logo/watermark off.
- Data: `user.branding` (jsonb); `PaperHeader` gains `showLogo`, `watermark`.
- PDF: logo above the title (≤ 18 mm high); watermark drawn first on every page so questions sit
  on top of it (diagonal text or centred faded logo, ~8% grey).
- DOCX: logo in the header; watermark as a Word header shape (best effort).
- Done when: a paper exports with logo and watermark in PDF and DOCX, and a paper with them
  switched off has neither.

### B. Answer space
- Per question in the builder: **As in the past paper** (default) · **Remove** · **Add lines**
  (1–30 dotted lines, Edexcel spacing) · **Blank space** (cm). "Apply to all" sets every question.
- Data: `built_paper_items.answer_space` (jsonb: `{ mode, lines?, cm? }`).
- **Remove** needs to know where the answer lines are. The processor finds, inside each stored
  region, bands that are only dotted answer lines or empty space (labelled lines such as
  "Percentage uncertainty = ......" are kept, and graph grids and tables are never removed) and
  stores them per region (`regions.answer_bands` jsonb). A one-off backfill runs it for every
  published paper; re-runs keep it current.
- Export splits a region around its answer bands; added lines/space go after the question's last
  region, above its Total line. The same splitting function drives the builder preview, the PDF
  and both DOCX modes, so they always match.
- Done when: on WPH13 Jan 2024, Q1 "Remove" drops the dotted lines but keeps the graph in Q4, and
  "Add 6 lines" adds 6 lines above "(Total for Question 1 …)".

### C. Mark schemes
Mark schemes are tables (Question Number | Answer | Guidance | Mark), one row per part, labelled
`1(a)(i)` — matching our part labels (`a(i)`). Same core idea as questions: rows are stored as
regions on the original MS PDF, never as text or images.

1. **Data + upload + reading** — table `mark_schemes` (paper_id unique, file_key, page_count,
   status, parser_key, parser_version, status_reason) and `ms_regions` (mark_scheme_id,
   question_id, part_id null = whole question, label, page, bbox, sort_order, edited_by_admin).
   Upload on the paper's page ("Mark scheme" tab) or in bulk on Past papers: each file is matched
   to its paper from its cover ("January 2024", "(WPH13)", "Paper 01"). Processor endpoint
   `/segment/ms`: find the label column, start a row at each label (`1(a)(i)`, also `1 (a)`),
   end it at the next label, the table's end or a "Total for question" row; split across pages;
   crop right of the label column so only answers, guidance and marks remain; skip repeated
   table headers. Rows are linked to questions/parts by label; unmatched rows are flagged.
   *Done when:* all 18 Physics Unit 3 mark schemes in `samples/Physics-Unit-3-MS` read with every
   row linked (17 have a question paper in the test database; October 2020 has none).
2. **Admin review** — the review screen gets a "Question paper | Mark scheme" switch; the mark
   scheme side reuses the box editor (draw/move/resize, link a row to a part). Publishing a mark
   scheme requires every part of every question to have a row. Teachers see only published ones.
3. **Teacher export** — Export menu gains **Mark scheme (PDF)** (and a combined "Paper + mark
   scheme"). Layout: our own "Question | Answer | Mark" header, the new label (`3(a)(i)`) drawn
   in the left column, the crop beside it, "Total for question 3 = 8 marks" after each question
   and the paper total at the end. Only the parts the teacher picked are included; questions
   without a mark scheme are listed on a note page instead of failing. DOCX (pictures mode) next.
   The builder shows a small "MS" badge on questions that have one.
4. **Maths B mark schemes** — different table (Question | Working | Answer | Mark | Notes); a
   second parser behind the same interface once sample mark schemes are in `/samples`.
