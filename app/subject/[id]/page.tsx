"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadProfile, getTopicProgress } from "@/lib/progress";
import { getBilingual } from "@/components/settings-modal";
import { useAIContext } from "@/components/ai-context";
import type { StudentProfile, CurriculumTopic } from "@/lib/types";
import curriculum from "@/data/curriculum.json";
import subjects from "@/data/subjects";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function masteryBarColor(m: number): string {
  if (m >= 0.7) return "bg-success";
  if (m >= 0.4) return "bg-warning";
  if (m > 0) return "bg-danger";
  return "bg-border";
}

function memoryStrength(lastSeen: string | null): { label: string; color: string; barPct: number } | null {
  if (!lastSeen) return null;
  const now = new Date();
  const seen = new Date(lastSeen);
  const daysDiff = Math.floor((now.getTime() - seen.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff <= 0) return { label: "Recent", color: "blue", barPct: 85 };
  if (daysDiff <= 3) return { label: "Strong", color: "success", barPct: 70 };
  return { label: "Fading", color: "warning", barPct: 35 };
}

interface WeekDay {
  label: string;
  status: "completed" | "current" | "upcoming";
  isToday: boolean;
}

function buildWeekPlan(
  topicData: Array<{ topic: CurriculumTopic; mastery: number; attempts: number; last_seen: string | null }>
): WeekDay[] {
  const today = new Date().getDay();
  const todayIdx = today >= 1 && today <= 5 ? today - 1 : 0;
  const plan: WeekDay[] = [];
  let topicIdx = 0;

  for (let d = 0; d < 5; d++) {
    const isToday = d === todayIdx;
    if (topicIdx < topicData.length) {
      const td = topicData[topicIdx];
      const completed = td.mastery >= 0.3;
      if (completed && d <= todayIdx) {
        plan.push({ label: td.topic.title.en, status: "completed", isToday });
      } else if (isToday) {
        plan.push({ label: td.topic.title.en, status: completed ? "completed" : "current", isToday: true });
      } else if (d < todayIdx) {
        plan.push({ label: td.topic.title.en, status: "completed", isToday });
      } else {
        plan.push({ label: td.topic.title.en, status: "upcoming", isToday });
      }
      topicIdx++;
    } else {
      plan.push({ label: "Review + Practice", status: "upcoming", isToday });
    }
  }
  return plan;
}

export default function SubjectDetailPage() {
  const params = useParams();
  const subjectId = params.id as string;
  const subjectDef = subjects.find((s) => s.id === subjectId);

  const { setContext } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bilingual, setBilingual] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setBilingual(getBilingual());
    const onFocus = () => {
      setProfile(loadProfile());
      setBilingual(getBilingual());
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ── Coming soon or unknown subject ──
  if (!subjectDef || subjectDef.status === "coming_soon") {
    const name = subjectDef?.name || "Subject";
    const icon = subjectDef?.icon || "?";
    const color = subjectDef?.color || "#6B7280";
    const bgLight = subjectDef?.bgLight || "#F9FAFB";

    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-8">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl mb-5"
          style={{ backgroundColor: bgLight, color }}
        >
          {icon}
        </div>
        <h2 className="text-[20px] font-medium text-navy mb-2">{name}</h2>
        <p className="text-[14px] text-muted max-w-[360px] mb-2">
          This subject is coming soon. We&apos;re building the curriculum &mdash; check back later!
        </p>
        {subjectDef?.plannedTopics && (
          <div className="mt-4 text-left max-w-[300px]">
            <p className="text-label uppercase text-muted mb-2">PLANNED TOPICS</p>
            <div className="space-y-1.5">
              {subjectDef.plannedTopics.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-border shrink-0" />
                  <span className="text-[13px] text-muted">{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Link href="/" className="text-blue text-sm mt-6 hover:underline">
          &larr; Back to Home
        </Link>
      </div>
    );
  }

  // ── Active subject (math) ──
  return <MathSubjectDetail profile={profile} bilingual={bilingual} subjectDef={subjectDef} setContext={setContext} />;
}

function MathSubjectDetail({
  profile,
  bilingual,
  subjectDef,
  setContext,
}: {
  profile: StudentProfile | null;
  bilingual: boolean;
  subjectDef: (typeof subjects)[number];
  setContext: ReturnType<typeof useAIContext>["setContext"];
}) {
  const topics = curriculum.topics as CurriculumTopic[];

  const topicData = topics.map((t) => {
    const tp = profile ? getTopicProgress(profile, t.id) : { mastery: 0, attempts: 0, last_seen: null };
    return { topic: t, ...tp };
  });

  const completedTopics = topicData.filter((t) => t.mastery >= 0.3).length;
  const avgMastery = topicData.reduce((sum, t) => sum + t.mastery, 0) / topics.length;
  const totalWrong = profile?.wrong_answers?.length || 0;

  const continueTopic = topicData.find((t) => t.mastery > 0 && t.mastery < 0.7)
    || topicData.find((t) => t.mastery === 0)
    || topicData[0];

  const weakestTopic = topics.reduce((weakest, t) => {
    const m = profile?.topics[t.id]?.mastery || 0;
    const wm = profile?.topics[weakest.id]?.mastery || 0;
    return m < wm ? t : weakest;
  }, topics[0]);

  const weekPlan = buildWeekPlan(topicData);

  const isPrereqMet = (topic: CurriculumTopic): boolean => {
    if (!topic.prerequisite) return true;
    const tp = profile?.topics[topic.prerequisite];
    return (tp?.mastery || 0) >= 0.3;
  };

  useEffect(() => {
    setContext({
      page: "home",
      completedTopics,
      totalTopics: topics.length,
      weakestTopic: weakestTopic.title.en,
    });
  }, [completedTopics, topics.length, weakestTopic.title.en, setContext]);

  return (
    <div className="h-full overflow-y-auto">
      {/* Subject header */}
      <div className="flex items-center gap-3 px-8 py-3 border-b border-border/60 bg-card shrink-0">
        <Link href="/" className="text-muted hover:text-navy text-sm">&larr; Home</Link>
        <span className="text-border">|</span>
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold shrink-0"
          style={{ backgroundColor: subjectDef.bgLight, color: subjectDef.color }}
        >
          {subjectDef.icon}
        </div>
        <span className="text-sm font-medium text-navy">{subjectDef.name}</span>
        <span className="text-xs text-muted">{subjectDef.subtitle}</span>
      </div>

      <div className="px-8 py-6">
        <div className="flex gap-6 max-w-[1100px]">

          {/* LEFT COLUMN */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* SUBJECT HERO */}
            <div
              className="bg-card rounded-xl border p-5"
              style={{ borderWidth: "0.5px", borderColor: "#E8EBF0", borderLeftWidth: "4px", borderLeftColor: subjectDef.color }}
            >
              <p className="text-label uppercase text-muted mb-2">CURRENT TOPIC</p>
              <h2 className="text-[18px] font-medium text-navy mb-1">{continueTopic.topic.title.en}</h2>
              <p className="text-[13px] text-muted mb-4">
                {continueTopic.mastery > 0
                  ? `Mastery ${(continueTopic.mastery * 100).toFixed(0)}% \u00b7 ${continueTopic.attempts} attempts`
                  : "Not started yet"}
              </p>
              <Link
                href={`/learn-v2/${continueTopic.topic.id}`}
                className="inline-block text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:opacity-90 transition"
                style={{ backgroundColor: subjectDef.color }}
              >
                {continueTopic.mastery > 0 ? "Continue lesson \u2192" : "Start lesson \u2192"}
              </Link>
            </div>

            {/* WEEKLY PLAN */}
            <div className="bg-card rounded-xl border border-border p-5" style={{ borderWidth: "0.5px" }}>
              <p className="text-label uppercase text-muted mb-3">WEEKLY PLAN</p>
              <div className="space-y-0">
                {weekPlan.map((day, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${day.isToday ? "bg-blue-soft" : ""}`}>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          day.status === "completed" ? "#059669" : day.status === "current" ? subjectDef.color : "#E8EBF0",
                      }}
                    />
                    <span className={`text-xs w-8 shrink-0 ${day.isToday ? "font-semibold text-body" : "text-muted"}`}>{WEEKDAYS[i]}</span>
                    <span className={`text-[13px] flex-1 truncate ${
                      day.isToday ? "font-medium text-body" : day.status === "completed" ? "text-muted opacity-60" : "text-body"
                    }`}>{day.label}</span>
                    {day.status === "completed" && <span className="text-[10px] text-success font-medium">Completed</span>}
                    {day.status === "current" && (
                      <span className="text-[10px] font-medium" style={{ color: subjectDef.color }}>In progress</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ALL TOPICS */}
            <div>
              <p className="text-label uppercase text-muted mb-3">ALL TOPICS</p>
              <div className="space-y-3">
                {topics.map((topic, idx) => {
                  const tp = profile ? getTopicProgress(profile, topic.id) : { mastery: 0, attempts: 0, last_seen: null };
                  const mastery = tp.mastery;
                  const prereqMet = isPrereqMet(topic);
                  const done = mastery >= 0.7;

                  return (
                    <div
                      key={topic.id}
                      className={`bg-card rounded-xl border border-border px-5 py-4 flex items-center gap-4 transition ${
                        !prereqMet ? "opacity-50" : ""
                      }`}
                      style={{ borderWidth: "0.5px" }}
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 text-white"
                        style={{
                          backgroundColor: done ? "#059669" : prereqMet ? subjectDef.color : "#E8EBF0",
                          color: done || prereqMet ? "#FFFFFF" : "#6B7280",
                        }}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy truncate">{topic.title.en}</p>
                        {bilingual && <p className="text-xs text-muted truncate">{topic.title.zh}</p>}
                        <div className="w-full h-1.5 bg-surface rounded-full mt-2">
                          <div
                            className={`h-1.5 rounded-full transition-all ${masteryBarColor(mastery)}`}
                            style={{ width: `${Math.max(mastery * 100, 0)}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-sm text-muted w-12 text-right shrink-0">
                        {mastery > 0 ? `${(mastery * 100).toFixed(0)}%` : "\u2014"}
                      </span>
                      {prereqMet ? (
                        <div className="flex gap-2 shrink-0">
                          <Link
                            href={`/learn-v2/${topic.id}`}
                            className="text-xs px-3.5 py-1.5 rounded-lg text-white hover:opacity-90 transition font-medium"
                            style={{ backgroundColor: subjectDef.color }}
                          >
                            Learn
                          </Link>
                          <Link
                            href={`/practice?topic=${topic.id}`}
                            className="text-xs px-3.5 py-1.5 rounded-lg border text-muted hover:text-blue transition font-medium"
                            style={{ borderColor: "#E8EBF0" }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = subjectDef.color;
                              e.currentTarget.style.color = subjectDef.color;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "#E8EBF0";
                              e.currentTarget.style.color = "#6B7280";
                            }}
                          >
                            Practice
                          </Link>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted shrink-0">Complete prerequisite first</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="w-[300px] shrink-0 space-y-5">

            {/* TOPIC MASTERY */}
            <div className="bg-card rounded-xl border border-border p-5" style={{ borderWidth: "0.5px" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-label uppercase text-muted">TOPIC MASTERY</p>
                <span className="text-[12px] font-medium" style={{ color: subjectDef.color }}>
                  {(avgMastery * 100).toFixed(0)}%
                </span>
              </div>
              <div className="space-y-2.5">
                {topicData.map((td) => (
                  <div key={td.topic.id} className="flex items-center gap-2.5">
                    <span className="text-[12px] text-body flex-1 truncate">{td.topic.title.en}</span>
                    <div className="w-[72px] h-1.5 bg-surface rounded-full shrink-0">
                      <div
                        className={`h-1.5 rounded-full transition-all ${masteryBarColor(td.mastery)}`}
                        style={{ width: `${Math.max(td.mastery * 100, 0)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-muted w-8 text-right shrink-0">
                      {td.mastery > 0 ? `${(td.mastery * 100).toFixed(0)}%` : "\u2014"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* MEMORY STRENGTH */}
            {(() => {
              const active = topicData.filter((td) => td.mastery > 0 && td.last_seen);
              if (active.length === 0) return null;
              return (
                <div className="bg-card rounded-xl border border-border p-5" style={{ borderWidth: "0.5px" }}>
                  <p className="text-label uppercase text-muted mb-1">MEMORY STRENGTH</p>
                  <p className="text-[11px] text-muted mb-3">Topics that may need review soon</p>
                  <div className="space-y-3">
                    {active.map((td) => {
                      const mem = memoryStrength(td.last_seen);
                      if (!mem) return null;
                      const tagColors: Record<string, string> = {
                        blue: "text-blue bg-blue-soft",
                        success: "text-success bg-success-bg",
                        warning: "text-warning bg-warning-bg",
                      };
                      const barColors: Record<string, string> = {
                        blue: "bg-blue", success: "bg-success", warning: "bg-warning",
                      };
                      return (
                        <div key={td.topic.id}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[12px] text-body truncate flex-1">{td.topic.title.en}</span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${tagColors[mem.color]}`}>{mem.label}</span>
                          </div>
                          <div className="w-full h-1.5 bg-surface rounded-full">
                            <div className={`h-1.5 rounded-full ${barColors[mem.color]}`} style={{ width: `${mem.barPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* QUICK ACCESS */}
            <div>
              <p className="text-label uppercase text-muted mb-3">QUICK ACCESS</p>
              <div className="grid grid-cols-2 gap-2">
                <Link href={`/practice?topic=${continueTopic.topic.id}`} className="bg-card rounded-lg border border-border p-3 hover:border-blue transition group" style={{ borderWidth: "0.5px" }}>
                  <div className="w-6 h-6 rounded bg-success-bg flex items-center justify-center text-success text-xs mb-1.5">&#9998;</div>
                  <p className="text-[12px] font-medium text-body group-hover:text-blue transition">Practice</p>
                </Link>
                <Link href="/review" className="bg-card rounded-lg border border-border p-3 hover:border-blue transition group" style={{ borderWidth: "0.5px" }}>
                  <div className="w-6 h-6 rounded bg-warning-bg flex items-center justify-center text-warning text-xs mb-1.5">&#10007;</div>
                  <p className="text-[12px] font-medium text-body group-hover:text-blue transition">Review ({totalWrong})</p>
                </Link>
                <Link href={`/quiz?topic=${continueTopic.topic.id}`} className="bg-card rounded-lg border border-border p-3 hover:border-blue transition group" style={{ borderWidth: "0.5px" }}>
                  <div className="w-6 h-6 rounded bg-blue-soft flex items-center justify-center text-blue text-xs mb-1.5">&#9719;</div>
                  <p className="text-[12px] font-medium text-body group-hover:text-blue transition">Quiz</p>
                </Link>
                <Link href="/dashboard" className="bg-card rounded-lg border border-border p-3 hover:border-blue transition group" style={{ borderWidth: "0.5px" }}>
                  <div className="w-6 h-6 rounded bg-mathbg flex items-center justify-center text-muted text-xs mb-1.5">&#128202;</div>
                  <p className="text-[12px] font-medium text-body group-hover:text-blue transition">Dashboard</p>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
