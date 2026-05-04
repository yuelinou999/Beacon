"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAIContext } from "@/components/ai-context";
import type { PortraitResponse } from "@/lib/portrait";
import ViewToggle, { type ViewMode } from "./_components/view-toggle";
import Section1Portrait from "./_components/section1-portrait";
import Section2Insights from "./_components/section2-insights";
import Section3Profile from "./_components/section3-profile";
import Section4Suggestions from "./_components/section4-suggestions";

// Dashboard state machine — three terminal states for the portrait fetch.
// All UI sections render off the same PortraitResponse; viewMode flips local
// display only and does NOT trigger a re-fetch (per design spec, dual-mode
// content is already in headline.narrative/analytical and suggestion.{...}).
type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PortraitResponse };

export default function DashboardPage() {
  const { setContext } = useAIContext();
  const [state, setState] = useState<DashboardState>({ status: "loading" });
  const [viewMode, setViewMode] = useState<ViewMode>("student");

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  const loadPortrait = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/portrait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = (await res.json()) as PortraitResponse;
      setState({ status: "ready", data });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown fetch error",
      });
    }
  }, []);

  useEffect(() => {
    loadPortrait();
  }, [loadPortrait]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-10 py-10">
        {/* Top bar — single inline row, no sticky chrome */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Home</span>
          </Link>
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Header */}
        <div className="mb-10">
          <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A", marginBottom: "8px" }}>
            Dashboard
          </h1>
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            Understanding you as a learner
          </p>
        </div>

        {/* Body */}
        {state.status === "loading" && <LoadingCard />}
        {state.status === "error" && (
          <ErrorCard message={state.message} onRetry={loadPortrait} />
        )}
        {state.status === "ready" && (
          <>
            <Section1Portrait
              portrait={state.data.portrait}
              thinking={state.data.thinking}
              viewMode={viewMode}
              onRegenerate={loadPortrait}
            />
            <Section2Insights portrait={state.data.portrait} viewMode={viewMode} />
            <Section3Profile portrait={state.data.portrait} />
            <Section4Suggestions portrait={state.data.portrait} viewMode={viewMode} />
            {/* Section 5 (Quick Facts) lands in step 5. */}
            <div
              className="rounded-xl p-8 text-center"
              style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
            >
              <p style={{ fontSize: "14px", color: "#6B7280" }}>
                Section 5 (Quick Facts) lands next.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Loading state ─────────────────────────────────────
// Animated bullet list mirroring figma's generation animation. Each bullet
// represents a stage of the LLM portrait pipeline so the wait feels narrated.
function LoadingCard() {
  const lines = [
    "Reading your learning patterns…",
    "Comparing across subjects…",
    "Looking for what makes you unique…",
    "Writing your portrait…",
  ];
  return (
    <div
      className="rounded-xl p-8"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E2E5EA",
        borderLeft: "3px solid #2563EB",
      }}
    >
      <ul role="list" className="space-y-3 list-none p-0">
        {lines.map((line, i) => (
          <li
            key={line}
            className="flex items-center gap-3 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <span
              className="w-4 h-4 rounded-full border-2 animate-spin shrink-0"
              style={{ borderColor: "#2563EB", borderTopColor: "transparent" }}
              aria-hidden="true"
            />
            <span style={{ fontSize: "14px", color: "#6B7280" }}>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Error state ─────────────────────────────────────
// Per codex: keep diagnostic info — the most common failure here is "Ollama
// isn't running". Visual refresh, but not at the cost of clear setup
// guidance. Retry button calls the same loadPortrait the page mounts with.
function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="rounded-xl p-8"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #FCA5A5",
        borderLeft: "3px solid #EF4444",
      }}
      role="alert"
    >
      <p style={{ fontSize: "14px", fontWeight: 500, color: "#991B1B", marginBottom: "8px" }}>
        Could not generate portrait
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "#6B7280",
          marginBottom: "12px",
          wordBreak: "break-word",
        }}
      >
        {message}
      </p>
      <p style={{ fontSize: "12px", color: "#6B7280", marginBottom: "16px", lineHeight: 1.6 }}>
        Make sure Ollama is running and gemma4:e2b is pulled, then retry.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg border transition-colors hover:border-blue-500"
        style={{ borderColor: "#E2E5EA", color: "#1F2937", fontSize: "13px" }}
      >
        Try again
      </button>
    </div>
  );
}
