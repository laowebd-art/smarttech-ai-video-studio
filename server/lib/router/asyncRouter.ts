import { supabaseAdmin } from "../supabaseAdmin";
import { logAiUsage } from "../usageLog";
import { asyncProviderRegistry } from "./asyncRegistry";
import { AllAsyncProvidersFailedError, AsyncProviderNotAvailableError, type AsyncStatusResult } from "./asyncTypes";
import type { AdapterContext, Capability } from "./types";

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
    console.error("[AsyncAIRouter] failed to read provider_configs, falling back to registration order:", err);
    return null;
  }
}

/**
 * Submits a job, trying providers in priority order and falling back ONLY on
 * submission failure (bad auth, provider outage, not configured) — never
 * mid-generation, since the job has already been accepted and paid for by
 * that point. Returns which provider ended up owning the job; all future
 * status checks and cancellation for this job must go through that same
 * provider (see checkAsyncStatus / cancelAsyncTask below).
 */
export async function submitAsyncTask<TInput>(
  capability: Capability,
  input: TInput,
  ctx: AdapterContext
): Promise<{ externalJobId: string; providerName: string }> {
  const candidates = asyncProviderRegistry.getByCapability(capability);
  if (candidates.length === 0) throw new AsyncProviderNotAvailableError(capability);

  const preferredOrder = await getConfiguredOrder(capability);
  const ordered = preferredOrder
    ? [
        ...preferredOrder.map((name) => candidates.find((c) => c.providerName === name)).filter((c): c is (typeof candidates)[number] => Boolean(c)),
        ...candidates.filter((c) => !preferredOrder.includes(c.providerName)),
      ]
    : candidates;

  const attempts: Array<{ provider: string; reason: string }> = [];

  for (const adapter of ordered) {
    if (!adapter.isConfigured()) {
      attempts.push({ provider: adapter.providerName, reason: "not configured" });
      continue;
    }
    try {
      const { externalJobId } = await adapter.submit(input, ctx);
      await logAiUsage({
        userId: ctx.userId,
        projectId: ctx.projectId ?? null,
        feature: ctx.feature,
        provider: adapter.providerName,
        tokensUsed: null,
      });
      return { externalJobId, providerName: adapter.providerName };
    } catch (err: any) {
      console.error(`[AsyncAIRouter] ${adapter.id} rejected submission (capability=${capability}):`, err?.message ?? err);
      attempts.push({ provider: adapter.providerName, reason: (err?.message ?? "unknown error").slice(0, 200) });
    }
  }

  throw new AllAsyncProvidersFailedError(capability, attempts);
}

export async function checkAsyncStatus(providerName: string, externalJobId: string): Promise<AsyncStatusResult> {
  const adapter = asyncProviderRegistry.getByProviderName(providerName);
  if (!adapter) throw new Error(`No async adapter registered for provider "${providerName}".`);
  return adapter.checkStatus(externalJobId);
}

export async function cancelAsyncTask(providerName: string, externalJobId: string): Promise<void> {
  const adapter = asyncProviderRegistry.getByProviderName(providerName);
  if (!adapter) throw new Error(`No async adapter registered for provider "${providerName}".`);
  if (!adapter.cancel) throw new Error(`${providerName} does not support cancelling an in-progress generation.`);
  return adapter.cancel(externalJobId);
}

export function listAsyncProviderStatus(): Array<{ id: string; providerName: string; capabilities: Capability[]; configured: boolean }> {
  return asyncProviderRegistry.getAll().map((a) => ({
    id: a.id,
    providerName: a.providerName,
    capabilities: a.capabilities,
    configured: a.isConfigured(),
  }));
}
