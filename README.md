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
```

```bash
npm install
npm run db:migrate        # apply Drizzle migrations
npm run db:seed           # Edexcel subjects + spec topics
npm run user:create -- admin@school.org 'a-strong-password' admin "Admin Name"
npm run dev               # http://localhost:3000
```

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
