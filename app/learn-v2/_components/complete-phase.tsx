"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { loadProfile, markLessonComplete } from "@/lib/progress";
import { getAllTopics } from "@/lib/curriculum";

interface CompletePhaseProps {
  topicId: string;
  // Present only when reaching this view via phase 5 (independent done) —
  // i.e. the learner actually solved problems. Bridge topics (concept +
  // analogy only) reach this view via the missing-phase shortcuts in
  // learn-v2/[topicId]/page.tsx and pass nothing, since they didn't
  // solve anything. Hardcoded {correct, total} mirrors the previous
  // hardcoded "3 out of 3" claim — turning it into a prop just lets
  // bridge topics omit the false claim cleanly. Wiring real scores from
  // IndependentPhaseView state is a separate, larger change.
  solvedSummary?: { correct: number; total: number };
}

export default function CompletePhaseView({
  topicId,
  solvedSummary,
}: CompletePhaseProps) {
  const router = useRouter();

  // Whether this topic has a practice bank — drives the "Start practice"
  // button. Hides the CTA for bridge topics like proportional_graphs
  // whose /practice page would have nothing to show.
  const topic = getAllTopics().find((t) => t.id === topicId);
  const hasPractice = (topic?.practice?.questions?.length ?? 0) > 0;

  // Persist lesson completion on mount. markLessonComplete is idempotent —
  // it bumps mastery to MASTERY_PRACTICING (0.3) only if currently below
  // that, and stamps lesson_completed=true. Safe under React StrictMode
  // double-mount and re-renders. This is what makes finishing a lesson
  // actually move the topic-progress bar — without this, mastery stayed
  // at 0 until the learner went to /practice (lib/progress.ts:537).
  // Bridge topics like proportional_graphs land here via the missing-phase
  // CompletePhaseView paths in /learn-v2/[topicId], so they also get the
  // 0.3 nudge — but they remain non-progressable for unit completion
  // (see isProgressable in app/subject/[id]/page.tsx).
  useEffect(() => {
    const profile = loadProfile();
    markLessonComplete(profile, topicId);
  }, [topicId]);

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
          {solvedSummary
            ? `You solved ${solvedSummary.correct} out of ${solvedSummary.total} problems.`
            : "You finished this lesson."}
        </p>

        <div className="flex gap-4 justify-center">
          {hasPractice && (
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
          )}
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
