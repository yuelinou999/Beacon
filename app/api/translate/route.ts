import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";
import type {
  TranslateRequest,
  TranslateResponse,
  TranslateTargetLanguage,
} from "@/lib/types";

// POST /api/translate — translate short English UI strings (topic titles,
// labels) into the learner's selected secondary language. Powered by Gemma
// running locally via Ollama, no external API calls.
//
// Used by <BilingualSubtitle/> when bilingual mode is on AND the second
// language is something other than Chinese (Chinese is already in
// curriculum.json as topic.title.zh — no API call needed for it).
//
// The selling point of this endpoint for hackathon judging: Gemma's
// multilingual capability + offline local execution = a real classroom
// translation tool that runs without internet. The "second language"
// dropdown in Settings is wired to this; previously it was dead UI that
// stored a value but nothing read it.

const TARGET_LANGUAGE_NAMES: Record<TranslateTargetLanguage, string> = {
  zh: "Chinese (Simplified)",
  hi: "Hindi",
  es: "Spanish",
  sw: "Swahili",
  fr: "French",
  ar: "Arabic",
};

function isTranslateRequest(body: unknown): body is TranslateRequest {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return false;
  if (typeof b.targetLanguage !== "string") return false;
  return Object.keys(TARGET_LANGUAGE_NAMES).includes(b.targetLanguage);
}

function buildSystemPrompt(targetLang: TranslateTargetLanguage): string {
  const name = TARGET_LANGUAGE_NAMES[targetLang];
  return (
    `You are a translator. Translate the user's English text into ${name}. ` +
    "Output ONLY the translation — no explanation, no preamble like " +
    "\"Here's the translation\", no surrounding quotes, no markdown. " +
    "Keep the meaning faithful and the tone neutral. Preserve any math " +
    "symbols (numbers, +, -, =, ×, ÷, x, y, z, parentheses) unchanged. " +
    "If the input is already a single math expression with no words, return it as-is."
  );
}

export async function POST(req: NextRequest) {
  let parsed: unknown = null;
  try {
    parsed = await req.json();
  } catch {
    parsed = null;
  }
  if (!isTranslateRequest(parsed)) {
    return Response.json({ error: "invalid_request_shape" }, { status: 400 });
  }

  const body: TranslateRequest = parsed;
  const text = body.text.trim();
  if (text.length === 0) {
    return Response.json({ error: "empty_text" }, { status: 400 });
  }
  // Cap input length defensively — UI strings shouldn't be huge, and a
  // runaway prompt would burn unnecessary tokens.
  if (text.length > 500) {
    return Response.json({ error: "text_too_long" }, { status: 400 });
  }

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: buildSystemPrompt(body.targetLanguage) },
          { role: "user", content: text },
        ],
        stream: false,
      }),
    });
  } catch (err) {
    console.error("Translate API: Ollama fetch failed:", err);
    return Response.json(
      {
        error: "ollama_unreachable",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!ollamaRes.ok) {
    const errText = await ollamaRes.text();
    return Response.json(
      { error: "ollama_error", status: ollamaRes.status, detail: errText.slice(0, 200) },
      { status: 502 },
    );
  }

  const data = (await ollamaRes.json()) as { message?: { content?: string } };
  let translation = (data.message?.content ?? "").trim();

  // Some models wrap output in quotes despite the prompt — strip a single
  // outer pair of straight or curly quotes if present.
  if (translation.length >= 2) {
    const first = translation[0];
    const last = translation[translation.length - 1];
    const pairs = [
      ['"', '"'],
      ["'", "'"],
      ["“", "”"],
      ["「", "」"],
    ];
    for (const [open, close] of pairs) {
      if (first === open && last === close) {
        translation = translation.slice(1, -1).trim();
        break;
      }
    }
  }

  if (!translation) {
    return Response.json({ error: "empty_translation" }, { status: 502 });
  }

  const out: TranslateResponse = { translation };
  return Response.json(out);
}
