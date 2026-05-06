"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Sparkles,
} from "lucide-react";
import type {
  QuizBank,
  QuizSkill,
  TopicWithPhases,
} from "@/lib/curriculum-types";
import type { QuizAttempt } from "@/lib/types";
import { loadProfile, recordQuizAttempt } from "@/lib/progress";

interface ResultsPhaseProps {
  attempt: QuizAttempt;
  quiz: QuizBank;
  topic: TopicWithPhases;
  onBack: () => void;
  onRetake: () => void;
  onMoveToNext: () => void;
}

const SKILL_LABEL: Record<QuizSkill, string> = {
  setting_up: "Setting up",
  inverse_ops: "Inverse operations",
  simplification: "Simplification",
  verification: "Verification",
};

function getScoreBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Excellent!", color: "#059669" };
  if (score >= 60) return { label: "Good progress!", color: "#2563EB" };
  if (score >= 40) return { label: "Getting there!", color: "#D97706" };
  return { label: "Keep practicing!", color: "#D97706" };
}

export default function ResultsPhaseView({
  attempt,
  quiz,
  topic,
  onBack,
  onRetake,
  onMoveToNext,
}: ResultsPhaseProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(true);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Persist on mount. recordQuizAttempt is idempotent on attempt_id, so
  // Strict Mode double-mount or a refresh of the results page is a no-op.
  useEffect(() => {
    const profile = loadProfile();
    recordQuizAttempt(profile, attempt);
  }, [attempt]);

  useEffect(() => {
    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysis(null);
    setAnalysisError(null);
    fetch("/api/quiz/take", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attempt,
        topicTitle: topic.title.en,
        questions: quiz.questions,
      }),
    })
      .then((res) => res.json())
      .then((data: { analysis: string | null; error?: string }) => {
        if (cancelled) return;
        if (data.analysis) {
          setAnalysis(data.analysis);
        } else {
          setAnalysisError(data.error || "unknown");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAnalysisError("network");
      })
      .finally(() => {
        if (cancelled) return;
        setAnalysisLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, topic.title.en, quiz.questions]);

  const scorePct = (attempt.score / attempt.total) * 100;
  const isPerfect = attempt.score === attempt.total;
  const band = getScoreBand(scorePct);

  const skillStats = useMemo(() => {
    const init: Record<QuizSkill, { correct: number; total: number }> = {
      setting_up: { correct: 0, total: 0 },
      inverse_ops: { correct: 0, total: 0 },
      simplification: { correct: 0, total: 0 },
      verification: { correct: 0, total: 0 },
    };
    for (const ans of attempt.answers) {
      const q = quiz.questions.find((qq) => qq.id === ans.question_id);
      if (!q) continue;
      init[q.skill].total += 1;
      if (ans.correct) init[q.skill].correct += 1;
    }
    return init;
  }, [attempt, quiz]);

  const skillEntries = (Object.keys(skillStats) as QuizSkill[]).filter(
    (s) => skillStats[s].total > 0,
  );

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      <button
        onClick={onBack}
        className="flex items-center gap-2 transition-colors hover:opacity-70 mb-8"
        style={{ color: "#2563EB" }}
      >
        <ChevronLeft size={16} />
        <span style={{ fontSize: "14px" }}>Back to course</span>
      </button>

      {/* Score Hero */}
      <div
        className="rounded-xl p-10 mb-8 text-center"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="relative inline-block mb-6">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke="#E2E5EA"
              strokeWidth="12"
            />
            <circle
              cx="80"
              cy="80"
              r="70"
              fill="none"
              stroke={band.color}
              strokeWidth="12"
              strokeDasharray={`${(scorePct / 100) * 440} 440`}
              strokeLinecap="round"
              transform="rotate(-90 80 80)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div style={{ fontSize: "32px", fontWeight: 500, color: "#0F2A4A" }}>
              {attempt.score}/{attempt.total}
            </div>
            <div style={{ fontSize: "14px", color: "#6B7280" }}>
              {Math.round(scorePct)}% correct
            </div>
          </div>
        </div>

        <h2
          style={{
            fontSize: "24px",
            fontWeight: 500,
            color: band.color,
            marginBottom: "32px",
          }}
        >
          {isPerfect ? "Perfect score!" : band.label}
        </h2>

        {isPerfect && (
          <p
            style={{
              fontSize: "15px",
              color: "#1F2937",
              lineHeight: 1.7,
              marginBottom: "24px",
            }}
          >
            You answered all {attempt.total} questions correctly. Your understanding of {topic.title.en.toLowerCase()} is solid.
          </p>
        )}
      </div>

      {/* Skill Breakdown */}
      <div
        className="rounded-xl p-8 mb-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <h3
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#6B7280",
            marginBottom: "20px",
            letterSpacing: "0.5px",
          }}
        >
          HOW YOU DID BY SKILL AREA
        </h3>

        <div className="space-y-4">
          {skillEntries.map((skill) => {
            const data = skillStats[skill];
            const percentage = (data.correct / data.total) * 100;
            const skillIsPerfect = data.correct === data.total;
            const barColor = skillIsPerfect
              ? "#059669"
              : percentage >= 50
                ? "#D97706"
                : "#EF4444";
            return (
              <div key={skill}>
                <div className="flex items-center justify-between mb-2">
                  <span style={{ fontSize: "14px", color: "#1F2937" }}>
                    {SKILL_LABEL[skill]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "14px", color: "#6B7280" }}>
                      {data.correct}/{data.total}
                    </span>
                    {skillIsPerfect && (
                      <Check size={16} style={{ color: "#059669" }} />
                    )}
                  </div>
                </div>
                <div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: "#E2E5EA" }}
                >
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      backgroundColor: barColor,
                      width: `${percentage}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Analysis */}
      <div
        className="rounded-xl p-8 mb-8"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E2E5EA",
          borderLeft: "3px solid #2563EB",
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={14} style={{ color: "#2563EB" }} />
          <span
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: "#2563EB",
              letterSpacing: "0.5px",
            }}
          >
            BEACON&apos;S TAKE
          </span>
        </div>

        {analysisLoading && (
          <p
            style={{
              fontSize: "15px",
              color: "#9CA3AF",
              lineHeight: 1.7,
              marginBottom: "12px",
            }}
          >
            Beacon is thinking&hellip;
          </p>
        )}

        {!analysisLoading && analysis && (
          <p
            style={{
              fontSize: "15px",
              color: "#1F2937",
              lineHeight: 1.7,
              marginBottom: "12px",
            }}
          >
            {analysis}
          </p>
        )}

        {!analysisLoading && !analysis && analysisError && (
          <p
            style={{
              fontSize: "15px",
              color: "#1F2937",
              lineHeight: 1.7,
              marginBottom: "12px",
            }}
          >
            Beacon&apos;s analysis couldn&apos;t load this time. You scored {attempt.score}/{attempt.total} — review the question-by-question breakdown below.
          </p>
        )}

        <p style={{ fontSize: "11px", color: "#9CA3AF" }}>
          This analysis has been added to your Dashboard portrait.
        </p>
      </div>

      {/* Question by Question */}
      <div
        className="rounded-xl p-8 mb-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <h3
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: "#6B7280",
            marginBottom: "20px",
            letterSpacing: "0.5px",
          }}
        >
          QUESTION BY QUESTION
        </h3>

        <div className="space-y-2">
          {quiz.questions.map((q, idx) => {
            const ans = attempt.answers.find((a) => a.question_id === q.id);
            const isCorrect = !!ans?.correct;
            const isExpanded = expandedQuestion === q.id;
            const substituted = q.equation.replace(/x/g, q.answer.toString());

            return (
              <div key={q.id}>
                <button
                  onClick={() =>
                    setExpandedQuestion(isExpanded ? null : q.id)
                  }
                  className="w-full flex items-center justify-between p-4 rounded-lg border transition-colors hover:border-blue-500"
                  style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        backgroundColor: isCorrect ? "#ECFDF5" : "#FFFBEB",
                      }}
                    >
                      {isCorrect ? (
                        <Check size={14} style={{ color: "#059669" }} />
                      ) : (
                        <X size={14} style={{ color: "#D97706" }} />
                      )}
                    </div>
                    <span
                      className="text-left"
                      style={{ fontSize: "14px", color: "#1F2937" }}
                    >
                      Q{idx + 1}: {q.question}
                    </span>
                  </div>
                  {isExpanded ? (
                    <ChevronUp size={16} style={{ color: "#6B7280" }} />
                  ) : (
                    <ChevronDown size={16} style={{ color: "#6B7280" }} />
                  )}
                </button>

                {isExpanded && (
                  <div
                    className="p-5 mt-2 rounded-lg"
                    style={{ backgroundColor: "#F5F6F8" }}
                  >
                    <div
                      className="rounded-lg p-6 mb-4 text-center"
                      style={{ backgroundColor: "#FFFFFF" }}
                    >
                      <div
                        style={{
                          fontSize: "20px",
                          color: "#0F2A4A",
                          fontFamily: "serif",
                          fontStyle: "italic",
                        }}
                      >
                        {q.equation}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <span style={{ fontSize: "13px", color: "#6B7280" }}>
                          Your answer:{" "}
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            color: isCorrect ? "#059669" : "#D97706",
                            fontWeight: 500,
                            textDecoration: isCorrect ? "none" : "line-through",
                          }}
                        >
                          {ans?.student_answer
                            ? `x = ${ans.student_answer}`
                            : "(no answer)"}
                        </span>
                      </div>

                      {!isCorrect && (
                        <>
                          <div>
                            <span style={{ fontSize: "13px", color: "#6B7280" }}>
                              Correct answer:{" "}
                            </span>
                            <span
                              style={{
                                fontSize: "14px",
                                color: "#059669",
                                fontWeight: 500,
                              }}
                            >
                              x = {q.answer}
                            </span>
                          </div>
                          <p
                            style={{
                              fontSize: "14px",
                              color: "#1F2937",
                              lineHeight: 1.6,
                            }}
                          >
                            Check your arithmetic. {substituted}.
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        {!isPerfect && (
          <Link
            href="/review"
            className="flex-1 px-8 py-4 rounded-lg text-center transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "#0F2A4A",
              color: "#FFFFFF",
              fontSize: "15px",
              textDecoration: "none",
            }}
          >
            Review your mistakes &rarr;
          </Link>
        )}
        <button
          onClick={isPerfect ? onMoveToNext : onRetake}
          className="flex-1 px-8 py-4 rounded-lg border transition-colors hover:border-blue-500"
          style={{
            borderColor: "#E2E5EA",
            color: "#1F2937",
            fontSize: "15px",
          }}
        >
          {isPerfect ? "Move to next unit →" : "Retake quiz →"}
        </button>
      </div>
      {!isPerfect && (
        <p
          className="mt-2 text-center"
          style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}
        >
          Your mistakes are saved to Review automatically.
        </p>
      )}
      <div className="mt-4 text-center">
        <button
          onClick={onBack}
          className="transition-colors hover:underline"
          style={{ fontSize: "14px", color: "#6B7280" }}
        >
          Back to course
        </button>
      </div>
    </div>
  );
}
