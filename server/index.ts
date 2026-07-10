import "dotenv/config";
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
const port = Number(process.env.PORT) || 8787;
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    supabaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

// Read-only view of which providers are registered and configured for each
// capability — used by Settings and (later) an Admin Panel. Never exposes
// API key values, only whether one is present.
app.get("/api/providers/status", requireAuth, (_req, res) => {
  res.json({ providers: [...listProviderStatus(), ...listAsyncProviderStatus()] });
});

app.use("/api/ai", aiRouter);
app.use("/api/audio", audioRouter);
app.use("/api/visuals", visualsRouter);
app.use("/api/render", renderRouter);
app.use("/api/video", videoGenRouter);

// Centralized error handler as a last resort so the API never returns raw
// stack traces to the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  const allProviders = [...listProviderStatus(), ...listAsyncProviderStatus()];
  console.log(`[server] SmartTech AI Studio API listening on http://localhost:${port}`);
  console.log(`[server] CORS_ORIGIN=${allowedOrigin}`);
  console.log(`[server] AI Router providers: ${allProviders.map((p) => `${p.providerName}${p.configured ? "" : " (not configured)"}`).join(", ")}`);
});
