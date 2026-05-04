"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAllTopics, getUnitForTopic } from "@/lib/curriculum";
import { loadProfile } from "@/lib/progress";
import { resolveActiveStudyTarget } from "@/lib/active-target";

// The currently-authored quiz target. Topics without a quiz bank route
// the "Try the demo quiz →" CTA here. Single-constant lookup is honest
// while only one quiz is authored — when more banks ship, derive
// dynamically (first topic with a quiz, etc.).
const DEMO_QUIZ_TOPIC_ID = "solving_one_step";
const DEMO_QUIZ_LABEL = "Solving Equations";
import type { QuizAttempt } from "@/lib/types";
import { useAIContext } from "@/components/ai-context";
import StartPhaseView from "./_components/start-phase";
import InProgressPhaseView from "./_components/in-progress-phase";
import ResultsPhaseView from "./_components/results-phase";

type QuizState = "start" | "in-progress" | "results";

export default function QuizPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted text-sm">Loading...</div>}>
      <QuizContent />
    </Suspense>
  );
}

function QuizContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Honor an explicit ?topic= when present; otherwise fall back to the
  // student's active study target (same source of truth as Learn /
  // Practice / Home Continue). The "Pick a topic" fallback card below
  // is now reserved for the genuine "no active target" case (curriculum
  // has no topics at all — won't happen in practice).
  const requestedTopicId = searchParams.get("topic") ?? "";
  const topicId =
    requestedTopicId ||
    (typeof window !== "undefined"
      ? resolveActiveStudyTarget(loadProfile()).topicId
      : "");
  const { setContext, setQuizActive } = useAIContext();

  const topic = getAllTopics().find((t) => t.id === topicId);

  const [quizState, setQuizState] = useState<QuizState>("start");
  const [completedAttempt, setCompletedAttempt] = useState<QuizAttempt | null>(null);

  useEffect(() => {
    setContext({ page: "quiz" });
  }, [setContext]);

  // Pause the AI panel from the moment the user lands on /quiz, not just
  // once they hit "Start quiz". The pre-quiz info card already promises
  // "The AI assistant is paused during the quiz" and the figma reference
  // shows the locked state alongside the start screen — so the start phase
  // counts as "during the quiz" for AI-pause purposes.
  // Results phase unpauses: post-quiz reflection (asking why a question
  // was wrong) is exactly what we want the AI panel available for.
  useEffect(() => {
    setQuizActive(quizState !== "results");
    return () => setQuizActive(false);
  }, [quizState, setQuizActive]);

  // ── No topic in URL ─────────────────────────────────────
  if (!topicId) {
    return <FallbackCard heading="Pick a topic to start a quiz" body="Quizzes are scoped to a single topic. Open a topic from the course catalog to start its quiz." />;
  }

  // ── Topic id not in curriculum ──────────────────────────
  if (!topic) {
    return <FallbackCard heading="Quiz not found" body={`No topic with id ${topicId} exists in the curriculum.`} />;
  }

  // ── Topic exists but no quiz bank yet ───────────────────
  // Polished "no quiz" shell — same visual language as /learn-v2's stub
  // shell (medallion + h2 + unit subtitle + honest copy + demo CTA +
  // back link). The student arrives here when they URL-navigate to
  // /quiz?topic=<topic-without-quiz>; sidebar Quiz already falls back
  // to a topic that has a quiz, so this branch is the manual-URL
  // safety net. CTA links: Try the demo quiz, Practice this topic
  // (Practice has banks for all 7 unit_6 topics — won't dead-end),
  // Back to course catalog.
  if (!topic.quiz) {
    const parentUnit = getUnitForTopic(topic.id);
    const unitName = parentUnit?.title ?? "Mathematics";
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-12">
          <Link
            href="/subject/math"
            className="inline-flex items-center gap-2 mb-10 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course catalog</span>
          </Link>

          <div className="text-center">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl mb-6 mx-auto"
              style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
              aria-hidden="true"
            >
              {"∑"}
            </div>
            <h1
              style={{
                fontSize: "26px",
                fontWeight: 500,
                color: "#0F2A4A",
                marginBottom: "6px",
                lineHeight: 1.3,
              }}
            >
              {topic.title.en}
            </h1>
            <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "32px" }}>
              Mathematics &middot; {unitName}
            </p>

            <p
              style={{
                fontSize: "15px",
                color: "#1F2937",
                lineHeight: 1.7,
                marginBottom: "8px",
              }}
            >
              No quiz authored for this topic yet.
            </p>
            <p
              style={{
                fontSize: "14px",
                color: "#6B7280",
                lineHeight: 1.7,
                marginBottom: "32px",
                maxWidth: "440px",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              We&rsquo;ve authored{" "}
              <strong style={{ color: "#1F2937" }}>{DEMO_QUIZ_LABEL}</strong>{" "}
              as the demo quiz target — try that, or keep practicing this
              topic to lock it in.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href={`/quiz?topic=${DEMO_QUIZ_TOPIC_ID}`}
                className="rounded-lg transition-opacity hover:opacity-90"
                style={{
                  fontSize: "14px",
                  padding: "10px 24px",
                  color: "#FFFFFF",
                  backgroundColor: "#0F2A4A",
                  textDecoration: "none",
                }}
              >
                Try {DEMO_QUIZ_LABEL} Quiz &rarr;
              </Link>
              <Link
                href={`/practice?topic=${topic.id}`}
                className="rounded-lg transition-colors hover:border-blue-500"
                style={{
                  fontSize: "14px",
                  padding: "10px 24px",
                  color: "#1F2937",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #E2E5EA",
                  textDecoration: "none",
                }}
              >
                Practice this topic &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {quizState === "start" && (
        <StartPhaseView
          quiz={topic.quiz}
          topic={topic}
          onStart={() => setQuizState("in-progress")}
        />
      )}
      {quizState === "in-progress" && topic.quiz && (
        <InProgressPhaseView
          quiz={topic.quiz}
          topic={topic}
          onComplete={(attempt) => {
            setCompletedAttempt(attempt);
            setQuizState("results");
          }}
          onExit={() => setQuizState("start")}
        />
      )}
      {quizState === "results" && completedAttempt && topic.quiz && (
        <ResultsPhaseView
          attempt={completedAttempt}
          quiz={topic.quiz}
          topic={topic}
          onBack={() => {
            setQuizState("start");
            setCompletedAttempt(null);
          }}
          onRetake={() => {
            setQuizState("in-progress");
            setCompletedAttempt(null);
          }}
          onMoveToNext={() => {
            router.push("/subject/math");
          }}
        />
      )}
    </>
  );
}

function FallbackCard({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      <Link
        href="/subject/math"
        className="flex items-center gap-2 transition-colors hover:opacity-70 mb-8"
        style={{ color: "#2563EB" }}
      >
        <ChevronLeft size={16} />
        <span style={{ fontSize: "14px" }}>Back to course</span>
      </Link>
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <h2 style={{ fontSize: "20px", fontWeight: 500, color: "#0F2A4A", marginBottom: "12px" }}>
          {heading}
        </h2>
        <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>{body}</p>
      </div>
    </div>
  );
}