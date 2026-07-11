import { supabase } from "./supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8787" : "");

/**
 * Calls the SmartTech AI Video Studio backend (server/index.ts), attaching
 * the current Supabase session's access token so the server can identify
 * and authorize the request. Never used to call OpenAI/Anthropic/ElevenLabs
 * directly — those calls only happen server-side.
 */
async function apiRequest<T>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  if (!token) {
    throw new Error("You must be signed in to use this feature.");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload as T;
}

export function apiPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  return apiRequest<T>("POST", path, body);
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>("GET", path);
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>("DELETE", path);
}
