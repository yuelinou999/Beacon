// Tier-1 (full content) and Tier-2 (stub variants) phases shape.
// Tier-3 topics have phases: { stub: true } and are not played in lessons.

export type VisualHint = "balance_scale" | "number_line" | "grid" | "none";

export interface ConceptPhaseContent {
  title: string;
  explanation: string;
  key_idea: string;
  visual: { type: VisualHint; left?: string; right?: string };
  main_equation?: string;
}

// Add other phase types in 2b/c/d/e — keep this file growing.
// For now we also need a discriminator so the page can detect stubs.
export type TopicPhases =
  | { stub: true }
  | {
      concept: ConceptPhaseContent;
      // Other phases will be added in subsequent steps; for now treat them
      // as unknown so reading topic.phases doesn't break TS:
      analogy?: unknown;
      example?: unknown;
      guided?: unknown;
      independent?: unknown;
    };

export interface TopicWithPhases {
  id: string;
  title: { en: string; zh: string };
  prerequisite: string | null;
  difficulty_base: number;
  unit_id: string;
  phases?: TopicPhases;
}

export function isTopicStub(
  phases: TopicPhases | undefined,
): phases is { stub: true } {
  return phases !== undefined && "stub" in phases && phases.stub === true;
}
