"use client";

import { useEffect } from "react";
import { useAIContext } from "@/components/ai-context";

export default function DashboardPage() {
  const { setContext } = useAIContext();

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  return (
    <div className="max-w-3xl mx-auto px-8 py-12">
      <div
        className="rounded-xl"
        style={{
          backgroundColor: "#FFFFFF",
          border: "0.5px solid #E2E5EA",
          padding: 32,
        }}
      >
        <div className="flex items-start justify-between mb-6">
          <h1 style={{ fontSize: 24, fontWeight: 500, color: "#0F2A4A" }}>
            AI Learner Portrait
          </h1>
          <span
            className="px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "#FEF3C7", color: "#D97706", fontWeight: 500 }}
          >
            Preview
          </span>
        </div>
        <p style={{ fontSize: 14, color: "#6B7280", lineHeight: 1.6, marginBottom: 24 }}>
          Beacon will use Gemma 4, running locally via Ollama, to analyze your
          learning patterns — which concepts you grasp quickly, where you slow
          down, and how your mistakes cluster — and surface that picture here.
          The portrait stays on your device.
        </p>
        <button
          disabled
          className="rounded-lg"
          style={{
            backgroundColor: "#F5F6F8",
            color: "#9CA3AF",
            padding: "10px 20px",
            fontSize: 14,
            fontWeight: 500,
            cursor: "not-allowed",
            border: "none",
          }}
        >
          Coming in v1
        </button>
      </div>
    </div>
  );
}
