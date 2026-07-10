import type { Capability, ProviderAdapter } from "./types";

/**
 * In-memory registry of every adapter the server process knows about.
 * Populated once at startup by server/lib/adapters/registerAdapters.ts.
 * This is the ONLY place provider implementations are referenced by name —
 * routes and the frontend go through the router (router.ts), never this
 * registry directly.
 */
class ProviderRegistry {
  private adapters: ProviderAdapter[] = [];

  register(adapter: ProviderAdapter): void {
    if (this.adapters.some((a) => a.id === adapter.id)) {
      throw new Error(`Adapter id "${adapter.id}" is already registered.`);
    }
    this.adapters.push(adapter);
  }

  getAll(): ProviderAdapter[] {
    return this.adapters;
  }

  getByCapability(capability: Capability): ProviderAdapter[] {
    return this.adapters.filter((a) => a.capabilities.includes(capability));
  }

  getByProviderName(providerName: string): ProviderAdapter[] {
    return this.adapters.filter((a) => a.providerName === providerName);
  }
}

export const providerRegistry = new ProviderRegistry();
