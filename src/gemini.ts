// One place for model calls. Every call must return JSON: strip fences, parse, retry once, then flag.
import { GEMINI_API_KEY, GEMINI_MODEL } from "./config";

// v1: older Flash models 404 for new keys (same finding as the common-ground project).
const ENDPOINT = "https://generativelanguage.googleapis.com/v1/models";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function parseJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try {
    return JSON.parse(text);
  } catch (e) {
    // Fall back to the outermost {...} if the model added prose around it.
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(text.slice(a, b + 1));
    throw e;
  }
}

type Content = { role: "user" | "model"; parts: { text: string }[] };

async function generate(contents: Content[], system: string, timeoutMs: number): Promise<{ text: string; finish: string }> {
  const key = GEMINI_API_KEY();
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  };
  let err = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}/${GEMINI_MODEL()}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const data = (await res.json()) as { candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
        const cand = data.candidates?.[0];
        // Skip thought parts; keep only the answer text.
        const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
        return { text, finish: cand?.finishReason ?? "" };
      }
      err = `HTTP ${res.status}`;
      // Never log the request: it contains CV text.
      if (!RETRYABLE.has(res.status)) throw new Error(`Gemini ${err}: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gemini HTTP")) throw e;
      err = e instanceof Error ? e.name : "network error";
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
  }
  throw new Error(`Gemini failed after retries (${err})`);
}

/** `check` returns what's missing from a parsed answer; a non-empty list is treated like invalid JSON (one retry, then flag). */
export async function callJson<T = unknown>(system: string, user: string, timeoutMs = 120_000, check?: (d: unknown) => string[]): Promise<{ data: T | null; error: string }> {
  let contents: Content[] = [{ role: "user", parts: [{ text: user }] }];
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let text: string, finish: string;
    try {
      ({ text, finish } = await generate(contents, system, timeoutMs));
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
    if (finish && finish !== "STOP" && finish !== "MAX_TOKENS") return { data: null, error: `model stopped: ${finish}` };
    let fix = "That was not valid JSON. Reply again with only the JSON object, no prose and no code fences.";
    try {
      const data = parseJson(text);
      const missing = check ? check(data) : [];
      if (!missing.length) return { data: data as T, error: "" };
      lastErr = `answer missing: ${missing.join(", ")}`;
      fix = `Your JSON left out: ${missing.join(", ")}. Reply again with the complete JSON object including every key, no prose.`;
    } catch (e) {
      lastErr = finish === "MAX_TOKENS" ? "output cut off (MAX_TOKENS)" : `invalid JSON: ${e instanceof Error ? e.message : e}`;
    }
    contents = [
      { role: "user", parts: [{ text: user }] },
      { role: "model", parts: [{ text }] },
      { role: "user", parts: [{ text: fix }] },
    ];
  }
  return { data: null, error: lastErr };
}
