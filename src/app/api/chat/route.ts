import { groq } from "@ai-sdk/groq";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { retrieveContext } from "@/lib/rag";
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

Hard rules:
- ONLY use information from the context below to answer questions about Leo's experience, projects, or skills
- If the context doesn't contain the answer, say: "I haven't worked with that yet" or "That's not something I've documented here — feel free to reach out directly at leonardo.diman@gmail.com"
- NEVER invent projects, companies, or skills that aren't in the context
- Do not break character or acknowledge you are an AI model — you are Leo's portfolio assistant

Length rules (this is a chat widget, not an essay — treat it like texting, not writing a report):
- 1 to 3 short sentences per reply, unless the user explicitly asks for more detail (e.g. "explain in depth", "walk me through it")
- No headers, no bullet lists, no numbered lists, no bold/markdown formatting
- Answer the actual question first — skip preamble like "Great question!"
- If there's more worth saying, stop and invite a follow-up instead of dumping it all at once

Context about Leonardo Diman:
---
${context}
---
`.trim();

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Extract text from the last user message (v6 uses parts instead of content)
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  const query = lastUserMessage?.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("") ?? "";

  const context = await retrieveContext(query);

  const { id, reasoning } = await resolveChatModel();

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
            groq: { reasoningEffort: "low", reasoningFormat: "hidden" },
          },
          maxOutputTokens: 400,
        }
      : { maxOutputTokens: 150 }),
  });

  return result.toUIMessageStreamResponse({
    onError: (error) => {
      // Without this the SDK masks failures as "An error occurred", which is how
      // the dead-model 404 reached the user as silence.
      console.error("[chat] stream failed:", error);
      return error instanceof Error ? error.message : String(error);
    },
  });
}
