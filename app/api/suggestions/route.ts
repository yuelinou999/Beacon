import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import {
  buildLanguageSuffix,
  isLearnerLanguage,
  type LearnerLanguage,
} from "@/lib/learner-language";

interface SuggestionsRequest {
  page: "home" | "learn" | "practice" | "general" | "quiz";
  currentTopicName?: string;
  topicMasteries?: Array<{ name: string; mastery: number }>;
  recentWrongAnswers?: string[];
  // Output language for the suggestion strings. When set to a non-en
  // value, Gemma renders the suggestion chips in that language so a
  // bilingual-mode student doesn't see English chips next to their
  // multilingual chat output. Optional — defaults to "en".
  language?: LearnerLanguage;
}

const FALLBACK_SUGGESTIONS: Record<string, string[]> = {
  home: [
    "What should I study next?",
    "Which topics am I weakest in?",
    "Give me a quick warm-up quiz",
    "Explain my progress",
  ],
  learn: [
    "Can you explain this differently?",
    "Show me another example",
    "Why does this rule work?",
    "I'm confused — help me understand",
  ],
  practice: [
    "Help me with this question",
    "Why was my answer wrong?",
    "Give me a hint",
    "Explain the solution step by step",
  ],
  general: [
    "What should I review first?",
    "How am I doing overall?",
    "Quiz me on my weak topics",
    "Help me study",
  ],
};

export async function POST(req: NextRequest) {
  try {
    const body: SuggestionsRequest = await req.json();
    const { page, currentTopicName, topicMasteries, recentWrongAnswers } = body;
    const lang: LearnerLanguage = isLearnerLanguage(body.language)
      ? body.language
      : "en";

    const completed = topicMasteries?.filter((t) => t.mastery >= 0.3) || [];
    const current = currentTopicName || "linear equations";
    const wrongSample = recentWrongAnswers?.slice(0, 2).join("; ") || "";

    // System prompt stays English for instruction reliability; the suffix
    // tells Gemma to write the OUTPUT strings (each suggestion chip) in
    // the learner's chosen language. JSON array shape is unchanged so the
    // existing parser keeps working.
    const systemPrompt =
      `Based on this student's learning progress, generate exactly 4 short practice questions or discussion prompts. Each should be under 15 words. Mix question types: one review question from a completed topic, one about the current topic, one common confusion point, one fun or curious question. Return ONLY a JSON array of 4 strings. No numbering, no labels, no explanation.` +
      buildLanguageSuffix(lang);

    const userContent = `Page: ${page}
Current topic: ${current}
Completed topics: ${completed.map((t) => `${t.name} (${(t.mastery * 100).toFixed(0)}%)`).join(", ") || "none yet"}
${wrongSample ? `Recent wrong answers: ${wrongSample}` : ""}`;

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        stream: false,
      }),
    });

    if (!ollamaRes.ok) {
      return Response.json({ suggestions: FALLBACK_SUGGESTIONS[page] || FALLBACK_SUGGESTIONS.general });
    }

    const data = await ollamaRes.json();
    const content = data.message?.content?.trim() || "";

    // Try to parse JSON array from the response
    try {
      // Find JSON array in the response (model might add explanation text around it)
      const match = content.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          return Response.json({ suggestions: parsed.slice(0, 4).map((s: unknown) => String(s)) });
        }
      }
    } catch { /* fallback below */ }

    return Response.json({ suggestions: FALLBACK_SUGGESTIONS[page] || FALLBACK_SUGGESTIONS.general });
  } catch (err) {
    console.error("Suggestions API error:", err);
    return Response.json({ suggestions: FALLBACK_SUGGESTIONS.general });
  }
}
