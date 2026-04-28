import { NextRequest } from "next/server";
import { OLLAMA_MODEL, OLLAMA_URL } from "@/lib/config";
import {
  buildAnalogyPrompt,
  buildConceptPrompt,
  buildExamplePrompt,
  buildGuidedPrompt,
  buildIndependentPrompt,
  LessonValidationError,
  validateAnalogyPhase,
  validateConceptPhase,
  validateExamplePhase,
  validateGuidedPhase,
  validateIndependentPhase,
  verifyPhase,
  type LessonPhaseContent,
  type LessonPhaseNumber,
  type VerifierResult,
} from "@/lib/lesson";

interface RawChatLikeResponse {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
  };
  model?: string;
}

function stripCodeFence(text: string): string {
  let t = text.trim();
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

async function callOllama(
  system: string,
  user: string,
): Promise<RawChatLikeResponse> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama returned ${res.status}: ${errText}`);
  }
  return (await res.json()) as RawChatLikeResponse;
}

function buildPrompt(
  phase: LessonPhaseNumber,
  topicId: string,
  problemHint?: string,
): { system: string; user: string } {
  switch (phase) {
    case 1:
      return buildConceptPrompt(topicId);
    case 2:
      return buildAnalogyPrompt(topicId);
    case 3:
      return buildExamplePrompt(topicId);
    case 4:
      return buildGuidedPrompt(topicId, problemHint);
    case 5:
      return buildIndependentPrompt(topicId);
  }
}

function validatePhase(
  phase: LessonPhaseNumber,
  parsed: unknown,
): LessonPhaseContent {
  switch (phase) {
    case 1:
      return validateConceptPhase(parsed);
    case 2:
      return validateAnalogyPhase(parsed);
    case 3:
      return validateExamplePhase(parsed);
    case 4:
      return validateGuidedPhase(parsed);
    case 5:
      return validateIndependentPhase(parsed);
  }
}

export async function POST(req: NextRequest) {
  // ── Layer 1: request validation ─────────────────────────────
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "validation", detail: "Request body is not valid JSON" },
      { status: 400 },
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "validation", detail: "Request body must be a JSON object" },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;
  const topicId = b.topicId;
  const phase = b.phase;
  const problemHint = b.problemHint;

  if (typeof topicId !== "string" || topicId.trim().length === 0) {
    return Response.json(
      { error: "validation", detail: "topicId must be a non-empty string" },
      { status: 400 },
    );
  }

  if (
    typeof phase !== "number" ||
    !Number.isInteger(phase) ||
    phase < 1 ||
    phase > 5
  ) {
    return Response.json(
      {
        error: "validation",
        detail: `phase must be an integer 1..5 (got ${JSON.stringify(phase)})`,
      },
      { status: 400 },
    );
  }

  if (
    problemHint !== undefined &&
    problemHint !== null &&
    typeof problemHint !== "string"
  ) {
    return Response.json(
      { error: "validation", detail: "problemHint must be a string if provided" },
      { status: 400 },
    );
  }

  const phaseTyped = phase as LessonPhaseNumber;
  const hint = typeof problemHint === "string" ? problemHint : undefined;

  // ── Layer 2: transport (Ollama call) ────────────────────────
  const { system, user } = buildPrompt(phaseTyped, topicId, hint);

  const start = Date.now();
  let raw: RawChatLikeResponse;
  try {
    raw = await callOllama(system, user);
  } catch (err) {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("Lesson API ollama transport error:", err);
    return Response.json(
      { error: "ollama_transport", detail },
      { status: 502 },
    );
  }
  const durationMs = Date.now() - start;

  const content = raw.message?.content ?? "";
  const modelReturned = raw.model ?? OLLAMA_MODEL;

  // ── Layer 3: parse ──────────────────────────────────────────
  const cleaned = stripCodeFence(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    const parseDetail = e instanceof Error ? e.message : String(e);
    return Response.json(
      {
        error: "parse",
        detail: `Failed to JSON.parse model response (${parseDetail}). Raw (first 500 chars): ${content.slice(0, 500)}`,
      },
      { status: 502 },
    );
  }

  // Tag with phase so the discriminated-union validators can dispatch.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    (parsed as Record<string, unknown>).phase = phaseTyped;
  }

  // ── Layer 4: schema validation ──────────────────────────────
  let phaseContent: LessonPhaseContent;
  try {
    phaseContent = validatePhase(phaseTyped, parsed);
  } catch (err) {
    if (err instanceof LessonValidationError) {
      return Response.json(
        { error: "schema", errors: err.errors },
        { status: 502 },
      );
    }
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return Response.json(
      { error: "schema", errors: [detail] },
      { status: 502 },
    );
  }

  // ── Layer 5: semantic verification (data, not error) ────────
  const verifier: VerifierResult = verifyPhase(phaseContent);

  return Response.json(
    {
      phase: phaseContent,
      verifier,
      meta: {
        model: modelReturned,
        duration_ms: durationMs,
        topicId,
        requested_phase: phaseTyped,
      },
    },
    { status: 200 },
  );
}
