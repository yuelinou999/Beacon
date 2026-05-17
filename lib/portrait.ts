import { OLLAMA_MODEL, OLLAMA_URL } from "@/lib/config";
import { PORTRAIT_JSON_SCHEMA } from "@/lib/portrait-schema";
import type { OllamaMessage, StudentProfile } from "@/lib/types";

// ── Schema (do not collapse fields) ────────────────────────

export type Confidence = "high" | "medium" | "low";
export type TrendDirection = "rising" | "falling" | "stable";

// ── New visualization-data types (D3-pre, all optional in PortraitBody) ──

export interface SubjectTimeBreakdown {
  subject: string;
  percentage: number;
}

export interface DifficultyBehaviorPattern {
  trigger: string;
  reaction: string;
}

export interface ModalityScore {
  modality: string;
  score: number;
}

export interface EmergingPattern {
  trend: TrendDirection;
  description: string;
}

export interface PortraitMetadata {
  interaction_count: number;
  session_count: number;
  updated_label: string;
}

// ── Insight shapes ──────────────────────────────────────────

export interface PortraitInsight {
  observation: string;
  evidence: string;
}

export interface PortraitInsightWithBreakdown extends PortraitInsight {
  breakdown?: SubjectTimeBreakdown[];
}

export interface PortraitInsightWithBehaviorPattern extends PortraitInsight {
  behavior_pattern?: DifficultyBehaviorPattern[];
}

export interface PortraitInsightWithDirection extends PortraitInsight {
  direction: TrendDirection;
  weekly_values?: number[];
}

export interface PortraitProfileCard {
  label: string;
  description: string;
  modality_scores?: ModalityScore[];
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
    where_time_goes: PortraitInsightWithBreakdown;
    under_difficulty: PortraitInsightWithBehaviorPattern;
    independence_trend: PortraitInsightWithDirection;
  };
  profile: {
    learning_style: PortraitProfileCard;
    emerging_patterns?: EmergingPattern[];
  };
  suggestions: PortraitSuggestion[];
  quick_facts: PortraitQuickFact[];
  confidence: {
    level: Confidence;
    reason: string;
  };
  metadata?: PortraitMetadata;
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
    "where_time_goes": {
      "observation": "string ≤2 sentences",
      "evidence":    "string ≤2 sentences citing specific data points",
      "breakdown":   /* OPTIONAL */ [ { "subject": "Math", "percentage": 70 }, { "subject": "Science", "percentage": 20 }, { "subject": "English", "percentage": 10 } ]
    },
    "under_difficulty": {
      "observation":       "string ≤2 sentences",
      "evidence":          "string ≤2 sentences",
      "behavior_pattern":  /* OPTIONAL */ [ { "trigger": "After 1 mistake", "reaction": "Speeds up" } ]
    },
    "independence_trend": {
      "observation":    "string ≤2 sentences",
      "evidence":       "string ≤2 sentences",
      "direction":      "rising | falling | stable",
      "weekly_values":  /* OPTIONAL */ [ 30, 45, 55, 70 ]   /* exactly 4 numbers, 0-100, oldest → newest */
    }
  },
  "profile": {
    "learning_style":    { "label": "short label, e.g. 'procedural' or 'exploratory'", "description": "1-2 sentence description", "modality_scores": /* OPTIONAL */ [ { "modality": "Try it yourself", "score": 80 }, { "modality": "Guided examples", "score": 60 }, { "modality": "Next-day review", "score": 40 }, { "modality": "Long explanations", "score": 20 } ] },
    "emerging_patterns": /* OPTIONAL */ [ { "trend": "rising | falling | stable", "description": "1 sentence" } ]   /* 0-3 items; replaces the older 'interests' field */
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
  },
  "metadata": { "interaction_count": 0, "session_count": 0, "updated_label": "today | yesterday | 3 days ago | just now" }   /* ALWAYS emit */
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
    "OPTIONAL FIELDS — emit each only if the data supports it. Omit the " +
    "field entirely (do not emit a placeholder) when the condition is not " +
    "met. The validator handles missing optional fields gracefully.\n" +
    "- breakdown (insights.where_time_goes.breakdown): emit only when the " +
    "profile shows at least 2 distinct subjects with measurable time. For a " +
    "math-only profile, OMIT.\n" +
    "- behavior_pattern (insights.under_difficulty.behavior_pattern): emit " +
    "only when there are at least 2 wrong answers logged. For an empty " +
    "wrong_answers array, OMIT.\n" +
    "- weekly_values (insights.independence_trend.weekly_values): emit only " +
    "when there are at least 2 distinct weeks of session data. Otherwise " +
    "OMIT (do NOT emit a flat array of zeros).\n" +
    "- modality_scores (profile.learning_style.modality_scores): emit only " +
    "when there are >=10 logged interactions. Otherwise OMIT.\n" +
    "- emerging_patterns (profile.emerging_patterns): 0-3 items; emit only " +
    "patterns the data actually supports. For sparse data, an empty array " +
    "or omission is the correct answer.\n" +
    "- metadata: ALWAYS emit. interaction_count and session_count are " +
    "derivable from any non-empty profile (count answer_history entries " +
    "and session_logs entries respectively, or 0). updated_label is " +
    "inferred from the most recent session_logs timestamp; for an empty " +
    "profile use \"just now\".\n\n" +
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

