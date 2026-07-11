import app from "./app";
import { listProviderStatus } from "./lib/router/router";
import { listAsyncProviderStatus } from "./lib/router/asyncRouter";

const port = Number(process.env.PORT) || 8787;
const allowedOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";

app.listen(port, () => {
  const allProviders = [...listProviderStatus(), ...listAsyncProviderStatus()];
  console.log(`[server] SmartTech AI Studio API listening on http://localhost:${port}`);
  console.log(`[server] CORS_ORIGIN=${allowedOrigin}`);
  console.log(`[server] AI Router providers: ${allProviders.map((p) => `${p.providerName}${p.configured ? "" : " (not configured)"}`).join(", ")}`);
});
