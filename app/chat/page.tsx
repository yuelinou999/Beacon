"use client";

import { useEffect } from "react";
import { useAIContext } from "@/components/ai-context";

export default function ChatPage() {
  const { setContext } = useAIContext();

  useEffect(() => {
    setContext({ page: "general" });
  }, [setContext]);

  return (
    <div className="px-10 py-8 max-w-[720px]">
      <h1 className="text-heading text-navy mb-2">Ask a question</h1>
      <p className="text-muted text-sm leading-relaxed">
        Chat interface for freeform math questions coming soon.
      </p>
    </div>
  );
}
