import { ollamaToolChat } from "@/lib/ollama";
import { OLLAMA_MODEL, OLLAMA_URL } from "@/lib/config";
import type { OllamaMessage, StudentProfile } from "@/lib/types";

// ── Schema (do not collapse fields) ────────────────────────

export type Confidence = "high" | "medium" | "low";
export type TrendDirection = "rising" | "falling" | "stable";

export interface PortraitInsight {
  observation: string;
  evidence: string;
}

export interface PortraitInsightWithDirection extends PortraitInsight {
  direction: TrendDirection;
}

export interface PortraitProfileCard {
  label: string;
  description: string;
}

export interface PortraitSuggestion {
  suggestion: string;
  rationale: string;
}

export interface PortraitQuickFact {
  icon_hint: string;
  label: string;
}

export interface PortraitBody {
  headline: {
    narrative: string;
    analytical: string;
  };
  insights: {
    where_time_goes: PortraitInsight;
    under_difficulty: PortraitInsight;
    independence_trend: PortraitInsightWithDirection;
  };
  profile: {
    learning_style: PortraitProfileCard;
    interests: PortraitProfileCard;
  };
  suggestions: PortraitSuggestion[];
  quick_facts: PortraitQuickFact[];
  confidence: {
    level: Confidence;
    reason: string;
  };
}

export interface PortraitResponse {
  thinking: string;
  portrait: PortraitBody;
  meta: {
    model: string;
    duration_ms: number;
    profile_snapshot_size: number;
  };
}

export class PortraitValidationError extends Error {
  constructor(public missing: string[], public rawContent: string) {
    super(
      `Portrait response missing required keys: ${missing.join(", ")}. ` +
        `Raw model content (first 500 chars): ${rawContent.slice(0, 500)}`,
    );
    this.name = "PortraitValidationError";
  }
}

export class PortraitParseError extends Error {
  constructor(public rawContent: string, public parseDetail: string) {
    super(
      `Failed to JSON.parse model response. Detail: ${parseDetail}. ` +
        `Raw content (first 500 chars): ${rawContent.slice(0, 500)}`,
    );
    this.name = "PortraitParseError";
  }
}

// ── Prompt ─────────────────────────────────────────────────

const SCHEMA_DESCRIPTION = `{
  "headline": {
    "narrative": "string — 2nd person, warm tone, ~3-4 sentences. Speak directly to the student (\\"You ...\\")",
    "analytical": "string — 3rd person, clinical tone, ~3-4 sentences. (\\"This student ...\\")"
  },
  "insights": {
    "where_time_goes":     { "observation": "string ≤2 sentences", "evidence": "string ≤2 sentences citing specific data points" },
    "under_difficulty":    { "observation": "string ≤2 sentences", "evidence": "string ≤2 sentences" },
    "independence_trend":  { "observation": "string ≤2 sentences", "evidence": "string ≤2 sentences", "direction": "rising | falling | stable" }
  },
  "profile": {
    "learning_style": { "label": "short label, e.g. 'procedural' or 'exploratory'", "description": "1-2 sentence description" },
    "interests":      { "label": "short label", "description": "1-2 sentence description" }
  },
  "suggestions": [
    { "suggestion": "specific action", "rationale": "why, citing data" }
    /* 2-3 items total */
  ],
  "quick_facts": [
    { "icon_hint": "one of: time | streak | accuracy | topic | mistake | session", "label": "short factual phrase" }
    /* 3-5 items total */
  ],
  "confidence": {
    "level": "high | medium | low",
    "reason": "string — why this level"
  }
}`;

