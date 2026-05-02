"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import MathRenderer from "@/components/math-renderer";
import { useAIContext, type AIContext } from "@/components/ai-context";
import { loadProfile } from "@/lib/progress";
import type { CurriculumTopic } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

type Mode = "guided" | "explain";

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  image?: string;
  responseTime?: number;
}

const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  home: [
    "What should I study next?",
    "Which topics am I weakest in?",
    "Give me a quick warm-up quiz",
    "Explain my progress",
  ],
  learn: [
    "Can you explain this differently?",
    "Show me another example",
    "Why does this rule work?",
    "I'm confused — help me understand",
  ],
  practice: [
    "Help me with this question",
    "Why was my answer wrong?",
    "Give me a hint",
    "Explain the solution step by step",
  ],
  general: [
    "What should I review first?",
    "How am I doing overall?",
    "Quiz me on my weak topics",
    "Help me study",
  ],
};

function contextLabel(ctx: AIContext): string {
  switch (ctx.page) {
    case "learn": return `Viewing: ${ctx.topicTitle || "Lesson"}`;
    case "practice": return `Viewing: ${ctx.topicTitle || "Practice"}`;
    case "home": return "Viewing: Learning progress";
    default: return "Viewing: General";
  }
}

function placeholderText(ctx: AIContext): string {
  switch (ctx.page) {
    case "home": return "Ask about your progress...";
    case "learn": return `Ask about ${ctx.topicTitle || "this topic"}...`;
    case "practice": return "Need help with a question?";
    default: return "Ask me anything...";
  }
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {expanded ? (
        <>
          <polyline points="4 14 10 14 10 20"/>
          <polyline points="20 10 14 10 14 4"/>
          <line x1="14" y1="10" x2="21" y2="3"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </>
      ) : (
        <>
          <polyline points="15 3 21 3 21 9"/>
          <polyline points="9 21 3 21 3 15"/>
          <line x1="21" y1="3" x2="14" y2="10"/>
          <line x1="3" y1="21" x2="10" y2="14"/>
        </>
      )}
    </svg>
  );
}

