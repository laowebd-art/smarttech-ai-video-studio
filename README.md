# SmartTech AI Video Studio

An original AI-powered studio for creating short vertical videos (YouTube Shorts,
TikTok, Facebook Reels, Instagram Reels) — from topic to script to scenes to
rendered MP4.

This repository currently implements **all six phases**, Phase 1 through Phase 6:

- **Phase 1**: authentication, dashboard, project CRUD, Script Studio UI,
  Scene Builder UI, and the template system, against a Supabase backend.
- **Phase 2**: a real Express API server that calls OpenAI or Anthropic
  server-side (your API key is never sent to the browser) for script
  generation, script improvement, scene breakdown, single-scene
  regeneration, and platform captions/hashtags — plus AI usage logging in
  Supabase.
- **Phase 3**: real text-to-speech voice-over generation (OpenAI TTS or
  ElevenLabs, switchable per request), audio stored privately in Supabase
  Storage, and an in-browser audio player per scene.
- **Phase 4**: a subtitle system with scene-level timing and SRT/JSON
  export, a visual/B-roll asset module (file upload, solid/gradient
  backgrounds, stock photo search, AI-generated visual prompts), a
  drag-and-drop timeline editor, and a 9:16 preview canvas that plays
  through scenes with synced audio and subtitle overlays.
- **Phase 5**: a real FFmpeg rendering pipeline that composites every
  scene's visual, voice-over, and burned-in subtitles into a single
  1080×1920 30fps MP4 with crossfade transitions between scenes, a render
  job queue with live progress, and an Export Center for downloading the
  result and copying captions/hashtags/script/SRT.
- **Phase 6**: a working mobile navigation drawer (there was none before —
  the sidebar simply disappeared below the `md` breakpoint), responsive
  fixes to the timeline editor and list views, a global error boundary,
  consistent skeleton loading states across every studio tab, and
  route-level + tab-level code-splitting that cut the main JS bundle from
  ~500KB to ~400KB with the rest loaded on demand.

Every phase builds on top of this foundation without breaking changes —
the full database schema for every phase was included from Phase 1.

## Stack

- **Frontend**: React 18 + TypeScript + Vite, Tailwind CSS, React Router
- **Backend API**: Node.js + Express (`server/`), calls OpenAI/Anthropic
- **Database & Auth**: Supabase (Postgres + Auth + Storage), Row Level Security throughout
- **Icons**: lucide-react

## 1. Prerequisites

