"use client";

import { Lightbulb, Star } from "lucide-react";
import type { ConceptPhaseContent } from "@/lib/curriculum-types";

interface ConceptPhaseProps {
  concept: ConceptPhaseContent;
  onComplete: () => void;
}

export default function ConceptPhaseView({ concept, onComplete }: ConceptPhaseProps) {
  const leftLabel = concept.visual.left ?? "x + 5";
  const rightLabel = concept.visual.right ?? "12";

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb size={14} style={{ color: "#2563EB" }} />
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#2563EB",
              letterSpacing: "0.5px",
            }}
          >
            CONCEPT
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
          {concept.title}
        </h2>

        <p
          style={{
            fontSize: "15px",
            color: "#1F2937",
            lineHeight: 1.8,
            marginBottom: "24px",
          }}
        >
          {concept.explanation}
        </p>

        {/* Math display with balance visual */}
        <div
          className="rounded-lg p-6 mb-6 text-center"
          style={{ backgroundColor: "#F0F3F7" }}
        >
          {concept.visual.type === "balance_scale" ? (
            <div className="mb-4">
              <svg width="200" height="80" viewBox="0 0 200 80" style={{ margin: "0 auto" }}>
                {/* Balance scale */}
                <line x1="100" y1="10" x2="100" y2="40" stroke="#6B7280" strokeWidth="2" />
                <line x1="40" y1="40" x2="160" y2="40" stroke="#6B7280" strokeWidth="3" />
                {/* Left plate */}
                <rect x="20" y="40" width="60" height="4" fill="#2563EB" rx="2" />
                <text x="50" y="60" textAnchor="middle" fontSize="14" fill="#1F2937">
                  {leftLabel}
                </text>
                {/* Right plate */}
                <rect x="120" y="40" width="60" height="4" fill="#2563EB" rx="2" />
                <text x="150" y="60" textAnchor="middle" fontSize="14" fill="#1F2937">
                  {rightLabel}
                </text>
              </svg>
            </div>
          ) : concept.visual.type !== "none" ? (
            <div
              className="mb-4"
              style={{ fontSize: "13px", color: "#6B7280", fontStyle: "italic" }}
            >
              [{concept.visual.type} illustration]
            </div>
          ) : null}
          {concept.main_equation && (
            <div
              style={{
                fontSize: "22px",
                color: "#0F2A4A",
                fontFamily: "serif",
                fontStyle: "italic",
              }}
            >
              {concept.main_equation}
            </div>
          )}
        </div>

        {/* Key idea callout */}
        <div
          className="rounded-lg p-4 flex items-start gap-3 mb-8"
          style={{ backgroundColor: "#EFF6FF" }}
        >
          <Star
            size={16}
            style={{ color: "#2563EB", marginTop: "2px", flexShrink: 0 }}
          />
          <p style={{ fontSize: "14px", color: "#1E40AF", lineHeight: 1.6 }}>
            <strong>Key idea:</strong> {concept.key_idea}
          </p>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onComplete}
            className="px-8 py-3 rounded-lg transition-colors"
            style={{
              backgroundColor: "#0F2A4A",
              color: "#FFFFFF",
              fontSize: "15px",
              minWidth: "200px",
            }}
          >
            Got it →
          </button>
        </div>
      </div>
    </div>
  );
}
