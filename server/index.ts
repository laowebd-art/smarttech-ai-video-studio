import "dotenv/config";
import express from "express";
import cors from "cors";
import { aiRouter } from "./routes/ai";
import { audioRouter } from "./routes/audio";
import { visualsRouter } from "./routes/visuals";
import { renderRouter } from "./routes/render";

const app = express();
const port = Number(process.env.PORT) || 8787;
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiProvider: process.env.AI_PROVIDER || "openai",
    supabaseConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

app.use("/api/ai", aiRouter);
app.use("/api/audio", audioRouter);
app.use("/api/visuals", visualsRouter);
app.use("/api/render", renderRouter);

// Centralized error handler as a last resort so the API never returns raw
// stack traces to the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[server] unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(port, () => {
  console.log(`[server] SmartTech AI Video Studio API listening on http://localhost:${port}`);
  console.log(`[server] AI_PROVIDER=${process.env.AI_PROVIDER || "openai"}  CORS_ORIGIN=${allowedOrigin}`);
});
