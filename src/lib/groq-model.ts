import { createGroq } from "@ai-sdk/groq";

// Groq retires models on a rolling basis, and access is scoped per account —
// a hardcoded id silently 404s the day it's decommissioned (this is what broke
// `llama-3.1-8b-instant`). So we ask the account what it actually has and pick
// the best available, instead of trusting a constant.
//
// Rate limits are also per model, not per account: when gpt-oss-120b hit its
// 200k tokens/day ceiling and stopped answering, qwen on the same key kept
// serving. That's free capacity sitting idle whenever one model is exhausted,
// so instead of resolving a single model per instance we keep the whole ordered
// list and fall down it on a 429 — see cascadingFetch below.

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
//
// Order matters more now that the list is a cascade: a visitor only reaches the
// weaker models when everything above them is rate limited.
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

let cached: Promise<Candidate[]> | null = null;

async function listModels(): Promise<string[]> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
  });
  if (!res.ok) throw new Error(`model listing failed: ${res.status}`);
  const body = (await res.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
}

async function pick(): Promise<Candidate[]> {
  try {
    const available = new Set(await listModels());

    const preferred = PREFERRED.filter((c) => available.has(c.id));
    if (preferred.length > 0) return preferred;

    // Nothing from the preference list — take any chat-capable model rather
    // than failing outright. Assume reasoning, which is the safe default:
    // it only costs a larger token budget if we're wrong.
    // "none" is the safe effort here: gpt-oss accepts it too, so an unknown
    // model can't 400 on a value only some of the family understands.
    const any = [...available].filter((id) => !NON_CHAT.test(id));
    if (any.length > 0) {
      return any.map((id) => ({ id, reasoning: true, effort: "none" as const }));
    }

    throw new Error("no chat-capable model available on this Groq account");
  } catch (err) {
    console.error("[groq] model discovery failed, using fallback:", err);
    return [FALLBACK];
  }
}

/** Resolved once per server instance and reused across requests. */
function resolveChatModels(): Promise<Candidate[]> {
  if (!cached) cached = pick();
  return cached;
}

// ─── Cooldowns ────────────────────────────────────────────────────────────────
// A model that just returned 429 will keep returning 429 until its window
// resets, so remembering that saves a wasted round trip per request. Groq puts
// the wait in `retry-after`; a daily ceiling can be minutes away, so it's worth
// honouring rather than hammering. Instances are ephemeral, which makes this
// best-effort by nature — the cost of forgetting is one extra failed call.

const cooldownUntil = new Map<string, number>();

function isCooling(id: string): boolean {
  const until = cooldownUntil.get(id);
  if (until === undefined) return false;
  if (Date.now() >= until) {
    cooldownUntil.delete(id);
    return false;
  }
  return true;
}

function startCooldown(id: string, res: Response) {
  const retryAfter = Number(res.headers.get("retry-after"));
  const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 60;
  cooldownUntil.set(id, Date.now() + seconds * 1000);
  console.warn(`[groq] ${id} rate limited, cooling down ${seconds}s`);
}

// ─── The cascade ──────────────────────────────────────────────────────────────

/**
 * Rewrites the outgoing request for a given candidate. The body the SDK built
 * names one model, but every model needs its own reasoning_effort, so swapping
 * the id alone would 400 on qwen.
 */
function bodyFor(body: Record<string, unknown>, c: Candidate): string {
  return JSON.stringify({ ...body, model: c.id, reasoning_effort: c.effort });
}

/**
 * Sits under the provider as middleware. On a 429 it moves to the next model and
 * reissues the same request, so a visitor sees a slightly different voice rather
 * than an error. Only the last response is returned once every model is spent —
 * the route turns that into the "hit my daily limit" message.
 */
const cascadingFetch: typeof fetch = async (input, init) => {
  // Anything that isn't a chat completion with a JSON body (the model listing,
  // say) passes straight through untouched.
  let body: Record<string, unknown>;
  try {
    if (typeof init?.body !== "string") return fetch(input, init);
    body = JSON.parse(init.body) as Record<string, unknown>;
    if (typeof body.model !== "string") return fetch(input, init);
  } catch {
    return fetch(input, init);
  }

  const candidates = await resolveChatModels();
  // Cooling models go last rather than getting dropped: if every model is
  // cooling, a stale cooldown should not turn into a hard failure.
  const order = [...candidates.filter((c) => !isCooling(c.id)), ...candidates.filter((c) => isCooling(c.id))];

  let last: Response | null = null;
  for (const candidate of order) {
    if (last) last.body?.cancel().catch(() => {});

    const res = await fetch(input, { ...init, body: bodyFor(body, candidate) });
    if (res.status !== 429) return res;

    startCooldown(candidate.id, res);
    last = res;
  }

  // Everything is rate limited. Hand back the last 429 so the real provider
  // error still reaches the logs.
  return last ?? fetch(input, init);
};

export const groq = createGroq({
  apiKey: process.env.GROQ_API_KEY,
  fetch: cascadingFetch,
});

/**
 * The model the request starts with. The cascade may end up answering with a
 * different one, but the route still needs a concrete id to hand `streamText`,
 * and its token budget should suit the model most requests actually use.
 */
export async function resolveChatModel(): Promise<Candidate> {
  const candidates = await resolveChatModels();
  return candidates.find((c) => !isCooling(c.id)) ?? candidates[0];
}