export function buildPortraitPrompt(profile: StudentProfile): {
  system: string;
  user: string;
} {
  const system =
    "You are a thoughtful learning analyst. Your job is to read a single " +
    "student's actual learning data and produce a structured JSON portrait " +
    "describing who this student is as a learner.\n\n" +
    "OUTPUT FORMAT — return ONLY a single JSON object. No prose before or " +
    "after. No markdown code fences. The object must conform exactly to this " +
    "schema:\n\n" +
    SCHEMA_DESCRIPTION +
    "\n\n" +
    "CRITICAL — independence_trend.direction is REQUIRED. " +
    "If the data is sparse and you cannot determine a trend, you MUST still " +
    "return direction: \"stable\" and explain in evidence that there is not " +
    "enough data to detect a trend. Never omit direction.\n\n" +
    "CRITICAL — confidence calibration:\n" +
    "If the data is sparse (few attempts, few sessions, no wrong answers, " +
    "mostly zero mastery), you MUST set confidence.level to \"low\" and " +
    "explain in confidence.reason that you do not have enough data yet. " +
    "Do NOT invent specific behaviors that aren't supported by the data. " +
    "It is better to say \"too few sessions to know\" than to fabricate a " +
    "learning style. " +
    "Required fields are required regardless of data sparsity. If unsure, " +
    "use the most neutral allowed value (e.g. direction: \"stable\", " +
    "level: \"low\") and explain the uncertainty in the corresponding " +
    "reason or evidence field.\n\n" +
    "TONE rules (mandatory):\n" +
    "- headline.narrative: 2nd person, warm. Speak directly to the student.\n" +
    "- headline.analytical: 3rd person, clinical. Refer to \"this student\".\n\n" +
    "LENGTH rules:\n" +
    "- headline.narrative and headline.analytical: ~3-4 sentences each.\n" +
    "- observation and evidence fields: ≤2 sentences each.\n" +
    "- profile.*.description: 1-2 sentences.\n\n" +
    "Return only the JSON object.";

  const snapshot = JSON.stringify(profile, null, 2);
  const user =
    "STUDENT PROFILE (raw JSON):\n\n" +
    snapshot +
    "\n\nGenerate the portrait JSON for this student now.";

  return { system, user };
}

// ── Parsing helpers ────────────────────────────────────────

function stripCodeFence(text: string): string {
  let t = text.trim();
  // ```json ... ``` or ``` ... ```
  if (t.startsWith("```")) {
    const firstNewline = t.indexOf("\n");
    if (firstNewline !== -1) {
      t = t.slice(firstNewline + 1);
    }
    if (t.endsWith("```")) {
      t = t.slice(0, -3);
    }
    t = t.trim();
  }
  return t;
}

const REQUIRED_TOP_KEYS = [
  "headline",
  "insights",
  "profile",
  "suggestions",
  "quick_facts",
  "confidence",
] as const;

const VALID_DIRECTIONS: TrendDirection[] = ["rising", "falling", "stable"];
const VALID_LEVELS: Confidence[] = ["high", "medium", "low"];

