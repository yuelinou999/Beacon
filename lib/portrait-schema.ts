// JSON Schema for the learner-portrait response, passed to Ollama as the
// `format` field so generation is grammar-constrained to a valid, complete
// object.
//
// Why this exists: gemma4:e2b is a small model. Asked for the portrait with
// only a prose schema description (or even format:"json"), it reliably
// produced VALID json that was nonetheless INCOMPLETE — it would emit
// headline / insights / profile and then close the object, dropping
// suggestions / quick_facts / confidence. done_reason was "stop", not
// "length": the model decided it was finished, not truncated. A prose
// instruction cannot fix that on a 2B-class model; a grammar can. With this
// schema as `format`, Ollama's sampler cannot emit the closing brace until
// every key in `required` has been produced.
//
// Shape mirrors PortraitBody in lib/portrait.ts. Decorative D3 fields
// (breakdown / behavior_pattern / weekly_values / modality_scores /
// emerging_patterns) are listed in `properties` so the model MAY emit them,
// but kept out of every `required` list so a sparse profile can still
// validate. lib/portrait.ts `validate()` remains the runtime check.

export const PORTRAIT_JSON_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "object",
      properties: {
        narrative: { type: "string" },
        analytical: { type: "string" },
      },
      required: ["narrative", "analytical"],
    },
    insights: {
      type: "object",
      properties: {
        where_time_goes: {
          type: "object",
          properties: {
            observation: { type: "string" },
            evidence: { type: "string" },
            breakdown: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  subject: { type: "string" },
                  percentage: { type: "number" },
                },
                required: ["subject", "percentage"],
              },
            },
          },
          required: ["observation", "evidence"],
        },
        under_difficulty: {
          type: "object",
          properties: {
            observation: { type: "string" },
            evidence: { type: "string" },
            behavior_pattern: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  trigger: { type: "string" },
                  reaction: { type: "string" },
                },
                required: ["trigger", "reaction"],
              },
            },
          },
          required: ["observation", "evidence"],
        },
        independence_trend: {
          type: "object",
          properties: {
            observation: { type: "string" },
            evidence: { type: "string" },
            direction: {
              type: "string",
              enum: ["rising", "falling", "stable"],
            },
            weekly_values: {
              type: "array",
              items: { type: "number" },
            },
          },
          required: ["observation", "evidence", "direction"],
        },
      },
      required: ["where_time_goes", "under_difficulty", "independence_trend"],
    },
    profile: {
      type: "object",
      properties: {
        learning_style: {
          type: "object",
          properties: {
            label: { type: "string" },
            description: { type: "string" },
            modality_scores: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  modality: { type: "string" },
                  score: { type: "number" },
                },
                required: ["modality", "score"],
              },
            },
          },
          required: ["label", "description"],
        },
        emerging_patterns: {
          type: "array",
          items: {
            type: "object",
            properties: {
              trend: { type: "string", enum: ["rising", "falling", "stable"] },
              description: { type: "string" },
            },
            required: ["trend", "description"],
          },
        },
      },
      required: ["learning_style"],
    },
    // minItems on suggestions / quick_facts: without it the schema only
    // guarantees the KEY exists — the model is free to emit []. gemma4:e2b
    // did exactly that on a meaningful fraction of runs, leaving the
    // dashboard's Suggestions and Quick-facts sections blank. minItems
    // pushes the grammar to keep generating array elements until the floor
    // is met. Bounds mirror the prose schema ("2-3" / "3-5").
    suggestions: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          suggestion: { type: "string" },
          rationale: { type: "string" },
        },
        required: ["suggestion", "rationale"],
      },
    },
    quick_facts: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          icon_hint: { type: "string" },
          label: { type: "string" },
        },
        required: ["icon_hint", "label"],
      },
    },
    confidence: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["high", "medium", "low"] },
        reason: { type: "string" },
      },
      required: ["level", "reason"],
    },
    metadata: {
      type: "object",
      properties: {
        interaction_count: { type: "number" },
        session_count: { type: "number" },
        updated_label: { type: "string" },
      },
      required: ["interaction_count", "session_count", "updated_label"],
    },
  },
  required: [
    "headline",
    "insights",
    "profile",
    "suggestions",
    "quick_facts",
    "confidence",
    "metadata",
  ],
} as const;
