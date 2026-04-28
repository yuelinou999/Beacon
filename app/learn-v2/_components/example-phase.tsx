"use client";

import { useState } from "react";
import { Pencil, ChevronRight } from "lucide-react";
import type { ExamplePhaseContent } from "@/lib/curriculum-types";

interface ExamplePhaseProps {
  example: ExamplePhaseContent;
  onComplete: () => void;
}

export default function ExamplePhaseView({
  example,
  onComplete,
}: ExamplePhaseProps) {
  const [stepsRevealed, setStepsRevealed] = useState<number>(1);
  const totalSteps = example.steps.length;
  const isLastStep = stepsRevealed >= totalSteps;

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Pencil size={14} style={{ color: "#2563EB" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#2563EB",
              letterSpacing: "0.5px",
            }}
          >
            WORKED EXAMPLE
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
          {example.title}
        </h2>

        {/* Problem statement */}
        <div
          className="rounded-lg p-6 mb-6 text-center"
          style={{ backgroundColor: "#EFF6FF" }}
        >
          <p
            style={{
              fontSize: "14px",
              color: "#1E40AF",
              marginBottom: "8px",
            }}
          >
            Solve for x:
          </p>
          <div
            style={{
              fontSize: "24px",
              color: "#0F2A4A",
              fontFamily: "serif",
              fontStyle: "italic",
            }}
          >
            {example.problem}
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-4 mb-8">
          {example.steps.slice(0, stepsRevealed).map((step, index) => {
            const isActive = index === stepsRevealed - 1;
            return (
              <div
                key={index}
                className="rounded-lg p-5 border"
                style={{
                  backgroundColor: isActive ? "#FFFFFF" : "#FAFBFC",
                  borderColor: "#E2E5EA",
                  opacity: isActive ? 1 : 0.7,
                }}
              >
                <div className="flex items-start gap-6">
                  <div className="flex-1">
                    <div
                      className="rounded-lg p-4 mb-3 text-center"
                      style={{ backgroundColor: "#F0F3F7" }}
                    >
                      <div
                        style={{
                          fontSize: "20px",
                          color: "#0F2A4A",
                          fontFamily: "serif",
                          fontStyle: "italic",
                        }}
                      >
                        {Array.isArray(step.math)
                          ? step.math.map((seg, i) => (
                              <span
                                key={i}
                                style={
                                  seg.highlight
                                    ? { color: "#2563EB", fontWeight: 600 }
                                    : undefined
                                }
                              >
                                {seg.text}
                              </span>
                            ))
                          : step.math}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 flex items-center">
                    <p
                      style={{
                        fontSize: "14px",
                        color: "#1F2937",
                        lineHeight: 1.6,
                      }}
                    >
                      {step.explanation}
                    </p>
                  </div>
                </div>
                <div
                  className="text-right"
                  style={{
                    fontSize: "12px",
                    color: "#9CA3AF",
                    marginTop: "8px",
                  }}
                >
                  Step {index + 1} of {totalSteps}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex justify-center">
          {!isLastStep ? (
            <button
              onClick={() => setStepsRevealed((n) => n + 1)}
              className="px-8 py-3 rounded-lg transition-colors flex items-center gap-2"
              style={{
                backgroundColor: "#2563EB",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Next step <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="px-8 py-3 rounded-lg transition-colors"
              style={{
                backgroundColor: "#0F2A4A",
                color: "#FFFFFF",
                fontSize: "15px",
              }}
            >
              Now you try →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
