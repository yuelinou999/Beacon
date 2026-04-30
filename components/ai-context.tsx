"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface AIContext {
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
}

interface AIContextValue {
  context: AIContext;
  setContext: (ctx: AIContext) => void;
  // Panel layout state
  expanded: "none" | "center" | "panel";
  toggleExpand: (which: "center" | "panel") => void;
}

const Ctx = createContext<AIContextValue>({
  context: { page: "general" },
  setContext: () => {},
  expanded: "none",
  toggleExpand: () => {},
});

export function AIContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AIContext>({ page: "general" });
  const [expanded, setExpanded] = useState<"none" | "center" | "panel">("none");

  const toggleExpand = useCallback((which: "center" | "panel") => {
    setExpanded((prev) => (prev === which ? "none" : which));
  }, []);

  return (
    <Ctx.Provider value={{ context, setContext, expanded, toggleExpand }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAIContext() {
  return useContext(Ctx);
}
