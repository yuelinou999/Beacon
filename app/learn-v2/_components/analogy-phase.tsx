"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import type { AnalogyPhaseContent } from "@/lib/curriculum-types";

interface AnalogyPhaseProps {
  analogy: AnalogyPhaseContent;
  onComplete: () => void;
}

export default function AnalogyPhaseView({
  analogy,
  onComplete,
}: AnalogyPhaseProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);

  const isCorrect = selectedAnswer !== null && selectedAnswer === analogy.correct;
  const isWrong = selectedAnswer !== null && selectedAnswer !== analogy.correct;

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Globe size={14} style={{ color: "#059669" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#059669",
              letterSpacing: "0.5px",
            }}
          >
            REAL-LIFE CONNECTION
          </span>
        </div>

        <h2
          style={{
            fontSize: "20px",
            fontWeight: 500,
            color: "#0F2A4A",
            marginBottom: "20px",
          }}
        >
          {analogy.title}
        </h2>

        <p
          style={{
            fontSize: "15px",
            color: "#1F2937",
            lineHeight: 1.8,
            marginBottom: "32px",
          }}
        >
          {analogy.scenario}
        </p>

        {/* Illustration */}
        <div className="mb-8 flex items-center justify-center gap-6">
          {analogy.illustration_hint === "bag_with_apples" ? (
            <>
              <svg width="80" height="80" viewBox="0 0 80 80">
                {/* Bag with question mark */}
                <path
                  d="M20 30 Q 20 20, 30 20 L 50 20 Q 60 20, 60 30 L 60 70 Q 60 75, 55 75 L 25 75 Q 20 75, 20 70 Z"
                  fill="#D97706"
                  opacity="0.8"
                />
                <text
                  x="40"
                  y="55"
                  textAnchor="middle"
                  fontSize="24"
                  fill="#FFFFFF"
                  fontWeight="bold"
                >
                  ?
                </text>
              </svg>

              <span style={{ fontSize: "20px", color: "#6B7280" }}>+</span>

              <div className="flex flex-wrap gap-2" style={{ width: "100px" }}>
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="16" height="16" viewBox="0 0 16 16">
                    <circle cx="8" cy="8" r="7" fill="#EF4444" />
                  </svg>
                ))}
              </div>

              <span style={{ fontSize: "20px", color: "#6B7280" }}>=</span>

              <div style={{ fontSize: "32px", color: "#0F2A4A", fontWeight: 500 }}>
                12
              </div>
            </>
          ) : (
            <div
              style={{
                fontSize: "13px",
                color: "#6B7280",
                fontStyle: "italic",
              }}
            >
              [{analogy.illustration_hint} illustration]
            </div>
          )}
        </div>

        {/* Verification question */}
        <div
          className="rounded-lg p-6"
          style={{
            backgroundColor: "#FFFFFF",
            borderLeft: "3px solid #059669",
          }}
        >
          <p
            style={{
              fontSize: "15px",
              color: "#1F2937",
              marginBottom: "16px",
              fontWeight: 500,
            }}
          >
            {analogy.question}
          </p>

          <div className="flex gap-3 mb-4">
            {analogy.options.map((num) => (
              <button
                key={num}
                onClick={() => setSelectedAnswer(num)}
                className="flex-1 py-3 rounded-lg border-2 transition-all"
                style={{
                  borderColor:
                    selectedAnswer === num
                      ? num === analogy.correct
                        ? "#059669"
                        : "#EF4444"
                      : "#E2E5EA",
                  backgroundColor:
                    selectedAnswer === num
                      ? num === analogy.correct
                        ? "#ECFDF5"
                        : "#FEF2F2"
                      : "#FFFFFF",
                  color:
                    selectedAnswer === num
                      ? num === analogy.correct
                        ? "#059669"
                        : "#EF4444"
                      : "#1F2937",
                  fontSize: "16px",
                  fontWeight: 500,
                }}
              >
                {num}
              </button>
            ))}
          </div>

          {isCorrect && (
            <div className="mb-4">
              <p style={{ fontSize: "14px", color: "#059669", lineHeight: 1.6 }}>
                {analogy.feedback_correct}
              </p>
            </div>
          )}

          {isWrong && (
            <div className="mb-4">
              <p style={{ fontSize: "14px", color: "#D97706", lineHeight: 1.6 }}>
                {analogy.feedback_incorrect}
              </p>
            </div>
          )}

          {isCorrect && (
            <div className="flex justify-center mt-6">
              <button
                onClick={onComplete}
                className="px-8 py-3 rounded-lg transition-colors"
                style={{
                  backgroundColor: "#059669",
                  color: "#FFFFFF",
                  fontSize: "15px",
                }}
              >
                Continue →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
