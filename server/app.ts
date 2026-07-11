import express from "express";
import cors from "cors";
import { registerAdapters } from "./lib/adapters/registerAdapters";
import { listProviderStatus } from "./lib/router/router";
import { listAsyncProviderStatus } from "./lib/router/asyncRouter";
import { requireAuth } from "./lib/auth";
import { aiRouter } from "./routes/ai";
import { audioRouter } from "./routes/audio";
import { visualsRouter } from "./routes/visuals";
import { renderRouter } from "./routes/render";
import { videoGenRouter } from "./routes/videoGen";

registerAdapters();

const app = express();
const allowedOrigin = process.env.CORS_ORIGIN || true;

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

// Read-only view of which providers are registered and configured for each
// capability. Never exposes API key values, only whether one is present.
app.get("/api/providers/status", requireAuth, (_req, res) => {
  res.json({ providers: [...listProviderStatus(), ...listAsyncProviderStatus()] });
});

app.use("/api/ai", aiRouter);
app.use("/api/audio", audioRouter);
app.use("/api/visuals", visualsRouter);
app.use("/api/render", renderRouter);
app.use("/api/video", videoGenRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

export default app;
