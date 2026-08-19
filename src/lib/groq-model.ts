// Groq retires models on a rolling basis, and access is scoped per account —
// a hardcoded id silently 404s the day it's decommissioned (this is what broke
// `llama-3.1-8b-instant`). So we ask the account what it actually has and pick
// the best available, instead of trusting a constant.

interface Candidate {
  id: string;
  /** Reasoning models spend output tokens thinking before they answer. */
  reasoning: boolean;
}

// Best first. Non-reasoning models are preferred: this is a short-answer chat
// widget, so thinking tokens are pure latency and cost here.
const PREFERRED: Candidate[] = [
  { id: "llama-3.3-70b-versatile", reasoning: false },
  { id: "llama-3.1-8b-instant", reasoning: false },
  { id: "moonshotai/kimi-k2-instruct-0905", reasoning: false },
  { id: "openai/gpt-oss-120b", reasoning: true },
  { id: "openai/gpt-oss-20b", reasoning: true },
  { id: "qwen/qwen3.6-27b", reasoning: true },
];

// Used when the model listing can't be reached, so a transient failure to list
// doesn't take the chat down with it.
const FALLBACK: Candidate = { id: "openai/gpt-oss-120b", reasoning: true };

// Models that can't serve chat completions, filtered out of the last-resort scan.
const NON_CHAT = /whisper|orpheus|prompt-guard|guard|tts|embed/i;

let cached: Promise<Candidate> | null = null;

async function listModels(): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`model listing failed: ${res.status}`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

async function pick(): Promise<Candidate> {
  try {
    const available = new Set(await listModels());

    const preferred = PREFERRED.find((c) => available.has(c.id));
    if (preferred) return preferred;

    // Nothing from the preference list — take any chat-capable model rather
    // than failing outright. Assume reasoning, which is the safe default:
    // it only costs a larger token budget if we're wrong.
    const any = [...available].find((id) => !NON_CHAT.test(id));
    if (any) return { id: any, reasoning: true };

    throw new Error("no chat-capable model available on this Groq account");
  } catch (err) {
    console.error("[groq] model discovery failed, using fallback:", err);
    return FALLBACK;
  }
}

/** Resolved once per server instance and reused across requests. */
export function resolveChatModel(): Promise<Candidate> {
  if (!cached) cached = pick();
  return cached;
}
