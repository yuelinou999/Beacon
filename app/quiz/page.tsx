"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAllTopics } from "@/lib/curriculum";
import { loadProfile } from "@/lib/progress";
import { resolveActiveStudyTarget } from "@/lib/active-target";
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
  if (!topic.quiz) {
    return <FallbackCard heading="Quiz not yet available" body={`The quiz for ${topic.title.en} hasn't been written yet. Check back soon.`} />;
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