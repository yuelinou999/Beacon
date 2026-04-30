"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Clock } from "lucide-react";
import type { QuizBank, TopicWithPhases } from "@/lib/curriculum-types";
import type { QuizAttempt, QuizAttemptAnswer } from "@/lib/types";

interface InProgressPhaseProps {
  quiz: QuizBank;
  topic: TopicWithPhases;
  onComplete: (attempt: QuizAttempt) => void;
  onExit: () => void;
}

function formatTime(s: number): string {
  const mins = Math.floor(s / 60).toString().padStart(2, "0");
  const secs = (s % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export default function InProgressPhaseView({
  quiz,
  topic,
  onComplete,
  onExit,
}: InProgressPhaseProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<QuizAttemptAnswer[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [startedAt] = useState<string>(() => new Date().toISOString());
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (submitTimeoutRef.current) {
        clearTimeout(submitTimeoutRef.current);
        submitTimeoutRef.current = null;
      }
    };
  }, []);

  const total = quiz.questions.length;
  const currentQ = quiz.questions[currentQuestion];
  const displayNum = currentQuestion + 1;
  const progress = (displayNum / total) * 100;
  const remaining = total - displayNum;

  const handleSubmit = () => {
    if (submitting || !currentInput) return;

    // Strict equality grading against the bank's pre-validated `answer: number`.
    // Number() rejects trailing junk ("7abc" → NaN), which is intentional rigor
    // for a graded assessment.
    const trimmed = currentInput.trim();
    const parsed = Number(currentInput);
    const parsedIsValid = trimmed !== "" && !isNaN(parsed);
    const correct = parsedIsValid && parsed === currentQ.answer;

    const answerRecord: QuizAttemptAnswer = {
      question_id: currentQ.id,
      student_answer: currentInput,
      parsed_answer: parsedIsValid ? parsed : null,
      correct,
      time_seconds: Math.round((Date.now() - questionStartedAt) / 1000),
    };

    setSubmitting(true);
    submitTimeoutRef.current = setTimeout(() => {
      submitTimeoutRef.current = null;
      const nextAnswers = [...answers, answerRecord];

      if (currentQuestion < total - 1) {
        setAnswers(nextAnswers);
        setCurrentQuestion(currentQuestion + 1);
        setCurrentInput("");
        setQuestionStartedAt(Date.now());
        setSubmitting(false);
      } else {
        const finishedAt = new Date().toISOString();
        const attempt: QuizAttempt = {
          attempt_id: `att_${Date.now()}`,
          topic_id: topic.id,
          started_at: startedAt,
          finished_at: finishedAt,
          total_seconds: Math.round(
            (Date.now() - new Date(startedAt).getTime()) / 1000
          ),
          score: nextAnswers.filter((a) => a.correct).length,
          total,
          answers: nextAnswers,
        };
        onComplete(attempt);
      }
    }, 300);
  };

  const submitEnabled = !!currentInput && !submitting;

  return (
    <div className="max-w-3xl mx-auto px-8 py-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => setShowExitConfirm(true)}
          className="flex items-center gap-2 transition-colors hover:opacity-70"
          style={{ color: "#EF4444" }}
        >
          <ChevronLeft size={16} />
          <span style={{ fontSize: "14px" }}>Exit quiz</span>
        </button>
        <h1 style={{ fontSize: "16px", fontWeight: 500, color: "#0F2A4A" }}>
          Quiz: {topic.title.en}
        </h1>
        <div className="flex items-center gap-2">
          <Clock size={16} style={{ color: "#6B7280" }} />
          <span
            style={{
              fontSize: "14px",
              color: "#1F2937",
              fontFamily: "monospace",
            }}
          >
            {formatTime(elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div
          className="h-1.5 rounded-full"
          style={{ backgroundColor: "#E2E5EA" }}
        >
          <div
            className="h-1.5 rounded-full transition-all"
            style={{ backgroundColor: "#0F2A4A", width: `${progress}%` }}
          />
        </div>
        <div
          className="flex justify-between mt-2"
          style={{ fontSize: "12px", color: "#9CA3AF" }}
        >
          <span>
            Question {displayNum} of {total}
          </span>
          <span>{remaining} remaining</span>
        </div>
      </div>

      {/* Question Card */}
      <div
        className="rounded-xl p-8"
        style={{
          backgroundColor: "#FFFFFF",
          borderLeft: "1px solid #E2E5EA",
          borderRight: "1px solid #E2E5EA",
          borderBottom: "1px solid #E2E5EA",
          borderTop: "2px solid #0F2A4A",
        }}
      >
        <p style={{ fontSize: "15px", color: "#1F2937", marginBottom: "24px" }}>
          {currentQ.question}:
        </p>

        {/* Math display */}
        <div
          className="rounded-lg p-8 mb-8 text-center"
          style={{ backgroundColor: "#F0F3F7" }}
        >
          <div
            style={{
              fontSize: "28px",
              color: "#0F2A4A",
              fontFamily: "serif",
              fontStyle: "italic",
            }}
          >
            {currentQ.equation}
          </div>
        </div>

        {/* Answer input */}
        <div className="flex gap-3">
          <input
            type="text"
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            placeholder="Type your answer..."
            className="flex-1 px-5 py-4 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
            style={{
              borderColor: "#E2E5EA",
              backgroundColor: "#FFFFFF",
              fontSize: "18px",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && submitEnabled) handleSubmit();
            }}
            disabled={submitting}
            autoFocus
          />
          <button
            onClick={handleSubmit}
            disabled={!submitEnabled}
            className="px-8 py-4 rounded-lg transition-colors"
            style={{
              backgroundColor: submitEnabled ? "#0F2A4A" : "#E2E5EA",
              color: "#FFFFFF",
              fontSize: "15px",
              cursor: submitEnabled ? "pointer" : "not-allowed",
            }}
          >
            Submit answer &rarr;
          </button>
        </div>
      </div>

      {/* Help text */}
      <div className="mt-6 text-center">
        <p style={{ fontSize: "13px", color: "#9CA3AF" }}>
          Take your time. You can&apos;t go back to previous questions.
        </p>
      </div>

      {/* Exit confirmation */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50 }}
        >
          <div
            className="rounded-xl p-8 max-w-md"
            style={{ backgroundColor: "#FFFFFF" }}
          >
            <h3
              style={{
                fontSize: "18px",
                fontWeight: 500,
                color: "#0F2A4A",
                marginBottom: "12px",
              }}
            >
              Exit quiz?
            </h3>
            <p
              style={{
                fontSize: "14px",
                color: "#6B7280",
                marginBottom: "24px",
              }}
            >
              Are you sure? Your progress will be lost.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExitConfirm(false);
                  onExit();
                }}
                className="flex-1 px-6 py-3 rounded-lg"
                style={{
                  backgroundColor: "#EF4444",
                  color: "#FFFFFF",
                  fontSize: "14px",
                }}
              >
                Yes, exit
              </button>
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 px-6 py-3 rounded-lg border"
                style={{
                  borderColor: "#E2E5EA",
                  color: "#1F2937",
                  fontSize: "14px",
                }}
              >
                Keep going
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
