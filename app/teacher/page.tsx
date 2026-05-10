"use client";

// Family view — efficacy HUD for parents, caregivers, volunteer
// educators, NGO field workers, and hackathon judges.
//
// Naming rationale: the route is `/teacher` (kept stable since Day 8
// to avoid downstream URL/profile churn), but the visible label is
// "Family view" because Beacon's target persona scenarios — schools
// with one teacher per four grades, homes without a teacher present —
// don't have a "teacher" reading the dashboard. The family member,
// older sibling, or visiting volunteer is the actual reader.
//
// What this page is for: prove that Beacon measures learning, not just
// delivers content. Day 8 of the 14-day plan exists because the demo
// narrative needs concrete evidence that "this offline classroom
// actually works" — student dashboard prose isn't enough; judges want
// quantified outcomes.
//
// Audience contract:
//   - The student is a third party here ("Xiaomei is currently weak in
//     fractions"), not the reader. Copy uses the student name when
//     available, falls back to "the student" when it's not set.
//   - All numbers are deterministic — no AI narrative in this build.
//     Every metric is recomputable from StudentProfile + curriculum
//     without any LLM call. Future "coaching notes" can layer on top.
//
// Layout: single column, four KPI cards on top, then four data
// sections (mastery distribution / weakest topics / mistake taxonomy /
// recent activity). Single-page so judges can take it all in without
// scrolling between panels.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, GraduationCap } from "lucide-react";
import { loadProfile } from "@/lib/progress";
import { getAllTopics, getUnits } from "@/lib/curriculum";
import {
  computeKeyMetrics,
  computeMasteryDistribution,
  findWeakestTopics,
  computeErrorTypeBreakdown,
  computeRecentActivity,
} from "@/lib/efficacy";
import type { StudentProfile } from "@/lib/types";
import { useAIContext } from "@/components/ai-context";
import { getStudentName } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import KeyMetricsRow from "./_components/key-metrics-row";
import MasteryDistribution from "./_components/mastery-distribution";
import WeakestTopics from "./_components/weakest-topics";
import MistakeTaxonomy from "./_components/mistake-taxonomy";
import ActivityStrip from "./_components/activity-strip";

const ACTIVITY_WINDOW_DAYS = 7;
const KEY_METRICS_WINDOW_DAYS = 30;
const WEAKEST_TOPICS_LIMIT = 3;

export default function TeacherPage() {
  const { setContext } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [studentName, setStudentName] = useState<string>("");

  useEffect(() => {
    setContext({ page: "teacher" });
  }, [setContext]);

  useEffect(() => {
    // Refresh on mount + every time the window regains focus + on
    // explicit settings-change events. Mirrors the pattern used by
    // /subject and /review so the Teacher view doesn't go stale when
    // a learner finishes practice in another tab and returns here.
    // Demo motion: judge clicks /teacher → switches to /practice →
    // returns to /teacher → KPI cards reflect the latest mastery
    // without a full page reload.
    const refresh = () => {
      setProfile(loadProfile());
      setStudentName(getStudentName());
    };
    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  // Defer rendering until profile hydrates client-side. Avoids SSR/
  // localStorage mismatch and lets the KPI cards render once with
  // real numbers instead of zeros-then-update flicker.
  if (!profile) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <p style={{ fontSize: "14px", color: "#9CA3AF" }}>Loading…</p>
        </div>
      </div>
    );
  }

  const allTopics = getAllTopics();
  const units = getUnits();
  const unitTitleById = new Map(units.map((u) => [u.id, u.title]));

  const keyMetrics = computeKeyMetrics(
    profile,
    allTopics,
    KEY_METRICS_WINDOW_DAYS,
  );
  const distribution = computeMasteryDistribution(profile, allTopics);
  const weakest = findWeakestTopics(
    profile,
    allTopics,
    unitTitleById,
    WEAKEST_TOPICS_LIMIT,
  );
  const errorBuckets = computeErrorTypeBreakdown(profile);
  const activity = computeRecentActivity(profile, ACTIVITY_WINDOW_DAYS);

  // Display name in headers — falls back to "Your learner" (family-
  // tone) so the copy reads naturally for fresh profiles where the
  // student hasn't entered a name yet.
  const displayName = studentName.trim() || "Your learner";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span style={{ fontSize: "14px" }}>Home</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap size={20} style={{ color: "#0F2A4A" }} aria-hidden="true" />
            <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A" }}>
              Family view
            </h1>
          </div>
          <p style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
            Progress overview for <strong style={{ color: "#1F2937" }}>{displayName}</strong>{" "}
            &mdash; the last {KEY_METRICS_WINDOW_DAYS} days of practice, drawn directly from
            mastery, mistakes, and session logs. Every number on this page is computed
            on-device from {displayName}&rsquo;s actual activity &mdash; nothing is generated by AI.
          </p>
        </div>

        {/* KPI row */}
        <div className="mb-10">
          <KeyMetricsRow metrics={keyMetrics} />
        </div>

        {/* Mastery distribution */}
        <section className="mb-10">
          <SectionHeader
            title="Mastery distribution"
            subtitle={`Where ${displayName} stands across all ${distribution.total} authored topics.`}
          />
          <MasteryDistribution distribution={distribution} />
        </section>

        {/* Weakest topics */}
        <section className="mb-10">
          <SectionHeader
            title="Topics that need attention"
            subtitle={
              weakest.length === 0
                ? `${displayName} hasn't built up enough practice history yet — encourage a few sessions, then check back.`
                : `Bottom ${weakest.length} by current mastery, showing only topics actively attempted.`
            }
          />
          <WeakestTopics topics={weakest} />
        </section>

        {/* Mistake taxonomy */}
        <section className="mb-10">
          <SectionHeader
            title="Mistake patterns"
            subtitle={
              errorBuckets.length === 0
                ? `No mistakes recorded yet — either ${displayName} hasn't taken any practice or quiz attempts, or every attempt has been correct.`
                : "Wrong-answer breakdown by error type. Concept confusion calls for re-teaching; rushing or calculation errors call for slower practice."
            }
          />
          <MistakeTaxonomy buckets={errorBuckets} />
        </section>

        {/* Activity */}
        <section className="mb-10">
          <SectionHeader
            title={`Last ${ACTIVITY_WINDOW_DAYS} days`}
            subtitle="Daily session count + minutes studied. Empty days are shown so consistency is visible."
          />
          <ActivityStrip activity={activity} />
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-4">
      <h2 style={{ fontSize: "16px", fontWeight: 500, color: "#0F2A4A", marginBottom: "4px" }}>
        {title}
      </h2>
      <p style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  );
}
