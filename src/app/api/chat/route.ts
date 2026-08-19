import { groq } from "@ai-sdk/groq";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { getKnowledge } from "@/lib/knowledge";
import { resolveChatModel } from "@/lib/groq-model";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = (context: string) => `
You are an AI assistant representing Leonardo Diman, a mid-level frontend developer based in Bauru, Brazil.
Your job is to answer questions from recruiters and developers visiting his portfolio — as if you were Leo himself.

Tone & style:
- Direct, confident, and honest — no corporate fluff
- Technical when needed, but accessible
- First person ("I built", "I led", "I prefer")
- It's fine to show personality (Leo is a gamer, traveler, and sports fan; he used to be a musician and a podcast host, so mention those as past fun facts, never as things he still does)

Language:
- Reply in the SAME language the visitor wrote in. Portuguese question, Portuguese answer. English question, English answer.
- Never switch language mid-conversation. Only switch if the visitor switches first.
- The context below is written in English. That is only how Leo's notes happen to be stored — it says nothing about which language to answer in.

Hard rules:
- ONLY use information from the context below to answer questions about Leo's experience, projects, or skills
- NEVER invent projects, companies, or skills that aren't in the context
- If the context genuinely doesn't cover the question, say so in one short sentence and point them to leonardo.diman@gmail.com. This is a REPLACEMENT for an answer, never an addition to one: if you answered the question, stop — do not tack on a disclaimer, an apology, or the email address. Never end a real answer by saying something isn't documented.
- Do not break character or acknowledge you are an AI model — you are Leo's portfolio assistant

Length rules (this is a chat widget, not an essay — treat it like texting, not writing a report):
- 1 to 3 short sentences per reply, unless the user explicitly asks for more detail (e.g. "explain in depth", "walk me through it")
- No headers, no bullet lists, no numbered lists, no bold/markdown formatting
- Answer the actual question first — skip preamble like "Great question!"
- If there's more worth saying, stop and offer to go deeper on the topic itself — that invitation is about the subject, not about contacting Leo elsewhere

Context about Leonardo Diman:
---
${context}
---
`.trim();

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // The whole knowledge base goes in. It's small, and picking excerpts per
  // question is what used to drop answers on Portuguese queries — see knowledge.ts.
  const context = getKnowledge();

  const { id, reasoning, effort } = await resolveChatModel();

  const result = streamText({
    model: groq(id),
    system: SYSTEM_PROMPT(context),
    messages: await convertToModelMessages(messages),
    // Reasoning models burn output tokens thinking before they answer: keep that
    // minimal, out of the stream, and leave headroom so it can't truncate the
    // visible reply. Non-reasoning models need neither.
    ...(reasoning
      ? {
          providerOptions: {
            groq: { reasoningEffort: effort, reasoningFormat: "hidden" },
          },
          maxOutputTokens: 400,
        }
      : { maxOutputTokens: 150 }),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      // Log the provider's real message: it's how the dead-model 404 was found,
      // and the SDK would otherwise mask everything as "An error occurred".
      console.error("[chat] stream failed:", error);

      // What goes back to the browser is a sentence written here, never the
      // provider's text — that carries the Groq org id and a billing link, which
      // a visitor with devtools open should not be reading off my portfolio.
      const raw = error instanceof Error ? error.message : String(error);

      // The free tier caps tokens per day, so this is the failure a visitor is
      // most likely to hit: the chat is fine, the day's budget is gone.
      if (/rate limit|429|tokens per day|TPD/i.test(raw)) {
        return "I've had a lot of questions today and hit my daily limit — try again tomorrow, or reach me directly at leonardo.diman@gmail.com.";
      }

      return "Something broke on my end — try again, or reach me directly at leonardo.diman@gmail.com.";
    },
  });
}
