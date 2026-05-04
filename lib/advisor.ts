// Deterministic readiness analyzer for the AI advisor flow.
//
// Pure function over (profile, target unit). Computes a verdict + gap
// breakdown from curriculum.units[].prerequisites and the student's
// per-topic mastery. The verdict and gaps are AUTHORITATIVE — they ship to
// the UI immediately on advisor click. /api/advisor is then asked to
// narrate this same analysis in personalized prose, but the LLM never
// recomputes the verdict.
//
// Per codex round-1 review:
//   - "unit-level gating, topic-level evidence" — verdict looks at unit
//     completion, gaps list specific topics within incomplete prereq
//     units so the student knows WHAT to review.
//   - LLM-as-narrator stance — keeps the system auditable, demoable,
//     and instant (verdict shows before Gemma even loads).

import { getUnits, getTopicsForUnit } from "./curriculum";
import { getTopicProgress } from "./progress";
import type {
  AdvisorAnalysis,
  AdvisorPrereqStatus,
  AdvisorVerdict,
  StudentProfile,
} from "./types";

// Mastery thresholds — mirrors lib/progress.ts:deriveTopicStatus and the
// subject-page MASTERY_STRONG constant so verdicts agree with the unit
// status pills the user already sees.
const MASTERY_COMPLETED = 0.7; // unit.avgMastery >= this → "completed"
const MASTERY_IN_PROGRESS = 0.4; // unit.avgMastery >= this → "in_progress"

// How many low-mastery topics to surface per incomplete prereq unit as
// concrete review targets.
const WEAKEST_TOPICS_LIMIT = 3;

export function analyzeReadiness(
  profile: StudentProfile | null,
  targetUnitId: string,
): AdvisorAnalysis {
  const units = getUnits();
  const targetUnit = units.find((u) => u.id === targetUnitId);

  // Defensive — unknown unit id shouldn't happen via the UI, but the
  // analyzer should still return a coherent shape rather than throw.
  if (!targetUnit) {
    return {
      targetUnitId,
      targetUnitTitle: targetUnitId,
      verdict: "ready",
      prerequisites: [],
      noPrereqs: true,
    };
  }

  // No prereqs → trivially ready.
  if (targetUnit.prerequisites.length === 0) {
    return {
      targetUnitId,
      targetUnitTitle: targetUnit.title,
      verdict: "ready",
      prerequisites: [],
      noPrereqs: true,
    };
  }

  const prerequisites: AdvisorPrereqStatus[] = targetUnit.prerequisites.map(
    (prereqId) => {
      const prereqUnit = units.find((u) => u.id === prereqId);
      const prereqTopics = getTopicsForUnit(prereqId);

      if (!prereqUnit || prereqTopics.length === 0) {
        // Unknown prereq id, or unit exists but has no topics — treat as
        // not-started. Should not happen in healthy curriculum, but we
        // don't want a single bad reference to crash the analyzer.
        return {
          unitId: prereqId,
          unitTitle: prereqUnit?.title ?? prereqId,
          avgMastery: 0,
          status: "not_started" as const,
          weakestTopics: [],
        };
      }

      // Per-topic mastery, then unit-level avg.
      const topicMasteries = prereqTopics.map((t) => ({
        topicId: t.id,
        topicTitle: t.title.en,
        mastery: profile ? getTopicProgress(profile, t.id).mastery : 0,
      }));

      const avgMastery =
        topicMasteries.reduce((sum, t) => sum + t.mastery, 0) /
        topicMasteries.length;

      let status: AdvisorPrereqStatus["status"];
      if (avgMastery >= MASTERY_COMPLETED) status = "completed";
      else if (avgMastery >= MASTERY_IN_PROGRESS) status = "in_progress";
      else status = "not_started";

      // Sort ascending by mastery so weakestTopics surfaces the genuine
      // review priorities. Limit to top-N to keep the gap card compact.
      const weakestTopics = topicMasteries
        .slice()
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, WEAKEST_TOPICS_LIMIT);

      return {
        unitId: prereqId,
        unitTitle: prereqUnit.title,
        avgMastery,
        status,
        weakestTopics,
      };
    },
  );

  // Verdict aggregation:
  //   - all prereqs completed         → ready
  //   - any prereq not_started        → needs_review
  //   - otherwise (mix of completed + in_progress) → almost_ready
  const allCompleted = prerequisites.every((p) => p.status === "completed");
  const anyNotStarted = prerequisites.some((p) => p.status === "not_started");

  let verdict: AdvisorVerdict;
  if (allCompleted) verdict = "ready";
  else if (anyNotStarted) verdict = "needs_review";
  else verdict = "almost_ready";

  return {
    targetUnitId,
    targetUnitTitle: targetUnit.title,
    verdict,
    prerequisites,
    noPrereqs: false,
  };
}
