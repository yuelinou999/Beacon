// Single source of truth for "what unit + topic should the student be
// working on right now?"
//
// Three module entry points (sidebar Learn, home Continue CTA, subject
// Start Unit) used to resolve this independently — and diverged. Sidebar
// Learn was hardcoded to solving_one_step; home read profile.current_unit
// with a fallback chain; subject CTA used per-unit local logic. A fresh
// profile would land in three different topics depending on which entry
// point the user clicked.
//
// This module collapses all three to one pure helper. profile.current_unit
// is the persistent root; the topic within that unit is derived (no
// separate persistent current_topic field — that drifts against actual
// progress as the student advances). Callers that need to CHANGE the
// active unit go through lib/progress.ts:setCurrentUnit, which is the
// only blessed write path.

import { getTopicsForUnit, getUnits } from "./curriculum";
import { getTopicProgress } from "./progress";
import { DEMO_UNIT_ID } from "./demo-targets";
import type { CurriculumTopic, StudentProfile } from "./types";

export interface ActiveStudyTarget {
  unitId: string;
  topicId: string;
  topic: CurriculumTopic;
  // True if the resolution had to fall back from the profile's requested
  // current_unit (e.g. unit was renamed away, or current_unit pointed at a
  // unit with no topics). Callers can use this to show a soft notice or
  // log a warning. The fallback is silent at runtime — never throws.
  fellBack: boolean;
}

export function resolveActiveStudyTarget(
  profile: StudentProfile | null,
): ActiveStudyTarget {
  const requestedUnitId = profile?.current_unit || DEMO_UNIT_ID;
  let unitId = requestedUnitId;
  let unitTopics = getTopicsForUnit(unitId);
  let fellBack = false;

  // ── Unit fallback chain ────────────────────────────
  if (unitTopics.length === 0) {
    fellBack = true;
    const units = getUnits();
    // Prefer a unit the student has progress in (not the literal default).
    const unitWithProgress = units.find((u) =>
      u.topics.some((tid) => (profile?.topics?.[tid]?.mastery ?? 0) > 0),
    );
    unitId = unitWithProgress?.id ?? DEMO_UNIT_ID;
    unitTopics = getTopicsForUnit(unitId);

    // Last-resort: any unit with topics. Curriculum regression — should
    // never happen in practice but cheaper than crashing the home page.
    if (unitTopics.length === 0) {
      const anyUnit = units.find((u) => getTopicsForUnit(u.id).length > 0);
      if (anyUnit) {
        unitId = anyUnit.id;
        unitTopics = getTopicsForUnit(unitId);
      }
    }
  }

  // ── Topic resolution within the (resolved) unit ────
  // Priority: in-progress > untouched > first.
  const ranked = unitTopics.map((topic) => ({
    topic,
    mastery: profile ? getTopicProgress(profile, topic.id).mastery : 0,
  }));

  const chosen =
    ranked.find((r) => r.mastery > 0 && r.mastery < 0.7) ||
    ranked.find((r) => r.mastery === 0) ||
    ranked[0];

  if (!chosen) {
    // Curriculum has no topics anywhere — extreme regression. Find the
    // first topic in any unit as a stable last-ditch return so callers
    // never receive an undefined target.
    const anywhere = getUnits().flatMap((u) => getTopicsForUnit(u.id))[0];
    if (anywhere) {
      return {
        unitId: anywhere.unit_id,
        topicId: anywhere.id,
        topic: anywhere,
        fellBack: true,
      };
    }
    throw new Error("Beacon: curriculum has no topics");
  }

  return {
    unitId,
    topicId: chosen.topic.id,
    topic: chosen.topic,
    fellBack,
  };
}
