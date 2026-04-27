"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAIContext } from "@/components/ai-context";
import type { PortraitResponse } from "@/lib/portrait";
import PortraitCard from "./_components/portrait-card";
import ViewToggle, { type ViewMode } from "./_components/view-toggle";
import InsightCards from "./_components/insight-cards";
import ProfileCards from "./_components/profile-cards";
import SuggestionsCard from "./_components/suggestions-card";
import QuickFacts from "./_components/quick-facts";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        if (!cancelled) setState({ status: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              err instanceof Error ? err.message : "Unknown fetch error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-gray-200 bg-white">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Home
        </Link>
        <ViewToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Page body */}
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Page header */}
        <header className="mb-8">
          <h1 className="text-2xl font-medium text-[#0F2A4A] mb-1">
            Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Understanding you as a learner
          </p>
        </header>

        {/* Section 1 — AI Portrait card */}
        {state.status === "loading" && <LoadingCard />}
        {state.status === "error" && <ErrorCard message={state.message} />}
        {state.status === "ready" && (
          <>
            <PortraitCard
              portrait={state.data.portrait}
              viewMode={viewMode}
            />
            <InsightCards
              portrait={state.data.portrait}
              viewMode={viewMode}
            />
            <ProfileCards portrait={state.data.portrait} />
            <SuggestionsCard
              suggestions={state.data.portrait.suggestions}
              viewMode={viewMode}
            />
            <QuickFacts quickFacts={state.data.portrait.quick_facts} />
          </>
        )}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <section className="rounded-xl bg-white border border-gray-200 border-l-[3px] border-l-blue-600 p-8 mb-8">
      <p className="text-sm text-gray-500">
        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse mr-2 align-middle" />
        Generating your portrait — Gemma 4 is thinking locally. This usually
        takes 20–30 seconds.
      </p>
    </section>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <section className="rounded-xl bg-white border border-red-200 border-l-[3px] border-l-red-500 p-8 mb-8">
      <p className="text-sm font-medium text-red-700 mb-2">
        Could not generate portrait
      </p>
      <p className="text-xs text-gray-600 break-words">{message}</p>
      <p className="text-xs text-gray-500 mt-3">
        Make sure Ollama is running and gemma4:e2b is pulled, then refresh the
        page.
      </p>
    </section>
  );
}
