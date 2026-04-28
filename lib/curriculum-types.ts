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

export interface AnalogyPhaseContent {
  title: string;
  scenario: string;
  illustration_hint: string;
  question: string;
  options: [number, number, number];
  correct: number;
  feedback_correct: string;
  feedback_incorrect: string;
}

export interface MathSegment {
  text: string;
  highlight?: boolean;
}

export interface ExampleStep {
  math: string | MathSegment[];
  explanation: string;
}

export interface ExamplePhaseContent {
  title: string;
  problem: string;
  steps: ExampleStep[];
}

export interface GuidedSubStepChoice {
  question: string;
  type: "choice";
  options: [string, string, string];
  correct: string;
  feedback_correct: string;
  feedback_wrong: string;
}

export interface GuidedSubStepNumber {
  question: string;
  type: "number";
  correct: number;
  feedback_correct: string;
  feedback_wrong: string;
}

export type GuidedSubStep = GuidedSubStepChoice | GuidedSubStepNumber;

export interface GuidedPhaseContent {
  title: string;
  problem: string;
  sub_steps: [GuidedSubStep, GuidedSubStep, GuidedSubStep];
}

export interface IndependentQuestion {
  equation: string;
  answer: number;
}

export interface IndependentPhaseContent {
  title: string;
  questions: [IndependentQuestion, IndependentQuestion, IndependentQuestion];
}

// All five phase content types are now defined.
export type TopicPhases =
  | { stub: true }
  | {
      concept: ConceptPhaseContent;
      analogy?: AnalogyPhaseContent;
      example?: ExamplePhaseContent;
      guided?: GuidedPhaseContent;
      independent?: IndependentPhaseContent;
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
