"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import MathRenderer from "@/components/math-renderer";
import {
  loadProfile,
  saveProfile,
  getTopicProgress,
  markLessonComplete,
  startSession,
  endSession,
  updateStreak,
  incrementExplainDifferently,
} from "@/lib/progress";
import { getBilingual } from "@/components/settings-modal";
import { useAIContext } from "@/components/ai-context";
import type { LearnMessage, StudentProfile, CurriculumTopic } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

export default function LearnPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted text-sm">Loading...</div>}>
      <LearnContent />
    </Suspense>
  );
}

// Separate a beacon message into teaching content vs quick-check question.
// Heuristic: the last paragraph that ends with "?" is the question.
function splitTeachingAndQuestion(content: string): { teaching: string; question: string | null } {
  const paragraphs = content.split(/\n\n+/);
  if (paragraphs.length <= 1) {
    // Check if the single paragraph contains a question
    if (content.includes("?")) {
      // Try to split on the last sentence with "?"
      const lines = content.split(/\n/);
      const qIdx = lines.findLastIndex((l) => l.trim().endsWith("?") || l.includes("Quick Check") || l.includes("**Quick"));
      if (qIdx > 0) {
        return {
          teaching: lines.slice(0, qIdx).join("\n"),
          question: lines.slice(qIdx).join("\n"),
        };
      }
    }
    return { teaching: content, question: null };
  }

  // Look for the question paragraph (contains "?" or "Quick Check")
  const lastIdx = paragraphs.length - 1;
  const lastPara = paragraphs[lastIdx];
  if (lastPara.includes("?") || lastPara.toLowerCase().includes("check")) {
    return {
      teaching: paragraphs.slice(0, lastIdx).join("\n\n"),
      question: lastPara,
    };
  }

  return { teaching: content, question: null };
}

