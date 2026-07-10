import crypto from "node:crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Minimal HS256 JWT signer — enough for providers (Kling) that require a
 * short-lived signed token as their bearer credential rather than a static
 * API key. No external JWT library needed for this one algorithm.
 */
export function signHS256Jwt(payload: Record<string, unknown>, secret: string, headerExtra: Record<string, unknown> = {}): string {
  const header = { alg: "HS256", typ: "JWT", ...headerExtra };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  return `${encodedHeader}.${encodedPayload}.${base64url(signature)}`;
}
