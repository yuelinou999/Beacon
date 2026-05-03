import type { CurriculumTopic } from "./types";
import curriculumData from "@/data/curriculum.json";

// ── Types for the new nested curriculum structure ──────

export interface CurriculumUnit {
  id: string;
  number: number;
  title: string;
  description: string;
  skills: string[];
  estimated_lessons: number;
  estimated_hours: number;
  prerequisites: string[];
  topics: string[]; // topic IDs
}

export interface GradeCurriculum {
  id: string;
  title: string;
  summary: string;
  description: string;
  estimated_lessons: number;
  estimated_hours: number;
  who_its_for: string;
  units: CurriculumUnit[];
}

// ── Access helpers ────────────────────────────────────

/** Get the full flat topic list (backward compat — used by all existing pages).
 *
 * The `as unknown as CurriculumTopic[]` cast is unavoidable: TypeScript's
 * `resolveJsonModule` widens literal types when reading curriculum.json
 * (e.g. `stub: true` → `stub: boolean`, `visual.type: "balance_scale"` →
 * `string`), so the inferred shape is not assignable to the discriminated
 * union `TopicPhases`. The on-disk data IS valid `CurriculumTopic[]`; the
 * cast just tells TS to trust it. Localized here so consumers don't repeat
 * it. */
export function getAllTopics(): CurriculumTopic[] {
  return curriculumData.topics as unknown as CurriculumTopic[];
}

/** Get the Grade 7 curriculum structure */
export function getGrade7(): GradeCurriculum {
  return (curriculumData as Record<string, unknown>).grades
    ? ((curriculumData as Record<string, unknown>).grades as Record<string, GradeCurriculum>)["7"]
    : null as unknown as GradeCurriculum;
}

/** Get all units for a grade */
export function getUnits(grade: string = "7"): CurriculumUnit[] {
  const grades = (curriculumData as Record<string, unknown>).grades as Record<string, GradeCurriculum> | undefined;
  return grades?.[grade]?.units || [];
}

/** Get a single unit by ID */
export function getUnit(unitId: string): CurriculumUnit | undefined {
  return getUnits().find((u) => u.id === unitId);
}

/** Get topics for a specific unit (full topic objects) */
export function getTopicsForUnit(unitId: string): CurriculumTopic[] {
  const unit = getUnit(unitId);
  if (!unit) return [];
  const allTopics = getAllTopics();
  return unit.topics
    .map((tid) => allTopics.find((t) => t.id === tid))
    .filter((t): t is CurriculumTopic => t !== undefined);
}

/** Find which unit a topic belongs to */
export function getUnitForTopic(topicId: string): CurriculumUnit | undefined {
  return getUnits().find((u) => u.topics.includes(topicId));
}
