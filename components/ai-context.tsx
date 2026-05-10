"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface AIContext {
  page: "home" | "learn" | "practice" | "quiz" | "review" | "dashboard" | "teacher" | "general";
  topicId?: string;
  topicTitle?: string;
  mastery?: number;
  step?: number;
  correctCount?: number;
  questionsAnswered?: number;
  completedTopics?: number;
  totalTopics?: number;
  weakestTopic?: string;
}

interface AIContextValue {
  context: AIContext;
  setContext: (ctx: AIContext) => void;
  // Panel layout state
  expanded: "none" | "center" | "panel";
  toggleExpand: (which: "center" | "panel") => void;
  // Shell-visible signal: true while the user is mid-quiz; ai-panel pauses.
  quizActive: boolean;
  setQuizActive: (active: boolean) => void;
}

const Ctx = createContext<AIContextValue>({
  context: { page: "general" },
  setContext: () => {},
  expanded: "none",
  toggleExpand: () => {},
  quizActive: false,
  setQuizActive: () => {},
});

export function AIContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AIContext>({ page: "general" });
  const [expanded, setExpanded] = useState<"none" | "center" | "panel">("none");
  const [quizActive, setQuizActive] = useState(false);

  const toggleExpand = useCallback((which: "center" | "panel") => {
    setExpanded((prev) => (prev === which ? "none" : which));
  }, []);

  return (
    <Ctx.Provider
      value={{
        context,
        setContext,
        expanded,
        toggleExpand,
        quizActive,
        setQuizActive,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAIContext() {
  return useContext(Ctx);
}
