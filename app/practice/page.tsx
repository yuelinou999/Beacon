"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import MathRenderer from "@/components/math-renderer";
import { getBilingual } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { useAIContext } from "@/components/ai-context";
import {
  loadProfile,
  getTopicProgress,
  updateMasteryAfterPractice,
  getDifficulty,
  startSession,
  endSession,
  updateStreak,
} from "@/lib/progress";
import type { StudentProfile, CurriculumTopic, PracticeQuestion, GradeResult } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

type PracticeState = "loading" | "question" | "grading" | "result" | "error";

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-muted text-sm">Loading...</div>}>
      <PracticeContent />
    </Suspense>
  );
}

function PracticeContent() {
  const searchParams = useSearchParams();
  const topicId = searchParams.get("topic") || curriculum.topics[0].id;
  const { setContext } = useAIContext();

  const topic = (curriculum.topics as CurriculumTopic[]).find((t) => t.id === topicId);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [state, setState] = useState<PracticeState>("loading");
  const [quiz, setQuiz] = useState<PracticeQuestion | null>(null);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [questionsAnswered, setQuestionsAnswered] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [bilingual, setBilingual] = useState(false);

  // Timing
  const questionStartRef = useRef<number>(0);
  // Session tracking
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    setProfile(loadProfile());
    setBilingual(getBilingual());
    updateStreak();
    sessionIdRef.current = startSession("practice", topicId);

    return () => {
      // End session on unmount
      if (sessionIdRef.current) {
        // Read latest counts from refs isn't possible with state,
        // so we end with what we have via the closure
        endSession(sessionIdRef.current, {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Same-tab settings refresh: kept separate from the mount effect above so
  // toggling bilingual mid-practice doesn't restart the session timer.
  useEffect(() => {
    const refresh = () => setBilingual(getBilingual());
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  // End session with final stats when leaving
  const endSessionWithStats = useCallback(() => {
    if (sessionIdRef.current) {
      endSession(sessionIdRef.current, {
        questions_attempted: questionsAnswered,
        questions_correct: correctCount,
        hints_used: 0,
        explain_differently_used: 0,
      });
      sessionIdRef.current = null;
    }
  }, [questionsAnswered, correctCount]);

  // Update session stats periodically (on each result)
  useEffect(() => {
    if (state === "result" && sessionIdRef.current) {
      // Update session in-place with latest stats
      endSession(sessionIdRef.current, {
        questions_attempted: questionsAnswered,
        questions_correct: correctCount,
        hints_used: 0,
        explain_differently_used: 0,
      });
      // Re-start the session timer for continued practice
      sessionIdRef.current = startSession("practice", topicId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endSessionWithStats();
    };
  }, [endSessionWithStats]);

  const language = profile?.language || "en";
  const progress = profile ? getTopicProgress(profile, topicId) : { mastery: 0, status: "not_started" as const, attempts: 0, last_seen: null, lesson_completed: false, explain_differently_count: 0 };

  // Set AI panel context
  useEffect(() => {
    setContext({
      page: "practice",
      topicId,
      topicTitle: topic?.title.en,
      mastery: progress.mastery,
      correctCount,
      questionsAnswered,
    });
  }, [topicId, topic?.title.en, progress.mastery, correctCount, questionsAnswered, setContext]);

  const generateQuiz = useCallback(async () => {
    if (!topic || !profile) return;
    setState("loading");
    setError("");
    setGrade(null);
    setAnswer("");

    try {
      const res = await fetch("/api/practice?action=generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          topicTitle: topic.title[language],
          language,
          mastery: getTopicProgress(profile, topicId).mastery,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `API ${res.status}`);
      }

      const data: PracticeQuestion = await res.json();
      setQuiz(data);
      setState("question");
      // Start timing when question is displayed
      questionStartRef.current = Date.now();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate quiz");
      setState("error");
    }
  }, [topic, profile, topicId, language]);

  useEffect(() => {
    if (profile && state === "loading") {
      generateQuiz();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const submitAnswer = async () => {
    if (!answer.trim() || !quiz || !topic || !profile) return;
    setState("grading");

    // Calculate time spent on this question
    const timeSeconds = questionStartRef.current > 0
      ? (Date.now() - questionStartRef.current) / 1000
      : 0;

    try {
      const res = await fetch("/api/practice?action=grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId,
          topicTitle: topic.title[language],
          language,
          question: quiz.question,
          correctAnswer: quiz.correct_answer,
          studentAnswer: answer.trim(),
          timeSeconds,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);

      const data: GradeResult = await res.json();
      setGrade(data);
      setState("result");
      setQuestionsAnswered((n) => n + 1);
      if (data.correct) setCorrectCount((n) => n + 1);

      const updated = updateMasteryAfterPractice(
        profile,
        topicId,
        data.correct,
        quiz.question,
        answer.trim(),
        data.correct_answer,
        data.error_type,
        data.explanation,
        timeSeconds
      );
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grade answer");
      setState("error");
    }
  };

  if (!topic) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className="text-muted">Topic not found.</p>
        <Link href="/subject/math" className="text-blue text-sm mt-2 hover:underline">Back to subject</Link>
      </div>
    );
  }

  const difficulty = getDifficulty(progress.mastery);

  return (
    <div className="flex flex-col h-full">
      {/* Topic header */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-border/60 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/subject/math" className="text-muted hover:text-navy text-sm">&larr; Back</Link>
          <span className="text-border">|</span>
          <span className="text-sm font-medium text-navy">{topic.title[language]}</span>
          {bilingual && (
            <span className="text-xs text-muted">({language === "en" ? topic.title.zh : topic.title.en})</span>
          )}
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-surface text-muted border border-border">
            Practice
          </span>
        </div>
        <div className="flex items-center gap-4">
          {questionsAnswered > 0 && (
            <span className="text-xs text-muted">
              {correctCount} correct of {questionsAnswered}
            </span>
          )}
          <span className="text-xs text-muted">
            Mastery {(progress.mastery * 100).toFixed(0)}%
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-surface text-muted border border-border">
            {difficulty}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-[720px] space-y-6">

          {/* Loading */}
          {state === "loading" && (
            <p className="text-xs text-muted flex items-center gap-1.5 py-12">
              <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
              Generating quiz...
            </p>
          )}

          {/* Question card */}
          {(state === "question" || state === "grading") && quiz && (
            <>
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5">
                <p className="text-label uppercase text-muted mb-3">Question {questionsAnswered + 1}</p>
                <div className="text-body math-display">
                  <MathRenderer content={quiz.question} />
                </div>
              </div>

              {/* Answer input */}
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5 space-y-3">
                <p className="text-label uppercase text-muted">Your answer</p>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                  placeholder="Type your answer..."
                  disabled={state === "grading"}
                  className="w-full rounded-lg border border-border px-4 py-2.5 text-sm text-body focus:outline-none focus:border-blue disabled:opacity-50"
                />
                <button
                  onClick={submitAnswer}
                  disabled={state === "grading" || !answer.trim()}
                  className="w-full py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light disabled:opacity-40 transition"
                >
                  {state === "grading" ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-warning inline-block animate-pulse" />
                      Grading answer...
                    </span>
                  ) : "Submit answer"}
                </button>
              </div>
            </>
          )}

          {/* Result */}
          {state === "result" && grade && quiz && (
            <>
              {/* Question (read-only) */}
              <div className="bg-card border border-border/60 rounded-xl px-6 py-5">
                <p className="text-label uppercase text-muted mb-3">Question {questionsAnswered}</p>
                <div className="text-body math-display">
                  <MathRenderer content={quiz.question} />
                </div>
              </div>

              {/* Result card */}
              <div className={`rounded-xl px-6 py-5 ${
                grade.correct ? "bg-success-bg border border-success/20" : "bg-danger-bg border border-danger/20"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-lg ${grade.correct ? "text-success" : "text-danger"}`}>
                    {grade.correct ? "\u2713" : "\u2717"}
                  </span>
                  <p className={`text-sm font-semibold ${grade.correct ? "text-success" : "text-danger"}`}>
                    {grade.correct ? "Correct!" : "Incorrect"}
                  </p>
                </div>
                <p className="text-xs text-muted mb-2">Your answer: {answer}</p>
                <div className="text-sm text-body math-display">
                  <MathRenderer content={grade.explanation} />
                </div>
              </div>

              {/* Mastery change indicator */}
              <p className="text-xs text-muted text-center">
                Mastery updated to {(progress.mastery * 100).toFixed(0)}%
              </p>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={generateQuiz}
                  className="flex-1 py-2.5 rounded-lg bg-navy text-white text-sm font-medium hover:bg-navy-light transition"
                >
                  Next question
                </button>
                <Link
                  href="/subject/math"
                  className="px-5 py-2.5 rounded-lg border border-border text-muted text-sm hover:text-navy hover:border-navy transition text-center"
                >
                  Done
                </Link>
              </div>
            </>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-danger">{error}</p>
              <button
                onClick={generateQuiz}
                className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-navy transition"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
