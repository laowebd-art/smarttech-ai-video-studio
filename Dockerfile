# ============================================================================
# Backend API (server/) — Express + FFmpeg render pipeline.
#
# This is NOT for Vercel. Vercel's serverless functions don't ship an ffmpeg
# binary, have hard execution-time limits well under what a multi-scene
# video render needs, and don't persist a writable temp filesystem across
# the pipeline's steps the way server/lib/renderPipeline.ts requires.
#
# Build for Google Cloud Run (matches the rest of the SocialGuard stack):
#   docker build -t smarttech-api .
#   gcloud run deploy smarttech-api \
#     --image gcr.io/YOUR_PROJECT/smarttech-api \
#     --platform managed --region asia-southeast1 --allow-unauthenticated \
#     --set-env-vars AI_PROVIDER=openai,TTS_PROVIDER=openai,CORS_ORIGIN=https://your-vercel-app.vercel.app \
#     --set-secrets SUPABASE_SERVICE_ROLE_KEY=...,OPENAI_API_KEY=...
#
# Works the same way on Railway / Render / Fly.io / any Docker host — Cloud
# Run is just what the rest of this project's ecosystem already uses.
# ============================================================================

FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY server ./server
COPY tsconfig.json ./

ENV NODE_ENV=production
# Cloud Run injects PORT itself; server/index.ts already reads process.env.PORT.
EXPOSE 8080

CMD ["npx", "tsx", "server/index.ts"]
