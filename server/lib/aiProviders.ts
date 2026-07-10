// ============================================================================
// AI provider abstraction. Switch providers with AI_PROVIDER=openai|anthropic
// in the server environment — nothing in routes/ai.ts needs to change.
//
// Both providers are asked to return ONLY a JSON object matching a schema we
// describe in the prompt. We parse defensively in case a model wraps the
// JSON in prose or a markdown code fence.
// ============================================================================

export interface AiCallResult {
  json: any;
  provider: "openai" | "anthropic";
  model: string;
  tokensUsed: number | null;
}

function extractJson(text: string): any {
  // Strip ```json ... ``` or ``` ... ``` fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI response did not contain a parseable JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

async function callOpenAI(systemPrompt: string, userPrompt: string): Promise<AiCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured on the server.");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
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
    json: extractJson(content),
    provider: "openai",
    model,
    tokensUsed: data.usage?.total_tokens ?? null,
  };
}

async function callAnthropic(systemPrompt: string, userPrompt: string): Promise<AiCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");
  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: `${systemPrompt}\n\nRespond with ONLY a valid JSON object. No prose, no markdown fences.`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text.slice(0, 300)}`);
  }

  const data: any = await response.json();
  const content = data.content?.[0]?.text ?? "";
  return {
    json: extractJson(content),
    provider: "anthropic",
    model,
    tokensUsed: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) || null,
  };
}

export async function generateJson(systemPrompt: string, userPrompt: string): Promise<AiCallResult> {
  const provider = (process.env.AI_PROVIDER || "openai").toLowerCase();
  if (provider === "anthropic") return callAnthropic(systemPrompt, userPrompt);
  if (provider === "openai") return callOpenAI(systemPrompt, userPrompt);
  throw new Error(`Unknown AI_PROVIDER "${provider}". Use "openai" or "anthropic".`);
}
