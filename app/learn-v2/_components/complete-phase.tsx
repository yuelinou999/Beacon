"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

interface CompletePhaseProps {
  topicId: string;
}

export default function CompletePhaseView({ topicId }: CompletePhaseProps) {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto">
      <div
        className="rounded-xl p-10 text-center"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "#ECFDF5" }}
        >
          <Check size={32} style={{ color: "#059669" }} />
        </div>

        <h2
          style={{
            fontSize: "24px",
            fontWeight: 500,
            color: "#0F2A4A",
            marginBottom: "12px",
          }}
        >
          Lesson complete!
        </h2>

        <p
          style={{
            fontSize: "15px",
            color: "#1F2937",
            lineHeight: 1.7,
            marginBottom: "24px",
          }}
        >
          You solved 3 out of 3 problems.
        </p>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => router.push(`/practice?topic=${topicId}`)}
            className="px-8 py-3 rounded-lg transition-colors"
            style={{
              backgroundColor: "#0F2A4A",
              color: "#FFFFFF",
              fontSize: "15px",
            }}
          >
            Start practice →
          </button>
          <button
            onClick={() => router.push("/subject/math")}
            className="px-8 py-3 rounded-lg border transition-colors hover:border-blue-500"
            style={{
              borderColor: "#E2E5EA",
              color: "#1F2937",
              fontSize: "15px",
            }}
          >
            Back to course
          </button>
        </div>
      </div>
    </div>
  );
}