// Hard-required: the demo centerpiece. A portrait missing any of these
// has nothing meaningful to show, so validate() throws and the route
// surfaces a clean 500 instead of a broken card. profile / suggestions /
// quick_facts are intentionally NOT here — they are decorative and have
// lenient auto-fill handlers further down, so a sparse (or, on an older
// Ollama that ignores the schema `format`, an incomplete) response still
// renders. PORTRAIT_JSON_SCHEMA makes all keys present in practice; this
// list is the defense-in-depth floor under that, and matches the
// strict/lenient split documented on validate() below.
const REQUIRED_TOP_KEYS = ["headline", "insights", "confidence"] as const;

const VALID_DIRECTIONS: TrendDirection[] = ["rising", "falling", "stable"];
const VALID_LEVELS: Confidence[] = ["high", "medium", "low"];

const DEFAULT_LEARNING_STYLE: PortraitProfileCard = {
  label: "undetermined",
  description: "Not enough data to determine learning style.",
};

const DEFAULT_METADATA: PortraitMetadata = {
  interaction_count: 0,
  session_count: 0,
  updated_label: "just now",
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
function isNumArr(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number" && Number.isFinite(x));
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

  // insights.where_time_goes.breakdown — decorative, type-check only
  const wtg = (insights as Record<string, unknown>).where_time_goes as Record<string, unknown>;
  if ("breakdown" in wtg && !Array.isArray(wtg.breakdown)) {
    console.warn(
      `[portrait] auto-filled missing field: insights.where_time_goes.breakdown (was non-array ${typeof wtg.breakdown})`,
    );
    delete wtg.breakdown;
  }

  // insights.under_difficulty.behavior_pattern — decorative, type-check only
  const ud = (insights as Record<string, unknown>).under_difficulty as Record<string, unknown>;
  if ("behavior_pattern" in ud && !Array.isArray(ud.behavior_pattern)) {
    console.warn(
      `[portrait] auto-filled missing field: insights.under_difficulty.behavior_pattern (was non-array ${typeof ud.behavior_pattern})`,
    );
    delete ud.behavior_pattern;
  }

  // insights.independence_trend.weekly_values — decorative, must be all numbers
  if ("weekly_values" in indep && !isNumArr(indep.weekly_values)) {
    console.warn(
      "[portrait] auto-filled missing field: insights.independence_trend.weekly_values (was non-numeric or non-array)",
    );
    delete indep.weekly_values;
  }

  // profile
  if (!isObj(obj.profile)) {
    console.warn("[portrait] auto-filled missing field: profile");
    obj.profile = {
      learning_style: { ...DEFAULT_LEARNING_STYLE },
    };
  } else {
    const profile = obj.profile as Record<string, unknown>;
    if (!isObj(profile.learning_style)) {
      console.warn(
        "[portrait] auto-filled missing field: profile.learning_style",
      );
      profile.learning_style = { ...DEFAULT_LEARNING_STYLE };
    } else {
      // profile.learning_style.modality_scores — decorative, type-check only
      const ls = profile.learning_style as Record<string, unknown>;
      if ("modality_scores" in ls && !Array.isArray(ls.modality_scores)) {
        console.warn(
          `[portrait] auto-filled missing field: profile.learning_style.modality_scores (was non-array ${typeof ls.modality_scores})`,
        );
        delete ls.modality_scores;
      }
    }
    // profile.emerging_patterns — auto-fill to [] when missing
    if (!Array.isArray(profile.emerging_patterns)) {
      console.warn(
        "[portrait] auto-filled missing field: profile.emerging_patterns",
      );
      profile.emerging_patterns = [];
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

  // metadata — always emit; auto-fill default when missing or wrong shape
  if (!isObj(obj.metadata)) {
    console.warn("[portrait] auto-filled missing field: metadata");
    obj.metadata = { ...DEFAULT_METADATA };
  } else {
    const meta = obj.metadata as Record<string, unknown>;
    if (typeof meta.interaction_count !== "number") {
      console.warn(
        "[portrait] auto-filled missing field: metadata.interaction_count",
      );
      meta.interaction_count = 0;
    }
    if (typeof meta.session_count !== "number") {
      console.warn(
        "[portrait] auto-filled missing field: metadata.session_count",
      );
      meta.session_count = 0;
    }
    if (!isStr(meta.updated_label)) {
      console.warn(
        "[portrait] auto-filled missing field: metadata.updated_label",
      );
      meta.updated_label = "just now";
    }
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
  // Portrait output must be a single, COMPLETE JSON object. We pass the
  // full PORTRAIT_JSON_SCHEMA as Ollama's `format` (structured outputs)
  // rather than the bare "json" string. The bare string only guarantees
  // syntactic validity — gemma4:e2b, a 2B-class model, would then emit
  // valid JSON that stopped after headline/insights/profile and dropped
  // suggestions/quick_facts/confidence (done_reason "stop", not
  // truncation). The schema's `required` lists make the grammar refuse
  // the closing brace until every key has been produced. Verified
  // against gemma4:e2b: the schema path still returns the separate
  // `thinking` trace the dashboard renders. See lib/portrait-schema.ts.
  //
  // Direct fetch instead of the ollamaToolChat wrapper: portrait wants
  // free-form JSON, not a tool call, so the previous empty-tools call
  // bought nothing, and the wrapper has no format passthrough.
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      format: PORTRAIT_JSON_SCHEMA,
      stream: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Ollama portrait request failed: ${res.status} ${errText}`,
    );
  }
  return (await res.json()) as RawChatLikeResponse;
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
