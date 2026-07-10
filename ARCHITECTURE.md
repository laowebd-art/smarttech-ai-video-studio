# SmartTech AI Studio — Architecture

This document is the honest map of the platform: what's real and running
today, what's schema-ready but not wired up, and what's roadmap only. It
exists so nobody — including a future you, six months from now — mistakes a
"coming soon" stub for a working feature.

## The core idea: capability-based routing, not provider selection

The single architectural principle everything else follows:

> **The frontend and the rest of the backend never reference a provider by
> name.** They ask the AI Router for a *capability* ("generate voice audio
> for this text"), and the router decides which provider actually handles
> it — with automatic fallback if the primary is unavailable.

Concretely: `VoiceoverStudio.tsx` used to have a "Voice provider: OpenAI /
ElevenLabs" dropdown. It doesn't anymore. The user picks a *voice style*
(a creative choice); which company's API actually renders the audio is an
implementation detail the router owns.

```
┌─────────────┐     capability      ┌──────────────┐     adapter.execute()   ┌──────────┐
│  Route       │ ──────────────────▶ │  AI Router    │ ───────────────────────▶ │ Adapter   │
│ (ai.ts,      │  "voice_generation" │ (router.ts)   │  tries in priority      │ (OpenAI,  │
│  audio.ts)   │                     │               │  order, auto-fallback  │  Eleven-  │
└─────────────┘                     └──────┬────────┘  on failure             │  Labs...) │
                                            │                                  └──────────┘
                                            ▼
                                   provider_configs table
                                   (priority + enabled per
                                    capability, DB-editable)
```

## What's real right now

| Capability | Live adapters | Registered but stubbed |
|---|---|---|
| `text_generation` / `translation` | OpenAI, Anthropic | — |
| `voice_generation` | ElevenLabs (primary), OpenAI TTS (fallback) | — |
| `video_generation` | Kling (primary), Google Veo (fallback), Runway (second fallback) | — |
| `image_generation` | — | ChatGPT Images, Flux |
| `music_generation` | — | Suno |
| `video_editing` | — | CapCut workflow, DaVinci Resolve workflow |
| `publishing` | — | YouTube, TikTok, Facebook |

Video generation is async/job-based (submit → poll), unlike text and voice
which return a result synchronously — see "Two kinds of adapter" below.

"Registered but stubbed" means the capability slot, the `ai_providers` /
`provider_configs` rows, and the adapter registration all exist — the
router, a future admin panel, and this document all already know these
providers by name — but calling one throws a clear "not implemented yet"
error rather than pretending to work. Swapping a stub for a real
implementation is a one-file change (write the adapter, register it in
`server/lib/adapters/registerAdapters.ts` in place of the stub) — nothing
in routes/, the frontend, or the database changes.

**Modules built on real adapters today:**
- **AI Video Studio** — two surfaces, both real:
  - The project workspace (Script Studio → Scene Builder → Visuals →
    Subtitles → Timeline → Render) — script generation, scene breakdown,
    visual prompts, and captions all route through `text_generation`.
  - The standalone **AI Video Studio** page (`/ai-video-studio`) — text-to-video
    and image-to-video generation via Kling/Veo/Runway, with job status,
    progress, retry, cancel, and download.
- **AI Voice Studio** — the Voice-over tab (per-project scene narration) plus
  a standalone voice-style preview — both route through `voice_generation`.

Everything else in Phases 1–6 (rendering, storage, auth, project
management) is unchanged by this refactor; only *how a provider is chosen*
changed.

## Two kinds of adapter

**Sync (`ProviderAdapter`, `router/types.ts`)** — text and voice generation
return a result in one request/response. `routeTask()` tries each candidate
in priority order and returns the first success.

**Async (`AsyncProviderAdapter`, `router/asyncTypes.ts`)** — video generation
(and likely music/video-editing generation later) is submit-then-poll: a
provider accepts a job and hands back a task id; the actual video isn't
ready for minutes. `submitAsyncTask()` falls back across providers **only
on submission failure** (bad auth, provider down) — never mid-generation,
since by then the job has already been accepted and is being billed.
Once a job is submitted, all status checks and cancellation for that
specific job are locked to the provider that accepted it
(`checkAsyncStatus()` / `cancelAsyncTask()`, keyed by the stored
`provider_name` on the `ai_generation_jobs` row) — there's no fallback
mid-flight, and no ambiguity about which provider a given job belongs to.

There's no background worker: `GET /api/video/jobs/:id` live-checks the
owning provider on every poll and updates the row. This is the same
pragmatic, single-process pattern as Phase 5's `render_jobs` — documented
as a scaling limit, not hidden (see "What a full production platform still
needs" below).

## Adding a new provider

**Sync capability (text, voice):**
1. Write an adapter implementing `ProviderAdapter` in `server/lib/adapters/`
   (see `text/openaiTextAdapter.ts` for the shape).
2. Register it in `registerAdapters.ts`, replacing the matching stub from
   `comingSoon.ts` if there is one.
3. Add a `provider_configs` row (or update the seed) so it's included in
   the priority chain for its capability.

**Async capability (video, and likely future music/editing):**
1. Write an adapter implementing `AsyncProviderAdapter` in
   `server/lib/adapters/video/` (see `klingVideoAdapter.ts` for the shape) —
   `submit()`, `checkStatus()`, and optionally `cancel()`.
2. Register it in `registerAdapters.ts`'s `asyncProviderRegistry` section.
3. Add a `provider_configs` row.

Either way: no route, no frontend component, no other adapter changes. This
is the mechanism that satisfies "the system must allow adding or removing
AI providers without changing the frontend" — it's not aspirational, it's
how OpenAI/Anthropic, ElevenLabs/OpenAI-TTS, and Kling/Veo/Runway are
already plugged in.

## Database layer

`supabase/migrations/007_ai_studio_platform.sql` adds:

- **`ai_providers`** — catalog of every known provider (active/planned/disabled)
- **`provider_configs`** — what the router actually reads: `(capability, provider_name, priority, enabled)`
- **`organizations` / `organization_members`** — schema groundwork for
  multi-user workspaces. The app is still functionally single-owner (see
  `profiles`); nothing reads these tables yet.
- **`subscriptions` / `credits`** — billing groundwork. No payment
  provider is integrated; nothing gates usage on these yet.
- **`api_keys`** — groundwork for a future "call this platform's API
  programmatically" feature. Not implemented.

`supabase/migrations/008_ai_generation_jobs.sql` adds:

- **`ai_generation_jobs`** — tracks every async generation job (video today):
  mode, provider, external job id, status, progress, retry count, and both
  the provider's own result URL and our mirrored copy in the private
  `ai-generated-videos` Storage bucket. This is genuinely read/written by
  running code (`server/routes/videoGen.ts`), unlike the groundwork-only
  tables above.

Everything from Phases 1–6 (`projects`, `scenes`, `audio_assets`,
`visual_assets`, `subtitle_assets`, `render_jobs`, `exported_videos`,
`ai_usage_logs`) is unchanged and is what's actually read/written by
running code.

## Full module vision vs. what exists

The requested platform has ~20 modules. Here's the honest state of each:

**Built and real:** Dashboard, Projects, AI Video Studio (both the
project-scoped pipeline — script/scenes/visuals/subtitles/timeline/render —
and the standalone Kling/Veo/Runway generation page), AI Voice Studio
(project-scoped narration + standalone style preview), Template Library,
Render Queue, Export Center, Settings (live AI Router provider status).

**Not built — each is a real scoped project, not a checkbox:** AI Chat, AI
Writer (standalone, outside a video project), AI Translator, AI Image
Studio, AI Music Studio, AI Video Editor (standalone timeline editing
outside the render pipeline), AI Thumbnail Generator, AI Social Publisher,
Prompt Library, History (cross-module activity feed), Media Library
(cross-project asset browser), Downloads, Billing, API Keys, Usage
Analytics, Admin Panel, Super Admin, System Monitoring.

Building these out doesn't require re-architecting anything above — each
new capability is: an adapter, a `provider_configs` row, one focused UI
module. That's the point of the router design, and video generation
(Kling/Veo/Runway) is the proof: it went from "stubbed" to "real, with job
tracking, retry, and cancellation" without touching the router, the
database schema for anything else, or any other module. But the remaining
~17 modules are genuinely not built, and no nav items or routes for them
were added, on purpose — a grayed-out "coming soon" nav item for 15 modules
would look like progress without being any.

## What a full production platform still needs (not attempted here)

Being direct about the gap between "the router works" and "this handles
10,000 concurrent users":

- **A real job queue.** Both `render_jobs` (Phase 5) and the new
  `ai_generation_jobs` (video generation) run as in-process work on a
  single Express server — `ai_generation_jobs` specifically has no
  background worker at all; `GET /api/video/jobs/:id` live-checks the
  provider on every poll rather than a worker pushing updates. This is
  fine for one instance, moderate traffic, and jobs that complete in
  minutes. It will not survive a server restart mid-job, won't scale
  across multiple instances, and doesn't resume automatically after a
  crash — a real queue (BullMQ+Redis, or a managed task queue) is the
  correct next step before this handles real production video-generation
  volume.
- **Horizontal scaling** of the backend needs that same queue (so any
  instance can pick up any job) plus the render pipeline's temp-file
  handling moved off local disk (or pinned to one worker per job).
- **Billing/credits enforcement** — the tables exist; nothing checks
  `credits.balance` before letting a request through (including before an
  expensive Kling/Veo/Runway call), and there's no Stripe/payment integration.
- **Admin Panel / Super Admin / System Monitoring** — no auth role beyond
  "owner" exists yet; these need a real permissions model first.
