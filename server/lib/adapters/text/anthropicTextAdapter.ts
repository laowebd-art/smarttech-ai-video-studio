import type { AdapterContext, AdapterResult, ProviderAdapter } from "../../router/types";
import { extractJson } from "../shared/jsonExtract";
import type { TextGenInput } from "./openaiTextAdapter";

export const anthropicTextAdapter: ProviderAdapter<TextGenInput, any> = {
  id: "anthropic-text",
  providerName: "anthropic",
  capabilities: ["text_generation", "translation"],

  isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async execute(input, _ctx: AdapterContext): Promise<AdapterResult<any>> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
    const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: `${input.systemPrompt}\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences.`,
        messages: [{ role: "user", content: input.userPrompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text.slice(0, 300)}`);
    }

    const data: any = await response.json();
    const content = data.content?.[0]?.text ?? "";

    return {
      data: extractJson(content),
      providerName: "anthropic",
      tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) || null,
    };
  },
};
