"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getAllTopics } from "@/lib/curriculum";
import { isTopicStub } from "@/lib/types";
import { getBilingual } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { useAIContext } from "@/components/ai-context";
import BilingualSubtitle from "@/components/bilingual-subtitle";
import PhaseProgress from "../_components/phase-progress";
import ConceptPhaseView from "../_components/concept-phase";
import AnalogyPhaseView from "../_components/analogy-phase";
import ExamplePhaseView from "../_components/example-phase";
import GuidedPhaseView from "../_components/guided-phase";
import IndependentPhaseView from "../_components/independent-phase";
import CompletePhaseView from "../_components/complete-phase";

type PhaseState = 1 | 2 | 3 | 4 | 5 | "complete";

export default function LearnV2TopicPage() {
  const params = useParams<{ topicId: string }>();
  const topicId = params.topicId;
  const { setContext } = useAIContext();

  const [currentPhase, setCurrentPhase] = useState<PhaseState>(1);
  const [bilingual, setBilingual] = useState(false);

  useEffect(() => {
    const refresh = () => setBilingual(getBilingual());
    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  const topic = getAllTopics().find((t) => t.id === topicId);

  useEffect(() => {
    if (topic) {
      setContext({
        page: "learn",
        topicId: topic.id,
        topicTitle: topic.title.en,
      });
    } else {
      setContext({ page: "general" });
    }
  }, [setContext, topic]);

  // ── Error state: topic id not in curriculum ─────────────
  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/subject/math"
            className="flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>
        </div>
        <div
          className="max-w-2xl mx-auto rounded-xl p-8 text-center"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 500,
              color: "#0F2A4A",
              marginBottom: "12px",
            }}
          >
            Topic not found
          </h2>
          <p style={{ fontSize: "14px", color: "#6B7280" }}>
            No topic with id <code>{topicId}</code> exists in the curriculum.
          </p>
        </div>
      </div>
    );
  }

  // ── Stub / coming-soon state: Tier-3 topics or missing phases ─────
  if (!topic.phases || isTopicStub(topic.phases)) {
    return (
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/subject/math"
            className="flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Back to course</span>
          </Link>
        </div>
        <div className="mb-8 text-center">
          <h1
            style={{
              fontSize: "24px",
              fontWeight: 500,
              color: "#0F2A4A",
              marginBottom: "4px",
            }}
          >
            {topic.title.en}
          </h1>
          <BilingualSubtitle
            english={topic.title.en}
            fallbackZh={topic.title.zh}
            style={{ display: "block", fontSize: "14px", color: "#6B7280" }}
          />
        </div>
        <div
          className="max-w-2xl mx-auto rounded-xl p-8 text-center"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
        >
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 500,
              color: "#0F2A4A",
              marginBottom: "12px",
            }}
          >
            Coming soon
          </h2>
          <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
            This lesson hasn&apos;t been written yet. Check back soon, or
            explore another topic from the course catalog.
          </p>
        </div>
      </div>
    );
  }

  // Tier-1 / Tier-2: phases.concept is guaranteed by the type guard above.
  const phases = topic.phases;
  const concept = phases.concept;

  const subtitle =
    topic.id === "solving_one_step"
      ? "Using inverse operations to isolate the variable"
      : null;

  return (
    <div className="max-w-4xl mx-auto px-8 py-8">
      {/* Top Bar */}
      <div className="flex items-center justify-between mb-8">
        <Link
          href="/subject/math"
          className="flex items-center gap-2 transition-colors hover:opacity-70"
          style={{ color: "#2563EB" }}
        >
          <ChevronLeft size={16} />
          <span style={{ fontSize: "14px" }}>Back to course</span>
        </Link>
      </div>

      {/* Title */}
      <div className="mb-8 text-center">
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 500,
            color: "#0F2A4A",
            marginBottom: "4px",
          }}
        >
          {topic.title.en}
        </h1>
        <BilingualSubtitle
          english={topic.title.en}
          fallbackZh={topic.title.zh}
          style={{ display: "block", fontSize: "14px", color: "#9CA3AF", marginBottom: "4px" }}
        />
        {subtitle && (
          <p style={{ fontSize: "14px", color: "#6B7280" }}>{subtitle}</p>
        )}
      </div>

      {/* Phase Progress Indicator */}
      <PhaseProgress currentPhase={currentPhase} />

      {/* Phase Content */}
      {currentPhase === 1 && (
        <ConceptPhaseView
          concept={concept}
          onComplete={() => setCurrentPhase(2)}
        />
      )}
      {currentPhase === 2 && phases.analogy && (
        <AnalogyPhaseView
          analogy={phases.analogy}
          onComplete={() => setCurrentPhase(3)}
        />
      )}
      {currentPhase === 2 && !phases.analogy && (
        <PhasePlaceholder
          phase={2}
          onBack={() => setCurrentPhase(1)}
        />
      )}
      {currentPhase === 3 && phases.example && (
        <ExamplePhaseView
          example={phases.example}
          onComplete={() => setCurrentPhase(4)}
        />
      )}
      {currentPhase === 3 && !phases.example && (
        <PhasePlaceholder
          phase={3}
          onBack={() => setCurrentPhase(1)}
        />
      )}
      {currentPhase === 4 && phases.guided && (
        <GuidedPhaseView
          guided={phases.guided}
          onComplete={() => setCurrentPhase(5)}
        />
      )}
      {currentPhase === 4 && !phases.guided && (
        <PhasePlaceholder
          phase={4}
          onBack={() => setCurrentPhase(1)}
        />
      )}
      {currentPhase === 5 && phases.independent && (
        <IndependentPhaseView
          independent={phases.independent}
          onComplete={() => setCurrentPhase("complete")}
        />
      )}
      {currentPhase === 5 && !phases.independent && (
        <PhasePlaceholder
          phase={5}
          onBack={() => setCurrentPhase(1)}
        />
      )}
      {currentPhase === "complete" && (
        <CompletePhaseView topicId={topic.id} />
      )}
    </div>
  );
}

function PhasePlaceholder({
  phase,
  onBack,
}: {
  phase: 2 | 3 | 4 | 5 | "complete";
  onBack: () => void;
}) {
  const label =
    phase === 2
      ? "Phase 2 (Real-life connection) — coming in Step 2b"
      : phase === 3
        ? "Phase 3 (Worked example) — coming in Step 2c"
        : phase === 4
          ? "Phase 4 (Guided practice) — coming in Step 2d"
          : phase === 5
            ? "Phase 5 (Independent practice) — coming in Step 2e"
            : "Lesson complete — coming in Step 2e";

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-8 text-center"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <p
          style={{
            fontSize: "15px",
            color: "#1F2937",
            lineHeight: 1.6,
            marginBottom: "20px",
          }}
        >
          {label}
        </p>
        <button
          onClick={onBack}
          className="px-8 py-3 rounded-lg transition-colors"
          style={{
            backgroundColor: "#0F2A4A",
            color: "#FFFFFF",
            fontSize: "15px",
          }}
        >
          Back to Phase 1
        </button>
      </div>
    </div>
  );
}
