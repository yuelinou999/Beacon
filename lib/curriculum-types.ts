// Legacy import shim. All shared types moved to `lib/types.ts` as the single
// source of truth. This module re-exports them so existing import paths keep
// resolving. Prefer importing from `@/lib/types` in new code.

export type {
  // Phase content
  VisualHint,
  ConceptPhaseContent,
  AnalogyPhaseContent,
  MathSegment,
  ExampleStep,
  ExamplePhaseContent,
  GuidedSubStepChoice,
  GuidedSubStepNumber,
  GuidedSubStep,
  GuidedPhaseContent,
  IndependentQuestion,
  IndependentPhaseContent,
  TopicPhases,
  // Quiz bank
  QuizSkill,
  QuizQuestion,
  QuizBank,
  // Practice bank (static, fixed in curriculum.json)
  PracticeBankQuestion,
  PracticeBank,
  // Topic
  CurriculumTopic,
  // Legacy alias — `TopicWithPhases` is the merged `CurriculumTopic`.
  CurriculumTopic as TopicWithPhases,
} from "./types";

export { isTopicStub } from "./types";
