# Deploying Papersmith

| Part | Where | Notes |
|---|---|---|
| Website (Next.js: pages, APIs, login, PDF export) | **Vercel** | Root directory `apps/web` |
| Python processor (finding questions, reading covers, Word export) | **Render** (or Railway / Fly.io) | Docker, `services/processor/Dockerfile`; `render.yaml` sets it up |
| Database | **Neon** | Already set up; migrations are already applied |
| PDF storage | **Backblaze B2** | Already set up; bucket stays private |

How it fits Vercel's limits:

- **No background worker.** After an upload or re-run, the questions are found right after the
  response (Next.js `after()`), inside the same function (up to 300 s). If that is ever cut off,
  the paper shows *failed*/*processing* and **Re-run** fixes it.
- **Requests stay under ~4.5 MB.** PDFs are uploaded one at a time (ZIPs are unzipped in the
  browser). A single PDF over 4.4 MB is refused with a "compress it" message.
- **Exports are not sent through Vercel.** The file is saved privately in B2
  (`exports/<paper id>/…`, overwritten each time) and the browser downloads it through a link
  that expires after 5 minutes.
- **The processor needs a secret key** (`PROCESSOR_KEY`); without it every call is refused.

## 1. Make a processor key

```bash
openssl rand -hex 32
```

Keep this value; it goes into both Render and Vercel.

## 2. Processor on Render

1. render.com → **New → Blueprint** → connect GitHub → pick **Question-Builder**. Render reads
   `render.yaml` and creates *papersmith-processor* (Docker, free plan).
2. When asked for **PROCESSOR_KEY**, paste the key from step 1.
3. Wait for the first deploy, then open `https://<your-service>.onrender.com/health` — it should
   show `{"ok":true,...}`. Note this address.

The free plan sleeps after ~15 minutes idle; the first upload after that waits ~30–60 s while it
wakes up. A paid instance (or Railway/Fly) avoids this.

## 3. Website on Vercel

1. vercel.com → **Add New → Project** → import **Question-Builder**.
2. **Root Directory**: `apps/web` (Framework: Next.js is detected). Leave the build settings as they are.
3. **Environment Variables** (Production): copy from `.env.local`, see `.env.example`:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | same Neon URL as local |
   | `BETTER_AUTH_SECRET` | same as local (keeps the same login secret) |
   | `BETTER_AUTH_URL` | `https://<your-project>.vercel.app` (or your own domain) |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | same as local |
   | `PROCESSOR_URL` | `https://<your-service>.onrender.com` |
   | `PROCESSOR_KEY` | the key from step 1 |

4. **Deploy.** Open the site and sign in with your admin account — the data is already in Neon.
5. If you later add a custom domain, change `BETTER_AUTH_URL` to it and redeploy.

## 4. Backblaze (once)

- Bucket **question-builder** → *Lifecycle Settings* → **Keep only the last version of the file**.
  Exports overwrite the same file each time; with "keep all versions" old copies pile up.
- No CORS rules are needed: the browser never uploads to B2 directly.

## 5. Check it works

1. Sign in as admin → **Past papers** → upload one PDF → it moves from *processing* to *needs review*.
2. Review → Publish.
3. **My papers** → New paper → add a question → **Export ▾ → PDF** and **Word** both download.
4. Sign out → **Create an account** → the request appears under **Teachers**.

## Running locally (unchanged)

```bash
npm run processor   # terminal 1 (no PROCESSOR_KEY needed locally)
npm run dev         # terminal 2
```

## Notes

- Vercel's free **Hobby** plan is for personal, non-commercial use — check that it fits how your
  school uses the app; otherwise use Vercel Pro.
- Plan limits (function time, body size) change over time; check Vercel's current limits page if
  uploads or exports start failing.
