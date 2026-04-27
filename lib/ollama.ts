import { OLLAMA_URL, OLLAMA_MODEL } from "./config";
import type { OllamaMessage } from "./types";

// ── Streaming chat (for Learn) ─────────────────────────
// Returns a ReadableStream of Ollama ndjson chunks.

export async function ollamaStreamChat(messages: OllamaMessage[]): Promise<Response> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama ${res.status}: ${errText}`);
  }

  return res;
}

// ── Tool-calling chat (for Practice) ───────────────────
// Uses Ollama's native tools parameter. Returns parsed response.

interface OllamaToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

interface OllamaToolResponse {
  message: {
    role: string;
    content: string;
    thinking?: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, unknown>;
      };
    }>;
  };
}

export async function ollamaToolChat(
  messages: OllamaMessage[],
  tools: OllamaToolDef[]
): Promise<OllamaToolResponse> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama ${res.status}: ${errText}`);
  }

  return res.json();
}

// ── Tool definitions ───────────────────────────────────

export const GENERATE_QUIZ_TOOL: OllamaToolDef = {
  type: "function",
  function: {
    name: "generate_quiz",
    description: "Generate a math quiz question for the student",
    parameters: {
      type: "object",
      properties: {
        question: {
          type: "string",
          description: "The math question text, using LaTeX for math expressions",
        },
        correct_answer: {
          type: "string",
          description: "The correct answer to the question",
        },
      },
      required: ["question", "correct_answer"],
    },
  },
};

export const GRADE_ANSWER_TOOL: OllamaToolDef = {
  type: "function",
  function: {
    name: "grade_answer",
    description: "Grade the student's answer to a math question",
    parameters: {
      type: "object",
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
      },
      required: ["correct", "explanation", "correct_answer"],
    },
  },
};
