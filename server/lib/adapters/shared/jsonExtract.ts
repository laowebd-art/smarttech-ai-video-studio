/**
 * Both text-generation adapters ask the model to return ONLY a JSON object.
 * We parse defensively in case a model wraps the JSON in prose or a
 * markdown code fence anyway.
 */
export function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("AI response did not contain a parseable JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
