// Groq retires models on a rolling basis, and access is scoped per account —
// a hardcoded id silently 404s the day it's decommissioned (this is what broke
// `llama-3.1-8b-instant`). So we ask the account what it actually has and pick
// the best available, instead of trusting a constant.

interface Candidate {
  id: string;
  /** Reasoning models spend output tokens thinking before they answer. */
  reasoning: boolean;
  /**
   * Groq does not accept the same reasoning_effort values across models: the
   * gpt-oss pair takes "low", while qwen3.6 rejects anything but "none" or
   * "default" with a 400. Sending one hardcoded value for every reasoning model
   * meant qwen would have failed every single request the moment it got picked
   * — which is exactly what this module is built to do when the others vanish.
   */
  effort: "low" | "none";
}

// Best first. Non-reasoning models are preferred: this is a short-answer chat
// widget, so thinking tokens are pure latency and cost here.
//
// None of the non-reasoning entries are currently on this account — they're kept
// because which models an account can see changes over time, which is the whole
// reason this module exists. So in practice a reasoning model always wins, and
// the order among them is measured rather than assumed: gpt-oss-20b is the
// cheapest but answers English questions in Portuguese and invents skills that
// aren't in the knowledge base, so it sits last despite the price. qwen3.6-27b
// stays grounded, respects the visitor's language, and is a third the size of
// the 120b whose token appetite exhausted the free tier's 200k/day budget.
const PREFERRED: Candidate[] = [
  { id: "llama-3.3-70b-versatile", reasoning: false, effort: "none" },
  { id: "llama-3.1-8b-instant", reasoning: false, effort: "none" },
  { id: "moonshotai/kimi-k2-instruct-0905", reasoning: false, effort: "none" },
  { id: "qwen/qwen3.6-27b", reasoning: true, effort: "none" },
  { id: "openai/gpt-oss-120b", reasoning: true, effort: "low" },
  { id: "openai/gpt-oss-20b", reasoning: true, effort: "low" },
];

// Used when the model listing can't be reached, so a transient failure to list
// doesn't take the chat down with it.
const FALLBACK: Candidate = { id: "qwen/qwen3.6-27b", reasoning: true, effort: "none" };

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
    // "none" is the safe effort here: gpt-oss accepts it too, so an unknown
    // model can't 400 on a value only some of the family understands.
    const any = [...available].find((id) => !NON_CHAT.test(id));
    if (any) return { id: any, reasoning: true, effort: "none" };

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
