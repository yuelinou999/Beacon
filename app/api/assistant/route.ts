import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";

interface AssistantRequest {
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: {
    page: "home" | "learn" | "practice" | "general" | "quiz";
    topicId?: string;
    topicTitle?: string;
    mastery?: number;
    step?: number;
    correctCount?: number;
    questionsAnswered?: number;
    completedTopics?: number;
    totalTopics?: number;
    weakestTopic?: string;
  };
  mode: "tutor" | "explain" | "quiz";
  images?: string[]; // base64-encoded image data (no data URL prefix)
}

const BASE_PROMPT = `You are Beacon AI, a patient and warm math tutor sitting next to the student in the Beacon offline classroom. You run locally via Gemma 4. Keep responses concise and clear. Use LaTeX ($...$) for math notation.

You are a supplementary assistant — the main teaching happens in the structured lessons. Your job is to help when the student is confused, answer questions, and provide encouragement.

Be conversational and kind. You are sitting next to the student, not lecturing from the front. If the student seems confused, offer to explain differently without being asked. Never say "As I mentioned before" or "As we discussed" — it sounds passive-aggressive. If the student sends a short message like "?" or "idk" or "help", treat it as "I'm confused and don't know how to ask" — respond with the simplest possible re-explanation of the current topic.`;

function buildContextPrompt(ctx: AssistantRequest["context"]): string {
  switch (ctx.page) {
    case "home":
      return `The student is reviewing their learning progress. They have completed ${ctx.completedTopics || 0}/${ctx.totalTopics || 7} topics.${ctx.weakestTopic ? ` Their weakest topic is "${ctx.weakestTopic}".` : ""} You can answer questions about their progress, suggest what to study next, or explain any topic.`;
    case "learn":
      return `The student is currently learning "${ctx.topicTitle || "a topic"}".${ctx.step ? ` They are on step ${ctx.step}.` : ""}${ctx.mastery !== undefined ? ` Their mastery is ${(ctx.mastery * 100).toFixed(0)}%.` : ""} You are a supplementary tutor — answer questions about the current topic, clarify concepts, provide additional examples. Do not repeat what the main lesson is teaching, complement it.`;
    case "practice":
      return `The student is practicing "${ctx.topicTitle || "a topic"}".${ctx.mastery !== undefined ? ` Their current mastery is ${(ctx.mastery * 100).toFixed(0)}%.` : ""}${ctx.questionsAnswered ? ` They got ${ctx.correctCount || 0} correct out of ${ctx.questionsAnswered} questions.` : ""} If they ask about a question they got wrong, explain the mistake. Help them understand, don't just give answers.`;
    default:
      return "The student is browsing the Beacon learning platform. Answer any math questions they have.";
  }
}

function buildModePrompt(mode: AssistantRequest["mode"]): string {
  switch (mode) {
    case "explain":
      return "Give detailed step-by-step explanations. Use examples. Be thorough but clear.";
    case "quiz":
      return "Generate a practice question appropriate to the student's current level. After they answer, tell them if they're correct and explain why.";
    default:
      return "You are in Guided mode. Give hints and ask guiding questions to help the student figure out the answer themselves. Do NOT give the full solution — lead them to discover it step by step. Use simple everyday language. If the student is struggling, offer a simpler version rather than repeating yourself.";
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: AssistantRequest = await req.json();
    const { message, history, context, mode, images } = body;

    const systemPrompt = [
      BASE_PROMPT,
      buildContextPrompt(context),
      buildModePrompt(mode),
    ].join("\n\n");

    const userMessage: Record<string, unknown> = { role: "user", content: message };
    if (images && images.length > 0) {
      userMessage.images = images;
    }

    const ollamaMessages = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      userMessage,
    ];

    const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: true,
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text();
      return Response.json({ error: `Ollama ${ollamaRes.status}: ${errText}` }, { status: 502 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const reader = ollamaRes.body?.getReader();
        if (!reader) { controller.close(); return; }
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } catch (err) {
          console.error("Assistant stream error:", err);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    console.error("Assistant API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
