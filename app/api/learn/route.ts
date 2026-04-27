import { NextRequest } from "next/server";
import { ollamaStreamChat } from "@/lib/ollama";
import { getLearnPrompt } from "@/lib/prompts";
import type { LearnRequest, OllamaMessage, CurriculumTopic, TopicProgress } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

export async function POST(req: NextRequest) {
  try {
    const body: LearnRequest = await req.json();
    const { topicId, language, mastery, history } = body;

    const topic = (curriculum.topics as CurriculumTopic[]).find(
      (t) => t.id === topicId
    );
    if (!topic) {
      return Response.json({ error: "Topic not found" }, { status: 404 });
    }

    const progress: TopicProgress = {
      mastery,
      status: mastery >= 1 ? "mastered" : mastery >= 0.7 ? "strong" : mastery >= 0.3 ? "practicing" : mastery > 0 ? "learning" : "not_started",
      attempts: 0,
      last_seen: null,
      lesson_completed: false,
      explain_differently_count: 0,
    };

    const systemPrompt = getLearnPrompt(topic, progress, language);

    // Build message history for Ollama
    const ollamaMessages: OllamaMessage[] = [
      { role: "system", content: systemPrompt },
    ];

    // If no history, this is the first message — Beacon initiates
    if (history.length === 0) {
      ollamaMessages.push({
        role: "user",
        content: language === "zh"
          ? "请开始这节课的教学。"
          : "Please begin the lesson.",
      });
    } else {
      for (const msg of history) {
        ollamaMessages.push({
          role: msg.role === "beacon" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    const ollamaRes = await ollamaStreamChat(ollamaMessages);

    // Stream through to client
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
          console.error("Learn stream error:", err);
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    console.error("Learn API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
