import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type { AdvisorAnalysis, AdvisorNarrateRequest } from "@/lib/types";
import { buildLanguageSuffix, isLearnerLanguage } from "@/lib/learner-language";

// POST /api/advisor — narrate (NOT decide) a readiness check.
//
// The deterministic verdict + gap breakdown is computed CLIENT-SIDE in
// lib/advisor.ts:analyzeReadiness and shipped here as the request body.
// Gemma's job is purely to wrap that analysis in personalized prose so
// the recommendation lands warmly. The LLM never recomputes or overrides
// the verdict — keeping the system auditable and demo-stable per codex
// round-1's two-layer design.
//
// Streams ndjson chunks back so the verdict UI (already on screen at
// click time) can show "Beacon AI is thinking…" and replace it with
// the live token stream as it arrives. Cold-load is 5-15s; streaming
// hides that wait behind visible progress.

// Multilingual: system prompt authored in English regardless of target
// language so Gemma reliably parses the structured constraints (NOT
// markdown, NOT a summary opener, MUST not contradict the verdict).
// buildLanguageSuffix appends "Respond in {Language}" for non-en targets,
// which steers the OUTPUT into the learner's reading language while
// keeping the instruction set Gemma is trained to follow most reliably.
const SYSTEM_PROMPT_BASE =
  "You are Beacon AI, the student's offline study advisor. The student is " +
  "considering starting a unit. A deterministic check has already evaluated " +
  "their readiness against the unit's prerequisites — your job is to NARRATE " +
  "that check in 2-3 short sentences of plain prose. Land the verdict warmly, " +
  "name what's strong and what's weak, and suggest a concrete next step. Do " +
  "NOT contradict the verdict. Do NOT use markdown, bullets, headings, or " +
  "emoji. Do NOT say things like \"Here's a summary\" — just speak directly to " +
  "the student.";

function verdictLabel(v: AdvisorAnalysis["verdict"]): string {
  if (v === "ready") return "ready to start";
  if (v === "almost_ready") return "almost ready";
  return "should review some prerequisites first";
}

function buildUserPrompt(req: AdvisorNarrateRequest): string {
  const a = req.analysis;
  const lines: string[] = [];
  // User prompt stays English-structured regardless of target language —
  // Gemma reads the brief in English, outputs prose in target language
  // per the SYSTEM_PROMPT_BASE + suffix instruction.
  lines.push(`Target unit: ${a.targetUnitTitle}`);
  lines.push(`System verdict: ${verdictLabel(a.verdict)}`);
  if (a.noPrereqs) {
    lines.push("This unit has no prerequisites.");
  } else {
    lines.push("Prerequisite units:");
    for (const p of a.prerequisites) {
      const pct = Math.round(p.avgMastery * 100);
      lines.push(
        `- ${p.unitTitle}: ${pct}% avg mastery (${p.status.replace("_", " ")})`,
      );
      if (p.status !== "completed" && p.weakestTopics.length > 0) {
        const tops = p.weakestTopics
          .map((t) => `${t.topicTitle} (${Math.round(t.mastery * 100)}%)`)
          .join(", ");
        lines.push(`  Weakest topics: ${tops}`);
      }
    }
  }
  lines.push("");
  lines.push("Give 2-3 sentences of warm, concrete advice.");
  return lines.join("\n");
}

function isAdvisorNarrateRequest(body: unknown): body is AdvisorNarrateRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (!b.analysis || typeof b.analysis !== "object") return false;
  const a = b.analysis as Record<string, unknown>;
  // language is optional; if present, must be a valid LearnerLanguage.
  if (b.language !== undefined && !isLearnerLanguage(b.language)) return false;
  return (
    typeof a.targetUnitId === "string" &&
    typeof a.targetUnitTitle === "string" &&
    (a.verdict === "ready" || a.verdict === "almost_ready" || a.verdict === "needs_review") &&
    Array.isArray(a.prerequisites) &&
    typeof a.noPrereqs === "boolean"
  );
}

export async function POST(req: NextRequest) {
  let parsed: unknown = null;
  try {
    parsed = await req.json();
  } catch {
    parsed = null;
  }
  if (!isAdvisorNarrateRequest(parsed)) {
    return Response.json({ error: "invalid_request_shape" }, { status: 400 });
  }

  const body: AdvisorNarrateRequest = parsed;
  const systemPrompt = SYSTEM_PROMPT_BASE + buildLanguageSuffix(body.language ?? "en");
  const userPrompt = buildUserPrompt(body);

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });
  } catch (err) {
    console.error("Advisor API: Ollama fetch failed:", err);
    return Response.json(
      { error: "ollama_unreachable", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text();
    return Response.json(
      { error: "ollama_error", status: ollamaRes.status, detail: text.slice(0, 200) },
      { status: 502 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) {
        console.error("Advisor stream error:", err);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}