- Node.js 18+
- A free [Supabase](https://supabase.com) project
- An OpenAI or Anthropic API key (for Phase 2 AI features)
- **FFmpeg** installed and on your `PATH` (for Phase 5 rendering) — the
  server shells out to the `ffmpeg`/`ffprobe` CLI directly, there's no
  bundled binary. Install it with:
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg fonts-dejavu-core`
  - Windows: download from [ffmpeg.org](https://ffmpeg.org/download.html) and add it to `PATH`
  - Verify with `ffmpeg -version` — this project was built and tested against 6.1.1
  - Subtitle burn-in uses a system font file. The default
    (`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`) is Debian/Ubuntu's
    path; on macOS/Windows set `SUBTITLE_FONT_PATH` in your server env to a
    `.ttf` file you have installed.

## 2. Set up Supabase

1. Create a new Supabase project.
2. In the SQL Editor, run the migrations **in order**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_storage_buckets.sql`
   - `supabase/migrations/004_project_captions.sql`
   - `supabase/migrations/005_audio_assets_updates.sql`
   - `supabase/migrations/006_visual_and_subtitle_updates.sql`
3. Then run `supabase/seed/templates.sql` to load the 8 default templates.
4. In **Authentication → Providers**, make sure Email sign-up is enabled.
   (For local development you can turn off "Confirm email" to skip the
   verification step.)
5. In **Project Settings → API**, copy your **Project URL**, **anon public**
   key, and **service_role** key (the last one is secret — server-only).

## 3. Configure environment variables

```bash
cp .env.example .env.local
```

`.env.local` is used by **both** the Vite frontend and the Express server —
Vite only bundles the `VITE_`-prefixed variables into the browser; everything
else stays server-side.

```
# Frontend
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_API_BASE_URL=http://localhost:8787

# Server
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_PROVIDER=openai          # or "anthropic"
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

You only need to fill in the key for whichever `AI_PROVIDER` you choose.
Never put a secret key in a `VITE_`-prefixed variable — anything prefixed
`VITE_` is bundled into the browser and is not private.

## 4. Install and run

Two processes run side by side in development: the Vite frontend and the
Express API server.

```bash
npm install
npm run dev:all
```

This starts the frontend at http://localhost:5173 and the API at
http://localhost:8787. (You can also run `npm run dev` and
`npm run server:dev` in two separate terminals if you prefer.)

Open http://localhost:5173, click **Create one** to register an account,
then start creating projects.

**Deploying?** See [`DEPLOY.md`](./DEPLOY.md) — the frontend and backend
deploy to different places (Vercel for the frontend, a container host like
Cloud Run for the FFmpeg backend), and that file walks through both.

## 5. Project structure

```
src/
├── components/
│   ├── layout/        Sidebar, Header, DashboardLayout
│   └── ui/             Button, Card, Input, Modal, Badge, EmptyState, Skeleton
├── context/            AuthContext, ToastContext
├── pages/
│   ├── auth/            Login, Register, ForgotPassword
│   ├── projects/       ProjectsList, NewProject, ProjectDetail
│   ├── studio/          ScriptStudio, SceneEditor, VoiceoverStudio, VisualAssetStudio,
│   │                    SubtitleStudio, TimelineEditor, VideoPreview, RenderPanel, CaptionGenerator
│   ├── Dashboard.tsx
│   ├── Templates.tsx
│   ├── RenderQueue.tsx     Cross-project render job monitor
│   ├── ExportCenter.tsx    Cross-project download + captions/script/SRT export
│   └── Settings.tsx
├── services/            projectService, sceneService, templateService, audioService,
│                       visualService, subtitleService, renderService, aiService (call the API server)
├── lib/                 supabase client, apiClient (authenticated GET/POST/DELETE to the API server), utils
└── types/                database.types.ts, index.ts

server/                  Express API — the ONLY place AI/TTS provider and stock-photo keys are used
├── index.ts             App entrypoint, CORS, error handling
├── lib/
│   ├── aiProviders.ts    OpenAI / Anthropic abstraction (AI_PROVIDER env switch)
│   ├── ttsProviders.ts   OpenAI TTS / ElevenLabs abstraction (TTS_PROVIDER env switch)
│   ├── ffmpeg.ts          Low-level ffmpeg/ffprobe process runner + drawtext escaping
│   ├── renderPipeline.ts  Per-scene segment rendering + crossfade concatenation
│   ├── storageAdmin.ts   Uploads audio/renders to Supabase Storage, issues signed URLs
│   ├── auth.ts           Verifies Supabase session token, checks project ownership
│   ├── supabaseAdmin.ts  service_role Supabase client (server-only)
│   └── usageLog.ts       Writes to ai_usage_logs
└── routes/
    ├── ai.ts             /api/ai/generate-script, improve-script, split-scenes,
    │                    regenerate-scene, generate-visual-prompt, captions-hashtags
    ├── audio.ts          /api/audio/generate-scene, generate-project, signed-url/:id, DELETE /:id
    ├── visuals.ts         /api/visuals/stock-search (Pexels / Pixabay / Unsplash)
    └── render.ts          /api/render/start, job/:id, jobs, exports, download/:id

supabase/
├── migrations/          001 schema, 002 RLS, 003 storage buckets, 004 caption columns,
│                       005 audio_assets updates, 006 visual/subtitle updates
└── seed/                templates.sql
```

## 6. What works right now

**Phase 1**
- Register, log in, log out, forgot-password flow
- Protected dashboard routes
- Dashboard with live stats pulled from your projects
- Full project CRUD: create, list, view, duplicate, delete
- Scene Builder: add, edit, reorder, delete scenes
- 8 seeded templates you can start a project from
- Settings page with API-key status checker (no secret values ever shown)
- Dark mode, responsive layout, toast notifications, loading/empty states

**Phase 2**
- Script Studio: **Generate Script**, **Improve Script**, and **Split Into
  Scenes** now call real AI (OpenAI or Anthropic, your choice) through the
  `server/` API, and persist results to Supabase
- Scene Builder: each scene's regenerate button calls AI to rewrite that
  scene's voice-over, subtitle, visual prompt, and B-roll keyword
- New **Captions & Hashtags** tab on each project: generates a YouTube
  title, TikTok/Facebook/Instagram captions, 5–10 hashtags, a short
  description, and 3 alternative hooks — with one-click copy buttons
- Every AI call is authenticated (the server verifies your Supabase session
  before calling any AI provider) and logged to `ai_usage_logs`

**Phase 3**
- New **Voice-over** tab on each project: pick a provider (OpenAI TTS or
  ElevenLabs) and a voice style (calm, serious, emotional, energetic,
  documentary, friendly), then generate audio per scene or for the whole
  project in one click
- Generated audio is uploaded to the private `project-audio` Supabase
  Storage bucket; the browser only ever gets a short-lived signed URL to
  play it, fetched on demand
- Each scene shows generation status (queued/generating/ready/failed), an
  inline audio player once ready, and a regenerate/delete control
- Regenerating a scene's audio overwrites the same storage object and
  database row rather than piling up duplicates
- Switch TTS provider globally via `TTS_PROVIDER` in your server env, or
  per-request from the Voice-over tab's provider selector

**Phase 4**
- New **Subtitles** tab: pick style (clean/bold/yellow highlight/white with
  shadow), position (top/center/bottom), and font size, then generate
  scene-level timed captions in one click. Preview them inline, or download
  as `.srt` or `.json`
- New **Visuals** tab, per scene: upload an image or video, pick a solid
  color or two-color gradient, search Pexels/Pixabay/Unsplash stock photos
  by keyword and attach one, or have AI write a detailed visual/B-roll
  prompt from the scene's voice-over text
- New **Timeline & Preview** tab: drag-and-drop scene reordering, inline
  duration/transition/music-mood editing, at-a-glance audio/visual-ready
  indicators, and total-duration vs. target tracking
- A 9:16 preview canvas plays through the scene list with the assigned
  visual (image, video, solid, or gradient), the matching subtitle overlay
  styled per your subtitle settings, and the scene's generated voice-over
  audio where available — with play/pause and scene navigation controls
- Visual uploads and stock-photo attachments go straight from the browser
  to the private `project-visuals` Supabase Storage bucket (RLS-enforced,
  same pattern as `project-audio`); no server round-trip needed since no
  secret key is involved

**Phase 5**
- New **Render** tab per project: click **Render Video** to composite every
  scene's visual (image/video/solid/gradient), voice-over audio, and
  burned-in subtitle into a single 1080×1920 30fps H.264 MP4
- Scenes are crossfaded together — a `fade`/`slide`/`zoom` transition
  renders as a real 0.5s crossfade; `cut`/`none` uses a much shorter 0.15s
  blend rather than a literal instantaneous cut (documented simplification;
  true hard cuts and dedicated slide/zoom motion are natural follow-ups)
  and the boundary is genuinely computed with ffmpeg's `xfade`/`acrossfade`
  filters, not just concatenated
- Rendering runs as an in-process async job on the Express server (no
  Redis/BullMQ queue in this starter) — the job is created and returned
  immediately, then polled via `render_jobs.status`/`progress` while it runs
  in the background
- **Render Queue** (sidebar) shows every render job across all your
  projects with live status, auto-refreshing every 5s
- **Export Center** (sidebar) lists every finished video: download the
  MP4, copy per-platform captions and hashtags (snapshotted from the
  project at render time), export the final script as `.txt`, export
  subtitles as `.srt`, or trigger a fresh re-render — all without leaving
  the page

## 7. Phase 6 polish, in detail

- **Mobile navigation**: the sidebar was `hidden` below the `md` breakpoint
  with no replacement — on a phone there was previously no way to navigate
  at all. `src/components/layout/MobileNav.tsx` is a proper slide-in drawer
  (Escape to close, backdrop click to close, body scroll locked while open),
  triggered by a hamburger button in the header that only renders on mobile.
- **Responsive fixes**: the Timeline Editor's per-scene duration/transition/
  music-mood controls used fixed pixel widths in a single flex row that
  overflowed on narrow screens — they now stack into a 3-column grid below
  the scene info on mobile and collapse back into one row at `sm:` and up
  (via `display: contents`). Project title + status badge rows on the
  Dashboard and Render Queue now truncate instead of pushing badges
  off-screen when a title is long.
- **Consistent loading states**: five studio tabs (Visuals, Subtitles,
  Timeline, Render, Voice-over) rendered nothing at all while their initial
  data was loading. They now show the same skeleton pattern used elsewhere
  in the app.
- **Error boundary**: `src/components/ErrorBoundary.tsx` catches any
  unhandled render error and shows a recoverable "something went wrong"
  screen with a button back to the dashboard, instead of a blank white page.
- **Real toast/drawer animations**: the toast notifications and the new
  mobile drawer use `animate-in`/`slide-in-from-*` utility classes that,
  it turns out, were never backed by a plugin in earlier phases — they were
  silently doing nothing. Added `tailwindcss-animate` so they actually
  animate now.
- **Bundle size**: all eight per-project studio tabs and every top-level
  route are now behind `React.lazy()` + `Suspense`, splitting what was a
  single ~500KB JS bundle into a ~400KB shell plus small per-page chunks
  fetched on demand — a project's Render tab, for example, no longer costs
  anything until you actually open it.
- **Account menu**: the header's account dropdown had no click-outside-to-
  close handler; it now closes on an outside click as well as re-clicking.

No schema or architectural changes were needed for this phase.

## 8. Ideas for further work

The spec's six phases are all implemented, but a few things are explicitly
simplified for V1 and worth knowing about if you keep building:

- **Render queue is in-process**, not a real job queue (see §9 security
  notes) — fine for one instance, not for scaling out.
- **`slide`/`zoom` transitions** currently render as the same crossfade as
  `fade` — there's no actual slide/zoom motion yet.
- **No background music mixing** — there's nowhere in the app to upload a
  music track, so the `background_music_mood` field is descriptive only and
  isn't mixed into the render.
- **Subtitle timing is scene-level**, not word-level, per the original spec
  ("prepare code for word-level timing" later) — `subtitle_assets.timing_json`
  is shaped to make that upgrade additive rather than a rewrite.
- **Audio duration is estimated** from word count (~2.5 words/sec) rather
  than decoded from the actual audio file.

## 9. Security notes

- The frontend only ever uses the Supabase **anon** key. The `service_role`
  key lives exclusively in `server/` and is never sent to the browser.
- Every table has Row Level Security enabled — a user can only see and
  modify their own projects, scenes, and assets.
- No AI provider API key is ever called from client code. Every AI request
  goes through the Express server, which verifies the caller's Supabase
  session and, when a `projectId` is included, that the project belongs to
  that user, before forwarding anything to OpenAI/Anthropic.
- The server never returns raw AI provider error bodies or stack traces to
  the client — errors are caught and re-wrapped.
- The `project-audio` Storage bucket is private. The server issues
  short-lived signed URLs (default 1 hour) for playback rather than making
  audio files public, and every signed-URL/delete request re-checks that
  the requesting user owns the project first.
- The `project-visuals` bucket is also private and follows the same
  per-user-folder RLS pattern. Uploads and signed-URL generation happen
  directly from the browser using the Supabase client (no secret key is
  needed for either), while Pexels/Pixabay/Unsplash search goes through the
  server since it requires provider API keys. Stock provider keys are
  optional — the Visuals tab still works fully for uploads and solid/gradient
  backgrounds without them; search simply returns a clear "not configured"
  error until you add a key.
- Rendering shells out to the `ffmpeg`/`ffprobe` CLI as child processes with
  arguments passed as an array (never through a shell string), so scene
  text and file paths can't inject extra command-line flags. All source
  assets are downloaded to a per-job temp directory that's deleted
  (`fs.rm(..., { recursive: true })`) once the render finishes or fails,
  including on error paths.
- The single-process render queue in this starter is appropriate for a
  self-hosted single instance. It does not survive a server restart
  mid-render and won't scale across multiple instances — swap
  `void renderProject(...)` in `server/routes/render.ts` for a real queue
  (e.g. BullMQ + Redis, or a cloud task queue) before running this in a
  multi-instance production deployment.
