"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Maximize2, Minimize2, Lock, Camera, Send } from "lucide-react";
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

// Per codex review: surface that Beacon AI is context-aware, not a generic
// chatbot. Each assistant message gets a small chip noting which signal the
// model was given. Mapping mirrors what /api/assistant actually receives in
// the `context` payload; if those keys change, update both sides.
function sourceContextLabel(ctx: AIContext): string {
  switch (ctx.page) {
    case "learn":
      return ctx.topicTitle ? `Using current lesson: ${ctx.topicTitle}` : "Using current lesson context";
    case "practice":
      return "Using current question context";
    case "home":
      return "Using your progress context";
    default:
      return "Using general context";
  }
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
      {/* Header — figma px-6 py-5 spacing, status indicator front-and-center
          (the "Gemma running locally" line is the Ollama-track headline). */}
      <div className="px-6 py-5 border-b shrink-0" style={{ borderColor: "#E2E5EA" }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* H1: more prominent status — pulsing dot when ok, muted when
                  unreachable. The aria-label calls out the offline-ness
                  explicitly so SR users get the same signal. */}
              <span className="relative flex w-2.5 h-2.5">
                {ollamaOk && (
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{ backgroundColor: "#059669", opacity: 0.4 }}
                    aria-hidden="true"
                  />
                )}
                <span
                  className="relative w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: ollamaOk ? "#059669" : "#9CA3AF" }}
                  role="status"
                  aria-label={ollamaOk ? "Gemma running locally" : "Gemma not reachable"}
                />
              </span>
              <span style={{ color: "#0F2A4A", fontSize: "14px", fontWeight: 500 }}>
                Beacon AI
              </span>
            </div>
            <span style={{ color: "#6B7280", fontSize: "12px" }}>
              {ollamaOk ? "Gemma running locally" : "Offline · Gemma not reachable"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-gray-50"
              title="New chat"
            >
              <Plus size={14} style={{ color: "#2563EB" }} aria-hidden="true" />
              <span style={{ color: "#2563EB", fontSize: "13px" }}>New chat</span>
            </button>
            <button
              onClick={() => toggleExpand("panel")}
              className="p-2 rounded-lg transition-colors hover:bg-gray-50"
              title={isExpanded ? "Exit focus mode" : "Focus mode"}
              aria-label={isExpanded ? "Exit focus mode" : "Focus mode"}
            >
              {isExpanded ? (
                <Minimize2 size={16} style={{ color: "#6B7280" }} aria-hidden="true" />
              ) : (
                <Maximize2 size={16} style={{ color: "#6B7280" }} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Context line + mode pills — figma renders these as a separate
            section under the header; we keep them tight inside the header
            block to preserve scrollable area for chat. */}
        <div style={{ color: "#6B7280", fontSize: "12px", marginBottom: "12px" }} className="truncate">
          {contextLabel(context)}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("guided")}
            className="rounded-lg transition-colors"
            style={{
              backgroundColor: mode === "guided" ? "#2563EB" : "transparent",
              color: mode === "guided" ? "#FFFFFF" : "#6B7280",
              border: mode === "guided" ? "none" : "1px solid #E2E5EA",
              fontSize: "13px",
              padding: "6px 14px",
            }}
            aria-pressed={mode === "guided"}
          >
            Guided
          </button>
          <button
            onClick={() => setMode("explain")}
            className="rounded-lg transition-colors"
            style={{
              backgroundColor: mode === "explain" ? "#2563EB" : "transparent",
              color: mode === "explain" ? "#FFFFFF" : "#6B7280",
              border: mode === "explain" ? "none" : "1px solid #E2E5EA",
              fontSize: "13px",
              padding: "6px 14px",
            }}
            aria-pressed={mode === "explain"}
          >
            Explain
          </button>
        </div>
      </div>

      {quizActive ? (
        // Quiz lock card — figma 🔒 + 🍀. Lock icon + bold "Quiz in progress"
        // headline so the pause state reads as deliberate, not broken.
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
            style={{ backgroundColor: "#F5F6F8" }}
            aria-hidden="true"
          >
            <Lock size={32} style={{ color: "#9CA3AF" }} />
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 500, color: "#1F2937", marginBottom: "12px" }}>
            Quiz in progress
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "#6B7280",
              lineHeight: 1.6,
              maxWidth: "280px",
              marginBottom: "8px",
            }}
          >
            The AI assistant is paused while you take the quiz. You&apos;ll get detailed feedback when you&apos;re done.
          </p>
          <p style={{ fontSize: "13px", color: "#6B7280" }}>Good luck! 🍀</p>
        </div>
      ) : (
      <>
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4">

        {/* Empty state — H3 hero line + LLM-driven suggestion bubbles
            (single column per figma; we keep our /api/suggestions feed). */}
        {showSuggestions && (
          <div className="flex flex-col">
            <p
              style={{
                fontSize: "13px",
                color: "#1F2937",
                fontWeight: 500,
                marginBottom: "4px",
              }}
            >
              Beacon AI · Local · Multilingual · Always available
            </p>
            <p style={{ fontSize: "13px", color: "#6B7280", marginBottom: "16px" }}>
              Ask me anything about what you&apos;re learning.
            </p>
            <div className="space-y-3">
              {suggestionsLoading ? (
                <>
                  {[1, 2, 3, 4].map((n) => (
                    <div
                      key={n}
                      className="rounded-xl px-4 py-3 animate-pulse"
                      style={{ backgroundColor: "#F5F6F8" }}
                    >
                      <div className="h-4 w-[80%] rounded" style={{ backgroundColor: "#E2E5EA" }} />
                    </div>
                  ))}
                </>
              ) : (
                suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(s)}
                    className="w-full text-left rounded-xl transition-all hover:border-blue-500"
                    style={{
                      backgroundColor: "#F5F6F8",
                      border: "1px solid transparent",
                      fontSize: "13px",
                      color: "#1F2937",
                      lineHeight: 1.5,
                      padding: "12px 16px",
                    }}
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
              <div
                className="px-4 py-3 leading-relaxed"
                style={{
                  maxWidth: "85%",
                  fontSize: "14px",
                  backgroundColor: msg.role === "user" ? "#0F2A4A" : "#F5F6F8",
                  color: msg.role === "user" ? "#FFFFFF" : "#1F2937",
                  borderRadius: msg.role === "user" ? "12px 12px 0 12px" : "12px 12px 12px 0",
                }}
              >
                {msg.image && (
                  <div className="mb-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={msg.image}
                      alt="Uploaded problem"
                      className="max-w-full max-h-[200px] rounded-lg"
                      style={{ border: "1px solid rgba(37, 99, 235, 0.3)" }}
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
            {/* H2 + codex add: assistant messages get a context chip on the
                left (Beacon-aware framing) and a response-time chip on the
                right (offline-speed framing). Both are decorative. */}
            {msg.role === "assistant" && (
              <div className="flex items-center justify-between gap-2 mt-1.5 ml-1 mr-1 flex-wrap">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "#EFF6FF",
                    color: "#2563EB",
                    fontSize: "10px",
                    fontWeight: 500,
                  }}
                >
                  {sourceContextLabel(context)}
                </span>
                {msg.responseTime && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "#ECFDF5",
                      color: "#059669",
                      fontSize: "10px",
                      fontWeight: 500,
                    }}
                  >
                    {(msg.responseTime / 1000).toFixed(1)}s · 100% local
                  </span>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Streaming — assistant bubble with the partial response so far */}
        {streaming && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 leading-relaxed"
              style={{
                maxWidth: "85%",
                fontSize: "14px",
                backgroundColor: "#F5F6F8",
                color: "#1F2937",
                borderRadius: "12px 12px 12px 0",
              }}
            >
              <MathRenderer content={streaming} className="math-display" />
            </div>
          </div>
        )}

        {/* Pre-stream wait state — explicit "Gemma is responding" framing
            instead of generic "Thinking..." so the local-model story is
            consistent with the rest of the chrome. */}
        {isLoading && !streaming && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{
                fontSize: "13px",
                color: "#6B7280",
                backgroundColor: "#F5F6F8",
                borderRadius: "12px 12px 12px 0",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: "#D97706" }}
                aria-hidden="true"
              />
              Gemma is responding…
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

      {/* Input area — figma px-6 py-5 spacing, lucide Send + Camera icons.
          Camera button keeps a "Snap a problem" tooltip + an inline label
          on hover; the bigger affordance comes from the icon size. */}
      <div className="border-t shrink-0" style={{ borderColor: "#E2E5EA", padding: "20px 24px" }}>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder={placeholderText(context)}
            disabled={isLoading}
            className="flex-1 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            style={{
              borderColor: "#E2E5EA",
              backgroundColor: "#FFFFFF",
              fontSize: "14px",
              padding: "12px 16px",
            }}
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
            className="rounded-lg transition-colors hover:bg-gray-50"
            style={{ border: "1px solid #E2E5EA", padding: "12px" }}
            title="Snap a problem (Gemma vision)"
            aria-label="Upload photo of a problem"
          >
            <Camera size={20} style={{ color: "#6B7280" }} aria-hidden="true" />
          </button>
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && !pendingImage)}
            className="rounded-lg transition-colors disabled:cursor-not-allowed"
            style={{
              backgroundColor: isLoading || (!input.trim() && !pendingImage) ? "#E2E5EA" : "#0F2A4A",
              color: "#FFFFFF",
              padding: "12px 20px",
            }}
            aria-label="Send message"
          >
            <Send size={18} aria-hidden="true" />
          </button>
        </div>
        {/* H4 + framing footer: name every part of the value prop (snap
            a problem via the Camera button above, type a question, 100%
            offline, the model). Codex review preferred icon + text over
            inline emoji for consistency with the rest of the panel chrome
            — the visible Camera icon button to the left already does the
            "snap" affordance, so the footer is plain prose. */}
        <p style={{ fontSize: "11px", color: "#9CA3AF", lineHeight: 1.5 }}>
          Snap a printed problem or type your question · 100% offline · Powered by Gemma
        </p>
      </div>
      </>
      )}
    </div>
  );
}
