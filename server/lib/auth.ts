import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "./supabaseAdmin";

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Verifies the Supabase access token sent as `Authorization: Bearer <token>`
 * by the frontend (see src/lib/apiClient.ts). Rejects the request with 401
 * if the token is missing or invalid. On success, attaches `req.userId`.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header." });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Invalid or expired session. Please sign in again." });
  }

  req.userId = data.user.id;
  next();
}

/**
 * If a projectId is present in the request body, verifies that it belongs to
 * the authenticated user before continuing. Prevents one user from writing
 * usage logs against, or inferring the existence of, another user's project.
 */
export async function verifyProjectOwnership(req: AuthedRequest, res: Response, next: NextFunction) {
  const projectId = (req.body?.projectId as string | undefined) ?? (req.query?.projectId as string | undefined);
  if (!projectId) return next(); // some routes (e.g. captions on a topic only) may omit it

  const { data, error } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", req.userId)
    .maybeSingle();

  if (error || !data) {
    return res.status(404).json({ error: "Project not found." });
  }
  next();
}
