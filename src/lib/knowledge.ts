import fs from "fs";
import path from "path";

const KNOWLEDGE_PATH = path.join(process.cwd(), "src/data/knowledge/leo.md");

// This file used to be a RAG pipeline: leo.md was chunked, embedded locally with
// all-MiniLM-L6-v2, and the top 4 chunks by cosine similarity were sent as
// context. Two things made that a bad trade here.
//
// First, correctness. That embedding model is English-only and leo.md is written
// in English, but plenty of visitors ask in Portuguese. Those queries landed in a
// different region of the vector space, so retrieval only worked when a proper
// noun happened to overlap ("React", "Hotvips", "futebol"). "Você já liderou um
// projeto do zero?" retrieved nothing and the chat answered that it wasn't
// documented — for something leo.md states outright. The same question in English
// answered correctly.
//
// Second, there was nothing to gain. The whole file is ~3.3k tokens across 8
// chunks, so top-4 was already sending half of it. Retrieval was discarding
// answers to save a rounding error's worth of tokens.
let cached: string | null = null;

export function getKnowledge(): string {
  // Cached per server instance in production, where the file can't change under
  // us. Re-read every request in dev, so editing leo.md takes effect without a
  // restart — the stale in-memory copy used to answer confidently with old facts,
  // which reads as the model lying rather than as a caching bug.
  if (process.env.NODE_ENV === "production" && cached !== null) return cached;

  cached = fs.readFileSync(KNOWLEDGE_PATH, "utf-8");
  return cached;
}
