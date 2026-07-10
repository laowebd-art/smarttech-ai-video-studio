import { supabaseAdmin } from "./supabaseAdmin";

export async function logAiUsage(params: {
  userId: string;
  projectId?: string | null;
  feature: string;
  provider: string;
  tokensUsed: number | null;
}) {
  try {
    await supabaseAdmin.from("ai_usage_logs").insert({
      user_id: params.userId,
      project_id: params.projectId ?? null,
      feature: params.feature,
      provider: params.provider,
      tokens_used: params.tokensUsed,
    });
  } catch (err) {
    // Usage logging must never break the actual AI response for the user.
    console.error("[usageLog] failed to write ai_usage_logs row:", err);
  }
}
