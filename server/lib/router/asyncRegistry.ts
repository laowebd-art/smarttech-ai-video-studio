import type { Capability } from "./types";
import type { AsyncProviderAdapter } from "./asyncTypes";

class AsyncProviderRegistry {
  private adapters: AsyncProviderAdapter[] = [];

  register(adapter: AsyncProviderAdapter): void {
    if (this.adapters.some((a) => a.id === adapter.id)) {
      throw new Error(`Async adapter id "${adapter.id}" is already registered.`);
    }
    this.adapters.push(adapter);
  }

  getAll(): AsyncProviderAdapter[] {
    return this.adapters;
  }

  getByCapability(capability: Capability): AsyncProviderAdapter[] {
    return this.adapters.filter((a) => a.capabilities.includes(capability));
  }

  getByProviderName(providerName: string): AsyncProviderAdapter | null {
    return this.adapters.find((a) => a.providerName === providerName) ?? null;
  }
}

export const asyncProviderRegistry = new AsyncProviderRegistry();