function LearnContent() {
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic") || curriculum.topics[0].id;
  const { setContext } = useAIContext();

  const topic = (curriculum.topics as CurriculumTopic[]).find((t) => t.id === topicId);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [messages, setMessages] = useState<LearnMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lessonComplete, setLessonComplete] = useState(false);
  const [bilingual, setBilingual] = useState(false);
  const [reExplainIdx, setReExplainIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Session tracking
  const sessionIdRef = useRef<string | null>(null);
  const explainDiffCountRef = useRef(0);
  const studentTurnCountRef = useRef(0);

  useEffect(() => {
    setProfile(loadProfile());
    setBilingual(getBilingual());
    updateStreak();
    sessionIdRef.current = startSession("learn", topicId);

    return () => {
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current, {
          questions_attempted: studentTurnCountRef.current,
          questions_correct: 0,
          hints_used: 0,
          explain_differently_used: explainDiffCountRef.current,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const language = profile?.language || "en";
  const progress = profile ? getTopicProgress(profile, topicId) : { mastery: 0, status: "not_started" as const, attempts: 0, last_seen: null, lesson_completed: false, explain_differently_count: 0 };
  const studentTurnCount = messages.filter((m) => m.role === "student").length;
  const beaconTurnCount = messages.filter((m) => m.role === "beacon").length;

  // Keep ref in sync for cleanup
  useEffect(() => {
    studentTurnCountRef.current = studentTurnCount;
  }, [studentTurnCount]);

  // Set AI panel context
  useEffect(() => {
    setContext({
      page: "learn",
      topicId,
      topicTitle: topic?.title.en,
      mastery: progress.mastery,
      step: beaconTurnCount,
    });
  }, [topicId, topic?.title.en, progress.mastery, beaconTurnCount, setContext]);

  const sendToBeacon = useCallback(
    async (history: LearnMessage[]) => {
      setIsLoading(true);
      setStreaming("");

      try {
        const res = await fetch("/api/learn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topicId, language, mastery: progress.mastery, history }),
        });

        if (!res.ok) throw new Error(`API ${res.status}`);

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

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

        if (accumulated.trim()) {
          const isComplete = accumulated.includes("[LESSON_COMPLETE]");
          const cleanContent = accumulated.replace("[LESSON_COMPLETE]", "").trim();
          setMessages((prev) => [...prev, { role: "beacon", content: cleanContent }]);

          if (isComplete && profile) {
            const updated = markLessonComplete(profile, topicId);
            setProfile(updated);
            setLessonComplete(true);

            // End session on lesson complete
            if (sessionIdRef.current) {
              endSession(sessionIdRef.current, {
                questions_attempted: studentTurnCountRef.current,
                questions_correct: 0,
                hints_used: 0,
                explain_differently_used: explainDiffCountRef.current,
              });
              sessionIdRef.current = null;
            }
          }
        }
      } catch (err) {
        console.error("Learn error:", err);
        setMessages((prev) => [
          ...prev,
          { role: "beacon", content: "Something went wrong. Make sure Ollama is running." },
        ]);
      } finally {
        setStreaming("");
        setIsLoading(false);
      }
    },
    [topicId, language, progress.mastery, profile]
  );

  useEffect(() => {
    if (profile && messages.length === 0 && !isLoading) {
      sendToBeacon([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const studentMsg: LearnMessage = { role: "student", content: input.trim() };
    const newHistory = [...messages, studentMsg];
    setMessages(newHistory);
    setInput("");
    sendToBeacon(newHistory);
  };

  const handleLanguageToggle = () => {
    if (!profile) return;
    const newLang = language === "en" ? "zh" : "en";
    const updated = { ...profile, language: newLang as "en" | "zh" };
    setProfile(updated);
    saveProfile(updated);
  };

  const handleManualComplete = () => {
    if (profile) {
      const updated = markLessonComplete(profile, topicId);
      setProfile(updated);
      setLessonComplete(true);

      // End session
      if (sessionIdRef.current) {
        endSession(sessionIdRef.current, {
          questions_attempted: studentTurnCountRef.current,
          questions_correct: 0,
          hints_used: 0,
          explain_differently_used: explainDiffCountRef.current,
        });
        sessionIdRef.current = null;
      }
    }
  };

  const handleReExplain = async (msgIdx: number) => {
    if (isLoading || reExplainIdx !== null) return;
    const originalContent = messages[msgIdx]?.content;
    if (!originalContent) return;
    setReExplainIdx(msgIdx);

    // Track explain differently usage
    explainDiffCountRef.current += 1;
    if (profile) {
      const updated = incrementExplainDifferently(profile, topicId);
      setProfile(updated);
    }

    const reExplainMsg: LearnMessage = {
      role: "student",
      content: "[The student didn't understand. Please explain the same concept in a completely different way. Use a daily life example. Use simpler words. Keep it short.]",
    };
    const newHistory = [...messages, reExplainMsg];
    setMessages(newHistory);
    await sendToBeacon(newHistory);
    setReExplainIdx(null);
  };

  if (!topic) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted">Topic not found.</p>
        <Link href="/subject/math" className="text-blue text-sm mt-2 hover:underline">Back to subject</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Topic header bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-border/60 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/subject/math" className="text-muted hover:text-navy text-sm">&larr; Back</Link>
          <span className="text-border">|</span>
          <span className="text-sm font-medium text-navy">{topic.title[language]}</span>
          {bilingual && (
            <span className="text-xs text-muted">({language === "en" ? topic.title.zh : topic.title.en})</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface text-muted border border-border">
            Step {beaconTurnCount} {beaconTurnCount === 1 ? "" : ""}
          </span>
          <span className="text-xs text-muted">
            Mastery {(progress.mastery * 100).toFixed(0)}%
          </span>
          <button
            onClick={handleLanguageToggle}
            className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted hover:border-blue hover:text-blue transition"
          >
            {language === "en" ? "中文" : "EN"}
          </button>
        </div>
      </div>

      {/* Content area — structured blocks, not chat */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-[720px] space-y-6">
          {messages.map((msg, i) => {
            if (msg.role === "beacon") {
              const { teaching, question } = splitTeachingAndQuestion(msg.content);
              return (
                <div key={i} className="space-y-4">
                  {/* Teaching block */}
                  <div>
                    <p className="text-label uppercase text-muted flex items-center gap-1.5 mb-2">
                      <span className="w-2 h-2 rounded-full bg-blue inline-block" />
                      BEACON IS TEACHING
                    </p>
                    <div className="border-l-2 border-accent pl-5 text-body leading-relaxed math-display">
                      <MathRenderer content={teaching} />
                    </div>
                  </div>

                  {/* Explain differently button — show on most recent beacon message */}
                  {!isLoading && !lessonComplete && i === messages.findLastIndex((m) => m.role === "beacon") && (
                    <button
                      onClick={() => handleReExplain(i)}
                      disabled={reExplainIdx !== null}
                      className="text-[12px] text-muted hover:text-blue border border-border rounded-lg px-3 py-1.5 transition hover:border-blue disabled:opacity-40 mt-1"
                    >
                      Explain differently
                    </button>
                  )}

                  {/* Quick check block */}
                  {question && (
                    <div className="bg-card border border-border/60 rounded-xl px-5 py-4">
                      <p className="text-sm font-semibold text-navy mb-2">Quick check</p>
                      <div className="text-sm text-body math-display">
                        <MathRenderer content={question} />
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Student answer block
            return (
              <div key={i} className="bg-surface border border-border/60 rounded-xl px-5 py-3">
                <p className="text-label uppercase text-muted mb-1">YOUR ANSWER</p>
                <p className="text-sm text-body">{msg.content}</p>
              </div>
            );
          })}

          {/* Streaming */}
          {streaming && (
            <div>
              <p className="text-label uppercase text-muted flex items-center gap-1.5 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue inline-block" />
                BEACON IS TEACHING
              </p>
              <div className="border-l-2 border-accent pl-5 text-body leading-relaxed math-display">
                <MathRenderer content={streaming} />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {isLoading && !streaming && (
            <p className="text-xs text-muted flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
              Generating next step...
            </p>
          )}

          {/* Manual completion fallback */}
          {!lessonComplete && !isLoading && studentTurnCount >= 6 && (
            <div className="text-center py-2">
              <button
                onClick={handleManualComplete}
                className="text-xs px-4 py-2 rounded-lg border border-success text-success hover:bg-success-bg transition"
              >
                Complete lesson
              </button>
            </div>
          )}

          {/* Lesson complete card */}
          {lessonComplete && (
            <div className="bg-success-bg border border-success/20 rounded-xl px-6 py-5 text-center space-y-3">
              <p className="text-lg font-medium text-success">Lesson complete!</p>
              <p className="text-sm text-body">
                You&apos;ve learned <strong>{topic.title.en}</strong>. Ready to practice?
              </p>
              <div className="flex gap-3 justify-center">
                <Link
                  href={`/practice?topic=${topicId}`}
                  className="text-sm px-5 py-2 rounded-lg bg-navy text-white hover:bg-navy-light transition font-medium"
                >
                  Start practice &rarr;
                </Link>
                <Link
                  href="/subject/math"
                  className="text-sm px-5 py-2 rounded-lg border border-border text-muted hover:text-navy transition"
                >
                  Back to subject
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Answer input — structured, not chat-style */}
      {!lessonComplete && (
        <div className="border-t border-border bg-card px-8 py-4 shrink-0">
          <div className="max-w-[720px] flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your answer..."
              disabled={isLoading}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-body focus:outline-none focus:border-blue disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="px-5 py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light disabled:opacity-40 transition"
            >
              Check
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
