// Cross-route shared types + helpers for "what language should this AI
// surface respond in?" Used by /api/explain, /api/advisor, /api/suggestions
// system prompts and by the page-side callers that pass `language` to
// those routes.
//
// Distinct from TranslateTargetLanguage in lib/types.ts — that type
// covers translation FROM English TO another language for the
// BilingualSubtitle component (so it doesn't include "en"). This type
// covers all valid AI-output languages including "en", which is what
// the LLM mirror surfaces actually want.
//
// The resolver (resolveLearnerOutputLanguage) is pure — it takes
// bilingualOn / secondLang as inputs rather than reading them itself
// so this module stays server-safe (no "use client" import chain).

import type { StudentProfile } from "./types";

export type LearnerLanguage = "en" | "zh" | "hi" | "es" | "sw" | "fr" | "ar";

// Names used in LLM prompts ("Respond in {name}.") — must read naturally
// to a model trained on English. Keep these in English even when the
// target language is non-English; the model outputs in the target.
export const LEARNER_LANGUAGE_NAMES: Record<LearnerLanguage, string> = {
  en: "English",
  zh: "Simplified Chinese",
  hi: "Hindi",
  es: "Spanish",
  sw: "Swahili",
  fr: "French",
  ar: "Arabic",
};

const VALID_LANGS: readonly LearnerLanguage[] = Object.keys(
  LEARNER_LANGUAGE_NAMES,
) as LearnerLanguage[];

export function isLearnerLanguage(s: unknown): s is LearnerLanguage {
  return typeof s === "string" && (VALID_LANGS as readonly string[]).includes(s);
}

// Decide which language an AI response should be in. Honors bilingual
// mode's second-language pick when set; otherwise falls back to the
// student's primary profile language ("en" by default).
//
// Caller is responsible for reading bilingualOn + secondLang from
// whatever runtime mechanism is appropriate (settings-modal helpers
// on the client, no-op on server). This function is pure.
export function resolveLearnerOutputLanguage(args: {
  profile: StudentProfile | null;
  bilingualOn: boolean;
  secondLang: string;
}): LearnerLanguage {
  if (args.bilingualOn && isLearnerLanguage(args.secondLang)) {
    return args.secondLang;
  }
  const primary = args.profile?.language;
  return primary === "zh" ? "zh" : "en";
}

// Build the "Respond in X" suffix for an English-instruction system
// prompt. Returns empty string for "en" so prompts stay byte-identical
// to their pre-multilingual versions when the student is on English.
export function buildLanguageSuffix(lang: LearnerLanguage): string {
  if (lang === "en") return "";
  const name = LEARNER_LANGUAGE_NAMES[lang];
  return ` Respond in ${name}. Math notation (numbers, equations, LaTeX) stays the same regardless of language.`;
}
