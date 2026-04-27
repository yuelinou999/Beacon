import { NextRequest } from "next/server";
import { ollamaToolChat, GENERATE_QUIZ_TOOL } from "@/lib/ollama";
import { getQuizPrompt, getGradePrompt } from "@/lib/prompts";
import type {
  PracticeGenerateRequest,
  PracticeGradeRequest,
  OllamaMessage,
  QuizQuestion,
  GradeResult,
  ErrorType,
} from "@/lib/types";

// Extended grade tool that includes error_type
const GRADE_ANSWER_WITH_ERROR_TYPE = {
  type: "function" as const,
  function: {
    name: "grade_answer",
    description: "Grade the student's answer to a math question",
    parameters: {
      type: "object" as const,
      properties: {
        correct: {
          type: "boolean",
          description: "Whether the student's answer is correct",
        },
        explanation: {
          type: "string",
          description: "Brief explanation of why the answer is correct or incorrect, with the correct solution if wrong",
        },
        correct_answer: {
          type: "string",
          description: "The correct answer",
        },
        error_type: {
          type: "string",
          description: "If incorrect, classify the error: 'concept' (doesn't understand the principle), 'calculation' (arithmetic mistake), 'rushing' (answer came too fast, appears hasty), 'careless' (understood concept but small avoidable mistake). If correct, use 'none'.",
        },
      },
      required: ["correct", "explanation", "correct_answer", "error_type"],
    },
  },
};

// POST /api/practice?action=generate | action=grade

export async function POST(req: NextRequest) {
  const action = req.nextUrl.searchParams.get("action");

  try {
    if (action === "generate") {
      return await handleGenerate(req);
    } else if (action === "grade") {
      return await handleGrade(req);
    } else {
      return Response.json({ error: "Invalid action. Use ?action=generate or ?action=grade" }, { status: 400 });
    }
  } catch (err) {
    console.error("Practice API error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function handleGenerate(req: NextRequest) {
  const body: PracticeGenerateRequest = await req.json();
  const { topicTitle, language, mastery } = body;

  const difficulty = mastery < 0.4 ? "easy" : mastery <= 0.7 ? "medium" : "hard";
  const systemPrompt = getQuizPrompt(topicTitle, difficulty, language);

  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Generate a ${difficulty} quiz question about "${topicTitle}".` },
  ];

  const result = await ollamaToolChat(messages, [GENERATE_QUIZ_TOOL]);

  // Extract tool call
  const toolCall = result.message.tool_calls?.[0];
  if (toolCall && toolCall.function.name === "generate_quiz") {
    const args = toolCall.function.arguments as { question: string; correct_answer: string };
    const quiz: QuizQuestion = {
      question: args.question,
      correct_answer: args.correct_answer,
      difficulty,
    };
    return Response.json(quiz);
  }

  // Fallback: model responded with text instead of tool call.
  const content = result.message.content || "";
  const fallback = parseFallbackQuiz(content, difficulty);
  if (fallback) {
    return Response.json(fallback);
  }

  return Response.json(
    { error: "Model did not generate a structured quiz. Raw response: " + content.slice(0, 200) },
    { status: 502 }
  );
}

async function handleGrade(req: NextRequest) {
  const body: PracticeGradeRequest = await req.json();
  const { topicTitle, language, question, correctAnswer, studentAnswer, timeSeconds } = body;

  const systemPrompt = getGradePrompt(topicTitle, question, correctAnswer, studentAnswer, language, timeSeconds);

  const messages: OllamaMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `Grade this answer: "${studentAnswer}"` },
  ];

  const result = await ollamaToolChat(messages, [GRADE_ANSWER_WITH_ERROR_TYPE]);

  const toolCall = result.message.tool_calls?.[0];
  if (toolCall && toolCall.function.name === "grade_answer") {
    const args = toolCall.function.arguments as {
      correct: boolean;
      explanation: string;
      correct_answer: string;
      error_type?: string;
    };

    const errorType = parseErrorType(args.error_type, Boolean(args.correct));

    const grade: GradeResult = {
      correct: Boolean(args.correct),
      explanation: args.explanation,
      correct_answer: args.correct_answer,
      error_type: errorType,
    };
    return Response.json(grade);
  }

  // Fallback: try to interpret text response
  const content = result.message.content || "";
  const isCorrect = content.toLowerCase().includes("correct") && !content.toLowerCase().includes("incorrect");
  const grade: GradeResult = {
    correct: isCorrect,
    explanation: content || "Could not parse grading response.",
    correct_answer: correctAnswer,
    error_type: isCorrect ? null : "concept",
  };
  return Response.json(grade);
}

function parseErrorType(raw: string | undefined, correct: boolean): ErrorType {
  if (correct) return null;
  if (!raw || raw === "none") return null;
  const valid: ErrorType[] = ["concept", "calculation", "rushing", "careless"];
  const lower = raw.toLowerCase().trim();
  for (const t of valid) {
    if (t && lower.includes(t)) return t;
  }
  return "concept"; // default for incorrect answers
}

function parseFallbackQuiz(text: string, difficulty: string): QuizQuestion | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length >= 1) {
    const answerMatch = text.match(/(?:answer|solution)[:\s]*(.+)/i);
    if (answerMatch) {
      return {
        question: lines[0],
        correct_answer: answerMatch[1].trim(),
        difficulty: difficulty as "easy" | "medium" | "hard",
      };
    }
  }
  return null;
}
