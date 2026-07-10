# Deploying SmartTech AI Video Studio

This app is two separate services that deploy separately:

| Part | What it is | Where it goes |
|---|---|---|
| `src/` (frontend) | Vite + React static build | **Vercel** — works great, zero config beyond env vars |
| `server/` (backend) | Express API + FFmpeg render pipeline | **NOT Vercel** — needs Cloud Run / Railway / Render / Fly.io / a VPS |

Read the "why not Vercel for the backend" note below before you spend time
trying — it's a hard platform limitation, not a config problem.

## 1. Frontend on Vercel

1. Push this repo to GitHub, import it in Vercel.
2. Vercel auto-detects Vite; `vercel.json` in this repo sets the build
   command, output directory, and the SPA rewrite rule React Router needs
   (without it, refreshing `/projects/123` would 404).
3. In **Project Settings → Environment Variables**, add:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   VITE_API_BASE_URL=https://your-backend-url.example.com
   ```
   `VITE_API_BASE_URL` is the backend from step 2 below — deploy that first
   so you have the URL, or redeploy the frontend once you do.
4. Deploy. That's it — the frontend is fully static after build.

## 2. Backend on Cloud Run (or Railway / Render / Fly.io)

**Why not Vercel:** `server/lib/renderPipeline.ts` shells out to the real
`ffmpeg`/`ffprobe` CLI as child processes, writes several temp video/audio
files per render, and a multi-scene render can easily run past a minute.
Vercel serverless functions don't ship an ffmpeg binary, cap execution time
well under that, and don't give you a persistent writable filesystem across
a multi-step pipeline. This isn't a config issue — it's the platform. The
backend needs a real container/VM that stays running.

This repo includes a `Dockerfile` already set up for that (ffmpeg + fonts
installed, reads `PORT` from the environment the way Cloud Run expects):

```bash
docker build -t smarttech-api .

# Google Cloud Run
gcloud run deploy smarttech-api \
  --image gcr.io/YOUR_PROJECT/smarttech-api \
  --source . \
  --platform managed --region asia-southeast1 --allow-unauthenticated \
  --memory 2Gi --timeout 600 \
  --set-env-vars AI_PROVIDER=openai,TTS_PROVIDER=openai,CORS_ORIGIN=https://your-vercel-app.vercel.app \
  --set-secrets SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest
```

Notes specific to Cloud Run:
- `--memory 2Gi` and `--timeout 600` (10 min) give the render pipeline
  enough headroom — the default 512Mi/5min can be tight for longer videos.
  Increase further if you render 60s videos with many scenes regularly.
- Put secrets (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` or
  `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, stock provider keys) in
  **Secret Manager**, not plain `--set-env-vars` — same pattern the rest of
  the SocialGuard stack already uses for `cregit-proxy`.
- Set `CORS_ORIGIN` to your actual Vercel URL, not `*` — the server only
  allows that one origin.
- `VITE_SUPABASE_URL` also needs to be set on the backend (it reads it as a
  fallback for the Supabase project URL) — set it alongside the others.

If you'd rather not touch Cloud Run/Docker at all, Railway and Render both
support "deploy from Dockerfile" with a simpler UI and free/cheap tiers —
same Dockerfile works unmodified on either.

## 3. Supabase (once, regardless of host)

Run the migrations and seed data from `supabase/migrations/` and
`supabase/seed/templates.sql` against your Supabase project — see the main
`README.md` §2 for the exact steps. Both the frontend and backend point at
the same Supabase project via `VITE_SUPABASE_URL`.

## 4. After both are deployed

Update the frontend's `VITE_API_BASE_URL` to the real backend URL (and
redeploy on Vercel if you set it before the backend existed), and update
the backend's `CORS_ORIGIN` to the real Vercel URL. Test end-to-end: sign
up, create a project, generate a script, and try a render — that last step
is the one that only works once the backend is actually running FFmpeg
somewhere, not on Vercel.