export default function AIPanel() {
  const { context, expanded, toggleExpand, quizActive } = useAIContext();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("guided");
  const [ollamaOk, setOllamaOk] = useState(true);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevPageRef = useRef(context.page);
  const prevTopicRef = useRef(context.topicId);

  useEffect(() => {
    fetch("/api/ollama-health")
      .then((r) => r.json())
      .then((d) => setOllamaOk(d.ok))
      .catch(() => setOllamaOk(false));
  }, []);

  // Fetch contextual suggestions
  useEffect(() => {
    const fetchSuggestions = async () => {
      setSuggestionsLoading(true);
      try {
        const profile = loadProfile();
        const topics = curriculum.topics as CurriculumTopic[];
        const topicMasteries = topics.map((t) => ({
          name: t.title.en,
          mastery: profile?.topics[t.id]?.mastery || 0,
        }));
        const recentWrong = profile?.wrong_answers?.slice(-3).map((w) => w.question) || [];

        const res = await fetch("/api/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: context.page,
            currentTopicName: context.topicTitle || "",
            topicMasteries,
            recentWrongAnswers: recentWrong,
          }),
        });
        const data = await res.json();
        if (data.suggestions && Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, 4));
        } else {
          setSuggestions(FALLBACK_SUGGESTIONS[context.page] || FALLBACK_SUGGESTIONS.general);
        }
      } catch {
        setSuggestions(FALLBACK_SUGGESTIONS[context.page] || FALLBACK_SUGGESTIONS.general);
      } finally {
        setSuggestionsLoading(false);
      }
    };

    fetchSuggestions();
  }, [context.page, context.topicId, context.topicTitle]);

  // Clear conversation when page or topic changes
  useEffect(() => {
    if (context.page !== prevPageRef.current || context.topicId !== prevTopicRef.current) {
      setMessages([]);
      setStreaming("");
      setInput("");
      setPendingImage(null);
      prevPageRef.current = context.page;
      prevTopicRef.current = context.topicId;
    }
  }, [context.page, context.topicId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const handleNewChat = () => {
    setMessages([]);
    setStreaming("");
    setInput("");
    setPendingImage(null);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const sendMessageWithContent = useCallback(async (content: string, image?: string | null) => {
    if ((!content.trim() && !image) || isLoading) return;

    const userMsg: ChatMsg = {
      role: "user",
      content: content.trim() || (image ? "What is this problem? Help me solve it." : ""),
      image: image || undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImage(null);
    setIsLoading(true);
    setStreaming("");

    const startTime = Date.now();

    try {
      const images = userMsg.image
        ? [userMsg.image.replace(/^data:image\/[^;]+;base64,/, "")]
        : undefined;

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg.content,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          context,
          mode: mode === "guided" ? "tutor" : "explain",
          images,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              accumulated += chunk.message.content;
              setStreaming(accumulated);
            }
          } catch { /* skip */ }
        }
      }

      if (buffer.trim()) {
        try {
          const chunk = JSON.parse(buffer);
          if (chunk.message?.content) accumulated += chunk.message.content;
        } catch { /* skip */ }
      }

      const elapsed = Date.now() - startTime;

      if (accumulated.trim()) {
        setMessages((prev) => [...prev, {
          role: "assistant",
          content: accumulated.trim(),
          responseTime: elapsed,
        }]);
      }
    } catch (err) {
      console.error("Assistant error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Could not reach Beacon AI. Make sure Ollama is running." },
      ]);
    } finally {
      setStreaming("");
      setIsLoading(false);
    }
  }, [isLoading, messages, context, mode]);

  const sendMessage = useCallback(() => {
    sendMessageWithContent(input, pendingImage);
  }, [input, pendingImage, sendMessageWithContent]);

  const handleSuggestionClick = (suggestion: string) => {
    sendMessageWithContent(suggestion, null);
  };

  const isExpanded = expanded === "panel";
  const isHidden = expanded === "center";

  if (isHidden) {
    return (
      <div
        className="w-10 bg-card border-l border-border flex flex-col items-center justify-center cursor-pointer hover:bg-surface transition shrink-0"
        onClick={() => toggleExpand("center")}
      >
        <span className="text-muted text-xs" style={{ writingMode: "vertical-rl" }}>Beacon AI</span>
        <span className="text-muted mt-2">&lsaquo;</span>
      </div>
    );
  }

  const showSuggestions = messages.length === 0 && !streaming && !isLoading;

  return (
    <div className={`flex flex-col bg-card border-l border-border shrink-0 transition-all ${
      isExpanded ? "flex-1" : "flex-1 min-w-[380px] max-w-[50%]"
    }`} style={{ borderLeftWidth: "0.5px", borderColor: "#E8EBF0" }}>
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${ollamaOk ? "bg-success" : "bg-muted"}`} />
            <span className="text-[15px] font-semibold text-navy">Beacon AI</span>
            <span className="text-[11px] text-muted">{ollamaOk ? "Local AI ready" : "Offline"}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 text-muted hover:text-blue transition px-2 py-1 rounded-md text-[11px]"
              title="New chat"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New chat
            </button>
            <button
              onClick={() => toggleExpand("panel")}
              className="text-muted hover:text-navy transition p-1"
              title={isExpanded ? "Restore panel" : "Expand panel"}
            >
              <ExpandIcon expanded={isExpanded} />
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted truncate mb-2.5">{contextLabel(context)}</p>

        {/* Mode pills */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("guided")}
            className={`text-[11px] px-3.5 py-1.5 rounded-full transition font-medium ${
              mode === "guided"
                ? "bg-blue text-white"
                : "border border-border text-muted hover:text-body hover:border-body"
            }`}
          >
            Guided
          </button>
          <button
            onClick={() => setMode("explain")}
            className={`text-[11px] px-3.5 py-1.5 rounded-full transition font-medium ${
              mode === "explain"
                ? "bg-blue text-white"
                : "border border-border text-muted hover:text-body hover:border-body"
            }`}
          >
            Explain
          </button>
        </div>
      </div>

      {quizActive ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-[14px] text-muted leading-relaxed max-w-[280px]">
            Beacon AI is paused while you take the quiz. It&apos;ll be back when you finish.
          </p>
        </div>
      ) : (
      <>
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

        {/* Suggestion bubbles — loaded from API */}
        {showSuggestions && (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <p className="text-sm text-muted mb-6">Ask Beacon AI anything about your lesson.</p>
            <div className="grid grid-cols-2 gap-2 max-w-[340px] w-full">
              {suggestionsLoading ? (
                <>
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="bg-mathbg rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-4 w-[80%] bg-border/40 rounded" />
                    </div>
                  ))}
                </>
              ) : (
                suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="text-left text-[13px] text-body bg-mathbg rounded-xl px-4 py-3 hover:border-blue border border-transparent transition leading-snug"
                  >
                    {s}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg, i) => (
          <div key={i}>
            <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-navy text-white rounded-2xl rounded-br-md"
                  : "bg-surface text-body rounded-2xl rounded-bl-md"
              }`}>
                {msg.image && (
                  <div className="mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.image}
                      alt="Uploaded problem"
                      className="max-w-full max-h-[200px] rounded-lg border border-blue/30"
                    />
                  </div>
                )}
                {msg.role === "assistant" ? (
                  <MathRenderer content={msg.content} className="math-display" />
                ) : (
                  msg.content && <p>{msg.content}</p>
                )}
              </div>
            </div>
            {msg.role === "assistant" && msg.responseTime && (
              <p className="text-[10px] text-muted mt-1 ml-1">
                {(msg.responseTime / 1000).toFixed(1)}s &middot; 100% local
              </p>
            )}
          </div>
        ))}

        {/* Streaming */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-3.5 py-2.5 text-[13px] leading-relaxed bg-surface text-body rounded-2xl rounded-bl-md">
              <MathRenderer content={streaming} className="math-display" />
            </div>
          </div>
        )}

        {isLoading && !streaming && (
          <div className="flex justify-start">
            <div className="px-3.5 py-2.5 text-[13px] text-muted bg-surface rounded-2xl rounded-bl-md flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
              Thinking...
            </div>
          </div>
        )}
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-5 pb-2">
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pendingImage}
              alt="Selected"
              className="h-16 rounded-lg border border-blue/30"
            />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-danger text-white text-xs flex items-center justify-center"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={placeholderText(context)}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-[13px] text-body focus:outline-none focus:border-blue disabled:opacity-50 bg-white"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-muted hover:text-blue transition p-1.5"
            title="Upload photo of a problem"
          >
            <CameraIcon />
          </button>
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && !pendingImage)}
            className="px-3.5 py-2 rounded-lg bg-navy text-white text-[13px] font-medium hover:bg-navy-light disabled:opacity-40 transition"
          >
            Send
          </button>
        </div>
        <p className="text-[10px] text-muted mt-2 text-center">
          Snap a printed problem or type your question &middot; 100% offline &middot; Powered by Gemma 4
        </p>
      </div>
      </>
      )}
    </div>
  );
}
