"use client";

import { useState } from "react";
import { Star, Check } from "lucide-react";
import type { IndependentPhaseContent } from "@/lib/curriculum-types";

interface IndependentPhaseProps {
  independent: IndependentPhaseContent;
  onComplete: () => void;
}

type Tri = boolean | null;
type AnswerTuple = [string, string, string];
type ResultTuple = [Tri, Tri, Tri];

export default function IndependentPhaseView({
  independent,
  onComplete,
}: IndependentPhaseProps) {
  const [answers, setAnswers] = useState<AnswerTuple>(["", "", ""]);
  const [results, setResults] = useState<ResultTuple>([null, null, null]);

  const allCorrect = results.every((r) => r === true);

  const handleChange =
    (i: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const next: AnswerTuple = [...answers] as AnswerTuple;
      next[i] = e.target.value;
      setAnswers(next);
      // Editing the input clears any stale wrong-feedback for this problem.
      if (results[i] !== null) {
        const nextResults: ResultTuple = [...results] as ResultTuple;
        nextResults[i] = null;
        setResults(nextResults);
      }
    };

  const handleSubmit = (i: number) => () => {
    // parseFloat (not parseInt) so decimal answers like 0.75 don't get
    // truncated to 0 and silently judged wrong. The bank stores answers
    // as numbers (e.g. 0.75 for "9 dollars / 12 pencils"); compare with
    // a small epsilon to absorb floating-point representation drift
    // (e.g. 0.1 + 0.2 !== 0.3 in IEEE 754) so cleanly-typed correct
    // answers always land as correct.
    const userAnswer = parseFloat(answers[i]);
    const expected = independent.questions[i].answer;
    const isCorrect =
      Number.isFinite(userAnswer) && Math.abs(userAnswer - expected) < 1e-9;
    const next: ResultTuple = [...results] as ResultTuple;
    next[i] = isCorrect;
    setResults(next);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Star size={14} style={{ color: "#0F2A4A" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#0F2A4A",
              letterSpacing: "0.5px",
            }}
          >
            INDEPENDENT PRACTICE
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
          {independent.title}
        </h2>

        {independent.questions.map((q, i) => {
          const isCorrect = results[i] === true;
          const isWrong = results[i] === false;
          return (
            <div
              key={i}
              className="rounded-lg p-6 mb-6"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #E2E5EA",
              }}
            >
              <p
                style={{
                  fontSize: "15px",
                  color: "#1F2937",
                  marginBottom: "16px",
                }}
              >
                Solve for x:
              </p>
              <div
                className="rounded-lg p-6 mb-6 text-center"
                style={{ backgroundColor: "#F0F3F7" }}
              >
                <div
                  style={{
                    fontSize: "24px",
                    color: "#0F2A4A",
                    fontFamily: "serif",
                    fontStyle: "italic",
                  }}
                >
                  {q.equation}
                </div>
              </div>

              {!isCorrect && (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={answers[i]}
                    onChange={handleChange(i)}
                    placeholder="x = ___"
                    className="flex-1 px-6 py-4 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 text-center"
                    style={{
                      borderColor: isWrong ? "#EF4444" : "#E2E5EA",
                      fontSize: "18px",
                    }}
                  />
                  <button
                    onClick={handleSubmit(i)}
                    className="px-8 py-4 rounded-lg transition-colors"
                    style={{
                      backgroundColor: "#2563EB",
                      color: "#FFFFFF",
                      fontSize: "15px",
                    }}
                  >
                    Submit
                  </button>
                </div>
              )}

              {isWrong && (
                <p
                  style={{
                    fontSize: "14px",
                    color: "#D97706",
                    marginTop: "12px",
                  }}
                >
                  Not quite — try again.
                </p>
              )}

              {isCorrect && (
                <div
                  className="rounded-lg p-4 flex items-center gap-3"
                  style={{
                    backgroundColor: "#ECFDF5",
                    border: "1px solid #059669",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: "#059669" }}
                  >
                    <Check size={18} style={{ color: "#FFFFFF" }} />
                  </div>
                  <p
                    style={{
                      fontSize: "16px",
                      fontWeight: 500,
                      color: "#065F46",
                    }}
                  >
                    Perfect!
                  </p>
                </div>
              )}
            </div>
          );
        })}

        {allCorrect && (
          <div className="flex justify-center mt-2">
            <button
              onClick={onComplete}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{
                backgroundColor: "#059669",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Complete lesson →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
