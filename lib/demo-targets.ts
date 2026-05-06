// Single source of truth for "where do we send the student when their
// requested target has no authored content yet?"
//
// The curriculum currently ships exactly ONE fully-authored unit
// (unit_6_equations: 7 topics with phases, 84 practice questions, 94
// alt_explanations) and ONE quiz bank (solving_one_step inside that
// unit, 10 quiz questions). Every demo-fallback path in the app
// converges on these constants, so the product story stays
// consistent and a future curriculum push only needs to flip these
// values (or, at scale, replace them with derived helpers — "first
// fully-authored unit" / "first topic carrying a quiz bank" / etc.).
//
// Consumers today:
//   - lib/active-target.ts:resolveActiveStudyTarget — DEMO_UNIT_ID
//     as the fallback when profile.current_unit is null/unknown.
//   - app/learn-v2/[topicId]/page.tsx — DEMO_UNIT_ID + DEMO_LABEL
//     for the stub-topic shell's "Try {label} →" CTA.
//   - app/quiz/page.tsx — DEMO_TOPIC_ID + DEMO_LABEL for the
//     no-quiz shell's "Try {label} Quiz →" CTA.
//   - components/sidebar.tsx — DEMO_TOPIC_ID for the Quiz href
//     fallback when the active topic has no quiz bank.
//   - app/practice/page.tsx — DEMO_TOPIC_ID as the last-ditch
//     defaultTopicId fallback.
//
// Not for general "current course" or "active topic" questions — use
// resolveActiveStudyTarget(profile) for that. These constants are
// strictly the demo-fallback layer beneath it.

// The currently fully-authored unit.
export const DEMO_UNIT_ID = "unit_6_equations";

// The canonical demo topic — has the only practice + quiz banks in
// the curriculum today. Same string as the unit's first authored
// topic, but conceptually "the demo lesson" not "the demo unit's
// first topic" — keep the two constants distinct so the semantic
// stays legible if either ever shifts.
export const DEMO_TOPIC_ID = "solving_one_step";

// Human-readable label for the demo unit. Used as the noun in CTA
// copy across the stub fallback shells (`Try Solving Equations →`,
// `Try Solving Equations Quiz →`). Same label covers both the unit
// and its canonical topic since "Solving Equations" is the topic's
// pedagogical scope as well.
export const DEMO_LABEL = "Solving Equations";
