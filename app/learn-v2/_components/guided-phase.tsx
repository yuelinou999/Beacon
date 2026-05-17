"use client";

import { useState } from "react";
import { Hand } from "lucide-react";
import type { GuidedPhaseContent } from "@/lib/curriculum-types";

interface GuidedPhaseProps {
  guided: GuidedPhaseContent;
  onComplete: () => void;
}

export default function GuidedPhaseView({
  guided,
  onComplete,
}: GuidedPhaseProps) {
  const [currentSubStep, setCurrentSubStep] = useState<number>(0);
  const [selection, setSelection] = useState<string>("");
  const [feedback, setFeedback] = useState<{
    step: number;
    correct: boolean;
  } | null>(null);

  const subStep = guided.sub_steps[currentSubStep];
  const isLastSubStep = currentSubStep === 2;
  const phaseComplete =
    isLastSubStep && feedback?.step === 2 && feedback.correct;
  const showFeedback = feedback !== null && feedback.step === currentSubStep;

  const evaluateAnswer = (answer: string) => {
    // Once correct, ignore further clicks until auto-advance fires.
    if (feedback?.step === currentSubStep && feedback.correct) return;

    let isCorrect = false;
    if (subStep.type === "choice") {
      isCorrect = answer === subStep.correct;
    } else {
      // parseFloat (not parseInt) so decimal answers don't get truncated
      // to 0 — same bug as independent-phase.tsx had on the unit-rate
      // 9/12 = 0.75 question.
      const userAnswer = parseFloat(answer);
      isCorrect =
        Number.isFinite(userAnswer) &&
        Math.abs(userAnswer - (subStep.correct as number)) < 1e-9;
    }
    setFeedback({ step: currentSubStep, correct: isCorrect });
    if (isCorrect && currentSubStep < 2) {
      setTimeout(() => {
        setCurrentSubStep((prev) => prev + 1);
        setSelection("");
        setFeedback(null);
      }, 1000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Hand size={14} style={{ color: "#D97706" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#D97706",
              letterSpacing: "0.5px",
            }}
          >
            YOUR TURN (WITH HELP)
          </span>
        </div>

        <h2
          style={{
            fontSize: "20px",
            fontWeight: 500,
            color: "#0F2A4A",
            marginBottom: "24px",
          }}
        >
          {guided.title}
        </h2>

        {/* Problem */}
        <div
          className="rounded-lg p-6 mb-6 text-center"
          style={{ backgroundColor: "#FFFBEB" }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#92400E",
              marginBottom: "8px",
            }}
          >
            Solve for n:
          </p>
          <div
            style={{
              fontSize: "24px",
              color: "#0F2A4A",
              fontFamily: "serif",
              fontStyle: "italic",
            }}
          >
            {guided.problem}
          </div>
        </div>

        {/* Active sub-step */}
        <div
          className={
            isLastSubStep ? "rounded-lg p-6 mb-6" : "rounded-lg p-6 mb-4"
          }
          style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
        >
          <p
            style={{
              fontSize: "15px",
              color: "#1F2937",
              marginBottom: "16px",
              fontWeight: 500,
            }}
          >
            {subStep.question}
          </p>

          {subStep.type === "choice" && (
            <div className="flex gap-3">
              {subStep.options.map((op) => (
                <button
                  key={op}
                  onClick={() => {
                    setSelection(op);
                    evaluateAnswer(op);
                  }}
                  className="flex-1 py-3 rounded-lg border-2 transition-all"
                  style={{
                    borderColor:
                      selection === op
                        ? op === subStep.correct
                          ? "#059669"
                          : "#EF4444"
                        : "#E2E5EA",
                    backgroundColor:
                      selection === op
                        ? op === subStep.correct
                          ? "#ECFDF5"
                          : "#FEF2F2"
                        : "#FFFFFF",
                    color:
                      selection === op
                        ? op === subStep.correct
                          ? "#059669"
                          : "#EF4444"
                        : "#1F2937",
                    fontSize: "14px",
                  }}
                >
                  {op}
                </button>
              ))}
            </div>
          )}

          {subStep.type === "number" && (
            <div className="flex gap-3">
              <input
                type="text"
                value={selection}
                onChange={(e) => setSelection(e.target.value)}
                placeholder={
                  currentSubStep === 1
                    ? "Type a number..."
                    : "Type your answer..."
                }
                className="flex-1 px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: "#E2E5EA", fontSize: "15px" }}
              />
            </div>
          )}

          {/* Feedback — sub-step 3 correct gets the special green box variant */}
          {showFeedback && feedback?.correct && isLastSubStep && (
            <div
              className="mt-4 rounded-lg p-4"
              style={{
                backgroundColor: "#ECFDF5",
                border: "1px solid #059669",
              }}
            >
              <p
                style={{
                  fontSize: "15px",
                  color: "#059669",
                  fontWeight: 500,
                  lineHeight: 1.6,
                }}
              >
                {subStep.feedback_correct}
              </p>
            </div>
          )}
          {showFeedback && feedback?.correct && !isLastSubStep && (
            <p
              style={{
                fontSize: "14px",
                color: "#059669",
                marginTop: "12px",
              }}
            >
              {subStep.feedback_correct}
            </p>
          )}
          {showFeedback && !feedback?.correct && (
            <p
              style={{
                fontSize: "14px",
                color: "#D97706",
                marginTop: "12px",
              }}
            >
              {subStep.feedback_wrong}
            </p>
          )}
        </div>

        <div className="flex justify-center gap-3">
          {phaseComplete ? (
            <button
              onClick={onComplete}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{
                backgroundColor: "#0F2A4A",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Ready for the real test →
            </button>
          ) : subStep.type === "number" ? (
            <button
              onClick={() => evaluateAnswer(selection)}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{
                backgroundColor: "#D97706",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Check
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
