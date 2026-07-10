import { supabaseAdmin } from "../supabaseAdmin";
import { logAiUsage } from "../usageLog";
import { providerRegistry } from "./registry";
import { AllProvidersFailedError, ProviderNotAvailableError, type AdapterContext, type Capability, type ProviderAdapter } from "./types";

/**
 * Reads the priority order for a capability from provider_configs
 * (enabled=true, ordered by priority ascending — lower runs first). Returns
 * null if the table has no rows for this capability yet, so the router can
 * fall back to registration order without requiring the table to be seeded
 * before anything works.
 */
async function getConfiguredOrder(capability: Capability): Promise<string[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("provider_configs")
      .select("provider_name")
      .eq("capability", capability)
      .eq("enabled", true)
      .order("priority", { ascending: true });

    if (error || !data || data.length === 0) return null;
    return data.map((row: any) => row.provider_name as string);
  } catch (err) {
    // A Supabase outage/misconfiguration should degrade to registration
    // order, not take down AI routing entirely.
    console.error("[AIRouter] failed to read provider_configs, falling back to registration order:", err);
    return null;
  }
}

function orderCandidates(candidates: ProviderAdapter[], preferredNames: string[] | null): ProviderAdapter[] {
  if (!preferredNames) return candidates;
  const byName = new Map(candidates.map((c) => [c.providerName, c]));
  const ordered = preferredNames.map((name) => byName.get(name)).filter((c): c is ProviderAdapter => Boolean(c));
  // Any registered adapter not mentioned in provider_configs still gets a
  // chance, appended after the configured ones, rather than silently dropped.
  const remaining = candidates.filter((c) => !preferredNames.includes(c.providerName));
  return [...ordered, ...remaining];
}

export interface RouteResult<TOutput> {
  data: TOutput;
  providerName: string;
}

/**
 * Routes a task to the best available provider for a capability, trying
 * each configured candidate in priority order and automatically falling
 * back to the next one on failure (including "not configured"). This is the
 * ONLY entry point routes/ should use to reach an AI provider — never call
 * an adapter directly. Returns both the result and which provider actually
 * served it, since callers (e.g. audio_assets rows) often want to record that.
 */
export async function routeTask<TInput, TOutput>(
  capability: Capability,
  input: TInput,
  ctx: AdapterContext
): Promise<RouteResult<TOutput>> {
  const candidates = providerRegistry.getByCapability(capability);
  if (candidates.length === 0) {
    throw new ProviderNotAvailableError(capability);
  }

  const preferredOrder = await getConfiguredOrder(capability);
  const ordered = orderCandidates(candidates, preferredOrder);

  const attempts: Array<{ provider: string; reason: string }> = [];

  for (const adapter of ordered) {
    if (!adapter.isConfigured()) {
      attempts.push({ provider: adapter.providerName, reason: "not configured" });
      continue;
    }
    try {
      const result = await adapter.execute(input, ctx);
      await logAiUsage({
        userId: ctx.userId,
        projectId: ctx.projectId ?? null,
        feature: ctx.feature,
        provider: result.providerName,
        tokensUsed: result.tokensUsed ?? null,
      });
      return { data: result.data as TOutput, providerName: result.providerName };
    } catch (err: any) {
      console.error(`[AIRouter] ${adapter.id} failed (capability=${capability}, feature=${ctx.feature}):`, err?.message ?? err);
      attempts.push({ provider: adapter.providerName, reason: (err?.message ?? "unknown error").slice(0, 200) });
      // Automatic fallback: try the next candidate.
    }
  }

  throw new AllProvidersFailedError(capability, attempts);
}

/** For a Settings/Admin "provider status" view — never exposes API keys, only configured/not. */
export function listProviderStatus(): Array<{ id: string; providerName: string; capabilities: Capability[]; configured: boolean }> {
  return providerRegistry.getAll().map((a) => ({
    id: a.id,
    providerName: a.providerName,
    capabilities: a.capabilities,
    configured: a.isConfigured(),
  }));
}