const DEFAULT_LEARNING_STYLE: PortraitProfileCard = {
  label: "undetermined",
  description: "Not enough data to determine learning style.",
};
const DEFAULT_INTERESTS: PortraitProfileCard = {
  label: "unknown",
  description: "Not enough data to determine interests.",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isStr(v: unknown): v is string {
  return typeof v === "string";
}
function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Strict for the demo centerpiece (headline / insights / confidence) —
 * throws PortraitValidationError if any of those is missing or wrong type.
 * Lenient for decorative fields (profile / suggestions / quick_facts) —
 * auto-fills with a neutral default and emits a single console.warn so the
 * drift is visible in dev/demo logs without crashing the page.
 *
 * Exported so the manual loud-fail probe can exercise it directly.
 */
export function validate(obj: unknown, raw: string): PortraitBody {
  if (!isObj(obj)) {
    throw new PortraitValidationError([...REQUIRED_TOP_KEYS], raw);
  }
  const missing = REQUIRED_TOP_KEYS.filter((k) => !(k in obj));
  if (missing.length > 0) {
    throw new PortraitValidationError(missing, raw);
  }

  // ── Core checks: collect all errors, then throw once ──────
  const errors: string[] = [];

  const headline = obj.headline;
  if (!isObj(headline)) {
    errors.push("headline (must be object)");
  } else {
    if (!isNonEmptyStr(headline.narrative)) {
      errors.push("headline.narrative (non-empty string)");
    }
    if (!isNonEmptyStr(headline.analytical)) {
      errors.push("headline.analytical (non-empty string)");
    }
  }

  const insights = obj.insights;
  if (!isObj(insights)) {
    errors.push("insights (must be object)");
  } else {
    for (const key of [
      "where_time_goes",
      "under_difficulty",
      "independence_trend",
    ] as const) {
      const v = insights[key];
      if (!isObj(v)) {
        errors.push(`insights.${key} (must be object)`);
        continue;
      }
      if (!isStr(v.observation)) {
        errors.push(`insights.${key}.observation (string)`);
      }
      if (!isStr(v.evidence)) {
        errors.push(`insights.${key}.evidence (string)`);
      }
    }
  }

  const confidence = obj.confidence;
  if (!isObj(confidence)) {
    errors.push("confidence (must be object)");
  } else {
    if (!isStr(confidence.level) || !VALID_LEVELS.includes(confidence.level as Confidence)) {
      errors.push(
        `confidence.level (must be one of ${VALID_LEVELS.join(" | ")})`,
      );
    }
    if (!isStr(confidence.reason)) {
      errors.push("confidence.reason (string)");
    }
  }

  if (errors.length > 0) {
    throw new PortraitValidationError(errors, raw);
  }

  // ── Decorative coercions (auto-fill + warn) ───────────────
  // direction
  const indep = (insights as Record<string, unknown>).independence_trend as
    Record<string, unknown>;
  const direction = indep.direction;
  if (!isStr(direction)) {
    console.warn(
      "[portrait] auto-filled missing field: insights.independence_trend.direction",
    );
    indep.direction = "stable";
  } else if (!VALID_DIRECTIONS.includes(direction as TrendDirection)) {
    console.warn(
      `[portrait] auto-filled missing field: insights.independence_trend.direction (was invalid value ${JSON.stringify(direction)})`,
    );
    indep.direction = "stable";
  }

  // profile
  if (!isObj(obj.profile)) {
    console.warn("[portrait] auto-filled missing field: profile");
    obj.profile = {
      learning_style: { ...DEFAULT_LEARNING_STYLE },
      interests: { ...DEFAULT_INTERESTS },
    };
  } else {
    const profile = obj.profile as Record<string, unknown>;
    if (!isObj(profile.learning_style)) {
      console.warn(
        "[portrait] auto-filled missing field: profile.learning_style",
      );
      profile.learning_style = { ...DEFAULT_LEARNING_STYLE };
    }
    if (!isObj(profile.interests)) {
      console.warn("[portrait] auto-filled missing field: profile.interests");
      profile.interests = { ...DEFAULT_INTERESTS };
    }
  }

  // suggestions
  if (
    !Array.isArray(obj.suggestions) ||
    (obj.suggestions as unknown[]).length === 0
  ) {
    console.warn("[portrait] auto-filled missing field: suggestions");
    obj.suggestions = [];
  }

  // quick_facts
  if (
    !Array.isArray(obj.quick_facts) ||
    (obj.quick_facts as unknown[]).length === 0
  ) {
    console.warn("[portrait] auto-filled missing field: quick_facts");
    obj.quick_facts = [];
  }

  return obj as unknown as PortraitBody;
}

// ── Generator ──────────────────────────────────────────────

interface RawChatLikeResponse {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  model?: string;
}

async function callOllamaToolChatNoTools(
  messages: OllamaMessage[],
): Promise<RawChatLikeResponse> {
  // Try the existing wrapper with no tools. If Ollama rejects an empty tools
  // array, fall back to a direct fetch (the same shape used by the spike).
  try {
    return (await ollamaToolChat(messages, [])) as RawChatLikeResponse;
  } catch (err) {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Ollama portrait request failed (after wrapper failed too): ` +
          `wrapper=${err instanceof Error ? err.message : String(err)}; ` +
          `direct=${res.status} ${errText}`,
      );
    }
    return (await res.json()) as RawChatLikeResponse;
  }
}

export async function generatePortrait(
  profile: StudentProfile,
): Promise<PortraitResponse> {
  const { system, user } = buildPortraitPrompt(profile);
  const messages: OllamaMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const start = Date.now();
  const raw = await callOllamaToolChatNoTools(messages);
  const durationMs = Date.now() - start;

  const content = raw.message?.content ?? "";
  const thinking = raw.message?.thinking ?? "";
  const modelReturned = raw.model ?? OLLAMA_MODEL;

  const cleaned = stripCodeFence(content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new PortraitParseError(
      content,
      e instanceof Error ? e.message : String(e),
    );
  }

  const portrait = validate(parsed, content);

  return {
    thinking,
    portrait,
    meta: {
      model: modelReturned,
      duration_ms: durationMs,
      profile_snapshot_size: Buffer.byteLength(
        JSON.stringify(profile),
        "utf8",
      ),
    },
  };
}
