"use client";

import { useEffect } from "react";
import { useAIContext } from "@/components/ai-context";

export default function QuizPage() {
  const { setContext } = useAIContext();

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  return (
    <div className="px-10 py-8 max-w-[720px]">
      <p style={{ fontSize: 14, color: "#6B7280" }}>
        Quiz is not yet available in this preview.
      </p>
    </div>
  );
}
