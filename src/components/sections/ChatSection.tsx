"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";

const getTextContent = (m: UIMessage) =>
  m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

// ─── Suggested questions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's your current tech stack?",
  "Tell me about your most challenging project",
  "Are you open to relocation?",
  "Do you have experience with Redux?",
];

interface BubbleProps {
  role: "user" | "assistant";
  content: string;
}

// ─── Contact links ─────────────────────────────────────────────────────────────

const CONTACT_LINKS = [
  {
    label: "Email",
    href: "mailto:leonardo.diman@gmail.com",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    ),
  },
  {
    label: "GitHub",
    href: "https://github.com/leodiman182",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/in/leonardodiman/",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
];

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ role, content }: BubbleProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="mr-2 mt-1 h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/10">
          <Image src="/portrait.png" alt="Leo" width={28} height={28} className="h-full w-full object-cover" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "rounded-tr-sm bg-white text-black"
            : "rounded-tl-sm border border-white/10 bg-white/5 text-white/90"
        )}
      >
        {content}
      </div>
    </motion.div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/10">
        <Image src="/portrait.png" alt="Leo" width={28} height={28} className="h-full w-full object-cover" />
      </div>
      <div className="flex gap-1 rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-white/40"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatSection() {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [started, setStarted] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, isLoading]);

  function handleSuggestion(text: string) {
    setInput(text);
    setStarted(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setStarted(true);
    sendMessage({ text: input });
    setInput("");
  }

  async function copyEmail() {
    await navigator.clipboard.writeText("leonardo.diman@gmail.com");
    setEmailCopied(true);
    setTimeout(() => setEmailCopied(false), 2000);
  }

  return (
    <section
      id="chat"
      className="relative mx-auto flex min-h-1/2 w-full max-w-2xl flex-col justify-center px-4 py-8"
    >
      {/* Name */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-6 text-center"
      >
        <h1 className="text-5xl font-semibold tracking-tight sm:text-4xl">
          <span className="bg-linear-to-r from-[#f0dfc0] via-[#d9b3c2] to-[#8fa8cc] bg-clip-text text-transparent">
            Leonardo Diman
          </span>
        </h1>
      </motion.div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-10 text-center"
      >
        <p className="mb-2 text-xs uppercase tracking-widest text-white/30">AI-powered</p>
        <h2 className="text-3xl font-semibold tracking-tight text-white">Ask me anything</h2>
        <p className="mt-3 text-sm text-white/40">
          Powered by my actual experience — I only answer what I know.
        </p>
      </motion.div>

      {/* Chat window */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/8 bg-white/3 p-2">
        {/* Messages */}
        <div className="flex h-64 flex-col gap-3 overflow-y-auto">
          <AnimatePresence initial={false}>
            {!started && messages.length === 0 && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-3 py-6"
              >
                <p className="text-sm text-white/30">Try asking something:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSuggestion(s)}
                      className="group relative rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs transition hover:border-white/20"
                    >
                      <span className="text-white/60 transition-opacity duration-300 group-hover:opacity-0">
                        {s}
                      </span>
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center bg-linear-to-r from-[#f0dfc0] via-[#d9b3c2] to-[#8fa8cc] bg-clip-text text-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      >
                        {s}
                      </span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} role={m.role as "user" | "assistant"} content={getTextContent(m)} />
            ))}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <TypingIndicator />
              </motion.div>
            )}

            {error && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <p className="text-sm text-red-300/80">
                  Something broke on my end — try again, or reach me directly at
                  leonardo.diman@gmail.com
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-white/8" />

        {/* Input */}
        <form onSubmit={onSubmit} className="flex items-center gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about my experience, stack, availability..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/20 outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition",
              input.trim() && !isLoading
                ? "bg-white text-black hover:bg-white/90"
                : "cursor-not-allowed border border-white/10 text-white/20"
            )}
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>

      {/* Disclaimer */}
      <p className="mt-4 text-center text-xs text-white/20">
        Responses are generated by AI trained on my actual data — always feel free to reach out directly.
      </p>

      {/* Contact */}
      <div className="mt-6 flex items-center justify-center gap-6">
        {CONTACT_LINKS.map(({ label, href, icon }) =>
          label === "Email" ? (
            <button
              key={label}
              type="button"
              onClick={copyEmail}
              aria-label="Copy email address"
              className="text-white/30 transition-colors duration-200 hover:text-sand"
            >
              {icon}
            </button>
          ) : (
            <a
              key={label}
              href={href}
              target={href.startsWith("http") ? "_blank" : undefined}
              rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
              aria-label={label}
              className="text-white/30 transition-colors duration-200 hover:text-sand"
            >
              {icon}
            </a>
          )
        )}
      </div>

      {/* Copy toast */}
      <AnimatePresence>
        {emailCopied && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/80 px-4 py-2.5 text-sm text-white/90 shadow-lg backdrop-blur-md"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 text-[#8fa8cc]"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Email copied to clipboard
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
