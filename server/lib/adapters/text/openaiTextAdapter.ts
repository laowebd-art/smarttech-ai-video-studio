import type { AdapterContext, AdapterResult, ProviderAdapter } from "../../router/types";
import { extractJson } from "../shared/jsonExtract";

export interface TextGenInput {
  systemPrompt: string;
  userPrompt: string;
}

export const openaiTextAdapter: ProviderAdapter<TextGenInput, any> = {
  id: "openai-text",
  providerName: "openai",
  capabilities: ["text_generation", "translation"],

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  },

  async execute(input, _ctx: AdapterContext): Promise<AdapterResult<any>> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text.slice(0, 300)}`);
    }

    const data: any = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      data: extractJson(content),
      providerName: "openai",
      tokensUsed: data.usage?.total_tokens ?? null,
    };
  },
};
