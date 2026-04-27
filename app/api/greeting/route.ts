import { NextRequest } from "next/server";
import { OLLAMA_URL, OLLAMA_MODEL } from "@/lib/config";

interface GreetingRequest {
  studentName: string;
  topicMasteries: Array<{ name: string; mastery: number; lastSeen: string | null }>;
  currentTopicName: string;
  wrongAnswerCount: number;
  isNewStudent: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const body: GreetingRequest = await req.json();
    const { studentName, topicMasteries, currentTopicName, wrongAnswerCount, isNewStudent } = body;

    if (isNewStudent) {
      return Response.json({
        greeting: `Welcome to Beacon${studentName ? `, ${studentName}` : ""}. Your offline classroom is ready — pick a subject below to start learning. No internet needed.`,
        suggestedTopic: currentTopicName,
        suggestedAction: "start",
      });
    }

    const started = topicMasteries.filter((t) => t.mastery > 0);
    const completed = topicMasteries.filter((t) => t.mastery >= 0.7);
    const weakest = started.length > 0
      ? started.reduce((w, t) => t.mastery < w.mastery ? t : w)
      : null;

    const progressSummary = started.map((t) =>
      `${t.name}: ${(t.mastery * 100).toFixed(0)}%`
    ).join(", ");

    const systemPrompt = `You are Beacon, a patient and warm teacher in an offline classroom with 5 subjects (Mathematics active; Physics, Chemistry, Biology, Computer Science coming soon). Generate a 1-2 sentence greeting for your student. Reference their Mathematics progress specifically. Be encouraging but honest. Mention what they did well and what needs work. Keep it under 40 words. Do not use emojis. Do not be patronizing.`;

    const userContent = `Student: ${studentName || "Student"}
Subjects: Mathematics (active), Physics/Chemistry/Biology/CS (coming soon)
Math topics completed: ${completed.length}/${topicMasteries.length}
Math progress: ${progressSummary || "Just starting"}
Current math topic: ${currentTopicName}
Wrong answers pending: ${wrongAnswerCount}
${weakest ? `Weakest topic: ${weakest.name} at ${(weakest.mastery * 100).toFixed(0)}%` : ""}`;

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
      return Response.json({
        greeting: `Welcome back${studentName ? `, ${studentName}` : ""}. Let's continue where you left off.`,
        suggestedTopic: currentTopicName,
        suggestedAction: "continue",
      });
    }

    const data = await ollamaRes.json();
    const greeting = data.message?.content?.trim() || `Welcome back${studentName ? `, ${studentName}` : ""}. Let's continue where you left off.`;

    return Response.json({
      greeting,
      suggestedTopic: currentTopicName,
      suggestedAction: completed.length >= topicMasteries.length ? "review" : "continue",
    });
  } catch (err) {
    console.error("Greeting API error:", err);
    return Response.json({
      greeting: "Welcome back. Let's continue where you left off.",
      suggestedTopic: "",
      suggestedAction: "continue",
    });
  }
}
