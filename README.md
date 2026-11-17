# Papersmith

Build exam papers from Pearson Edexcel International GCSE past papers: click a question (or one part),
it lands in your paper, renumbered, with marks totalled — then export a clean, vector-sharp PDF.

Internal tool. Past papers are Pearson's copyright: keep the app behind login and never expose files publicly.

See [PLAN.md](PLAN.md) for the full design and build phases.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js 15 app (UI, API routes, auth, job worker) |
| `services/processor` | FastAPI + PyMuPDF paper segmentation |
| `samples/` | Real past papers for development (gitignored) |

## Setup

`.env.local` in the repo root (gitignored, symlinked into `apps/web`) needs:

```
DATABASE_URL=postgres://...          # Neon
BETTER_AUTH_SECRET=...               # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:3000
S3_ENDPOINT=https://s3.<region>.backblazeb2.com   # any S3-compatible store; bucket must be PRIVATE
S3_REGION=<region>
S3_BUCKET=<bucket>
S3_ACCESS_KEY_ID=<bucket-scoped key id>
S3_SECRET_ACCESS_KEY=<key>
PROCESSOR_URL=http://localhost:8000              # optional, this is the default
```

```bash
npm install
npm run db:migrate        # apply Drizzle migrations
npm run db:seed           # Edexcel subjects + spec topics
npm run user:create -- admin@school.org 'a-strong-password' admin "Admin Name"
npm run processor         # PDF processor on :8000 (separate terminal)
npm run dev               # http://localhost:3000 — also runs the pg-boss job worker
```

> The job worker is loaded once when `npm run dev` starts; after changing code under
> `src/lib/jobs/`, restart the dev server. To build while dev is running:
> `NEXT_DIST_DIR=.next-build npx next build` (in `apps/web`).

Upload papers at **Past papers** (admin): a ZIP or single PDFs. Each upload is stored privately, queued,
and sent to the processor; the paper then shows **Needs review**. PDFs are only ever served through
`/api/papers/:id/file` to logged-in users (teachers only see published papers).

**Review** a paper to check every box on the page: drag to move, drag handles to resize,
Shift+drag to draw a box for the selected question/part, Delete to remove one. Fix marks, add or
remove parts, split/merge questions and pick topics in the side panel. Hand-edited boxes, marks and
labels are kept when the parser re-runs. **Publish** is enabled once every question's part marks add
up to its total and every question has a topic.

Sign-up is disabled; create teacher accounts with `npm run user:create -- <email> <password> teacher "<Name>"`.

Processor (Python 3.12+):

```bash
cd services/processor && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn main:app --reload --port 8000
.venv/bin/python -m pytest
```

Or everything with Docker: `docker compose up` (web, processor, MinIO).

## Tests

```bash
npm test                                   # Vitest (coords, builder store)
cd services/processor && .venv/bin/python -m pytest
```

Golden tests compare the parser against expected JSON in `services/processor/tests/fixtures/golden/`
(numbers, marks, parts, regions — no paper text). They read the real PDFs from `/samples` and skip if
it's empty. After an intentional parser change, regenerate with
`cd services/processor && .venv/bin/python tests/golden.py --update` and review the diff.
