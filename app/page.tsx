"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { loadProfile, getTopicProgress } from "@/lib/progress";
import { getTopicsForUnit, getUnits, getUnit } from "@/lib/curriculum";
import { getStudentName, getBilingual } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { useAIContext } from "@/components/ai-context";
import type { StudentProfile, CurriculumTopic, TopicTitle } from "@/lib/types";
import curriculum from "@/data/curriculum.json";
import subjects, { type SubjectDef } from "@/data/subjects";

const GREETINGS = ["Hello", "Welcome back", "Good to see you", "Hey", "Hi there"];
const greeting = GREETINGS[new Date().getDate() % GREETINGS.length];

function masteryLabel(m: number): { text: string; color: string } {
  if (m >= 1) return { text: "Mastered", color: "#059669" };
  if (m >= 0.7) return { text: "Strong", color: "#059669" };
  if (m >= 0.4) return { text: "Practicing", color: "#D97706" };
  if (m > 0) return { text: "Learning", color: "#2563EB" };
  return { text: "Not started", color: "#9CA3AF" };
}

export default function Home() {
  const { setContext } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [studentName, setStudentName] = useState("");
  const [bilingual, setBilingual] = useState(false);
  const [hoveredSubject, setHoveredSubject] = useState<SubjectDef | null>(null);

  useEffect(() => {
    const refresh = () => {
      setProfile(loadProfile());
      setStudentName(getStudentName());
      setBilingual(getBilingual());
    };
    refresh();
    // focus refreshes when the user returns to this tab; the custom event
    // covers same-tab updates immediately (e.g. toggling settings inline).
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
  }, []);

  const topics = curriculum.topics as CurriculumTopic[];

  const topicData = topics.map((t) => {
    const tp = profile ? getTopicProgress(profile, t.id) : { mastery: 0, attempts: 0, last_seen: null };
    return { topic: t, ...tp };
  });

  const avgMastery = topicData.reduce((sum, t) => sum + t.mastery, 0) / topics.length;
  const totalWrong = profile?.wrong_answers?.length || 0;
  const totalAttempts = topicData.reduce((sum, t) => sum + t.attempts, 0);

  // Resolve continueTopic from profile.current_unit, with fallback chain
  const requestedUnitId = profile?.current_unit || "unit_6_equations";
  let resolvedUnitId = requestedUnitId;
  let unitTopics = getTopicsForUnit(resolvedUnitId);

  if (unitTopics.length === 0) {
    const units = getUnits();
    const unitWithProgress = units.find((u) =>
      u.topics.some((tid) => (profile?.topics?.[tid]?.mastery ?? 0) > 0)
    );
    resolvedUnitId = unitWithProgress?.id ?? "unit_6_equations";
    unitTopics = getTopicsForUnit(resolvedUnitId);

    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[Beacon] profile.current_unit "${requestedUnitId}" not found in curriculum; fell back to "${resolvedUnitId}"`
      );
    }

    if (unitTopics.length === 0) {
      // Curriculum regression — even the hardcoded unit is gone.
      // Log loudly and attempt one last fallback to the first unit that has topics.
      const anyUnit = units.find((u) => getTopicsForUnit(u.id).length > 0);
      if (anyUnit) {
        resolvedUnitId = anyUnit.id;
        unitTopics = getTopicsForUnit(resolvedUnitId);
      }
      // eslint-disable-next-line no-console
      console.error(
        `[Beacon] continueTopic: fallback unit "${resolvedUnitId}" returned no topics. ` +
          `Curriculum may be malformed or renamed — add a UNIT_ID_RENAMES entry in lib/progress.ts.`
      );
    }
  }

  const unitTopicData = unitTopics.map((t) => {
    const tp = profile ? getTopicProgress(profile, t.id) : { mastery: 0, attempts: 0, last_seen: null };
    return { topic: t, ...tp };
  });

  const continueTopic = unitTopicData.find((t) => t.mastery > 0 && t.mastery < 0.7)
    || unitTopicData.find((t) => t.mastery === 0)
    || unitTopicData[0]
    || topicData[0];

  // Unit-scoped Learning Memory signals
  const hasStarted = unitTopicData.some((t) => t.mastery > 0);

  const weakestStarted = unitTopicData
    .filter((t) => t.mastery > 0)
    .sort((a, b) => a.mastery - b.mastery)[0];

  const fadingTopic = unitTopicData
    .filter((t) => t.mastery > 0 && t.last_seen)
    .sort((a, b) => new Date(a.last_seen!).getTime() - new Date(b.last_seen!).getTime())[0];
  const fadingDays = fadingTopic?.last_seen
    ? Math.floor((Date.now() - new Date(fadingTopic.last_seen).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Last wrong stays cross-unit; tag with unit when outside current unit
  const lastWrongTopic = profile?.wrong_answers?.length
    ? profile.wrong_answers[profile.wrong_answers.length - 1]?.topic
    : null;
  const lastWrongTopicTitle: TopicTitle | null = lastWrongTopic
    ? topics.find((t) => t.id === lastWrongTopic)?.title ?? null
    : null;
  const lastWrongUnit = lastWrongTopic
    ? getUnits().find((u) => u.topics.includes(lastWrongTopic))
    : undefined;
  const lastWrongUnitTag = lastWrongUnit && lastWrongUnit.id !== resolvedUnitId
    ? `Unit ${lastWrongUnit.number} ${lastWrongUnit.title}`
    : null;

  // Unit-scoped progress + profile.streak_days as single source of truth
  const currentUnit = getUnit(resolvedUnitId);
  const currentUnitTitle = currentUnit?.title ?? "";
  const unitCompleted = unitTopicData.filter((t) => t.mastery >= 0.8).length;
  const unitTotal = unitTopicData.length;
  const dayStreak = profile?.streak_days ?? 0;

  useEffect(() => {
    setContext({
      page: "home",
      completedTopics: unitCompleted,
      totalTopics: unitTotal,
      weakestTopic: weakestStarted?.topic.title.en || continueTopic.topic.title.en,
    });
  }, [unitCompleted, unitTotal, weakestStarted?.topic.title.en, continueTopic.topic.title.en, setContext]);

  const displayName = studentName || "there";
  const masteryPct = Math.round(avgMastery * 100);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-12">

        {/* ── HERO ── */}
        <div className="mb-12">
          <h1 style={{ fontSize: 28, fontWeight: 500, color: "#0F2A4A", marginBottom: 8 }}>
            {greeting}, {displayName}
          </h1>
          <p style={{ fontSize: 14, color: "#6B7280", marginBottom: 20 }}>
            Your next lesson is ready. Pick up where you left off.
          </p>
          <Link
            href={`/learn-v2/${continueTopic.topic.id}`}
            className="inline-block transition-opacity hover:opacity-90"
            style={{
              backgroundColor: "#0F2A4A",
              color: "#FFFFFF",
              borderRadius: 8,
              padding: "12px 24px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            {hasStarted ? "Continue lesson →" : "Start your first lesson →"}
          </Link>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 12 }}>
            Mathematics · {continueTopic.topic.title.en}
            {bilingual && (
              <span style={{ color: "#9CA3AF" }}> · {continueTopic.topic.title.zh}</span>
            )}
          </div>
        </div>

        {/* ── TWO CARDS ── */}
        <div className="grid grid-cols-2 gap-4 mb-8">

          {/* LEFT: Your subjects */}
          <div
            className="rounded-xl"
            style={{
              backgroundColor: "#FFFFFF",
              border: "0.5px solid #E2E5EA",
              minHeight: 260,
              padding: 24,
            }}
            onMouseLeave={() => setHoveredSubject(null)}
          >
            <h3 style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: 0.5, marginBottom: 20 }}>
              YOUR SUBJECTS
            </h3>
            <div className="space-y-3">
              {subjects.map((subj) => {
                const isActive = subj.status === "active";
                const mastery = subj.id === "math" ? avgMastery : 0;
                const isHovered = hoveredSubject?.id === subj.id;
                const masteryInt = Math.round(mastery * 100);

                return (
                  <button
                    key={subj.id}
                    disabled={!isActive}
                    onMouseEnter={() => setHoveredSubject(subj)}
                    onClick={() => {
                      if (isActive) window.location.href = `/subject/${subj.id}`;
                    }}
                    className="w-full flex items-center gap-4 p-3 rounded-lg transition-all text-left"
                    style={{
                      backgroundColor: isHovered && isActive ? `${subj.color}08` : "transparent",
                      opacity: isActive ? 1 : 0.55,
                      cursor: isActive ? "pointer" : "default",
                    }}
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${subj.color}15`,
                        color: subj.color,
                        fontSize: 14,
                      }}
                    >
                      {subj.icon}
                    </div>
                    <div className="flex-1">
                      <div style={{ fontSize: 14, color: "#1F2937", fontWeight: 500 }}>
                        {subj.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {isActive ? (
                        <>
                          <div style={{ width: 60, height: 6, borderRadius: 3, backgroundColor: "#E5E7EB" }}>
                            <div
                              style={{
                                width: `${Math.max(masteryInt, 0)}%`,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: masteryInt > 0 ? subj.color : "transparent",
                                transition: "width 200ms",
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 13, color: "#6B7280", minWidth: 40, textAlign: "right" }}>
                            {masteryInt}%
                          </span>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, color: "#6B7280", marginRight: 8 }}>—</span>
                          <span
                            className="px-2 py-1 rounded text-xs"
                            style={{ backgroundColor: "#F5F6F8", color: "#6B7280" }}
                          >
                            Soon
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Learning Memory / Hovered detail */}
          <div
            className="rounded-xl"
            style={{
              backgroundColor: "#FFFFFF",
              border: "0.5px solid #E2E5EA",
              minHeight: 260,
              padding: 24,
            }}
          >
            {hoveredSubject ? (
              <HoveredDetail
                subject={hoveredSubject}
                topicData={topicData}
                totalAttempts={totalAttempts}
                bilingual={bilingual}
              />
            ) : (
              <LearningMemory
                hasStarted={hasStarted}
                weakestTopicTitle={weakestStarted?.topic.title ?? null}
                fadingTopicTitle={fadingTopic?.topic.title ?? null}
                fadingDays={fadingDays}
                lastWrongTopicTitle={lastWrongTopicTitle}
                lastWrongUnitTag={lastWrongUnitTag}
                continueTopicTitle={continueTopic.topic.title}
                bilingual={bilingual}
              />
            )}
          </div>
        </div>

        {/* ── TODAY'S SESSION ── */}
        <div
          className="rounded-xl mb-8"
          style={{
            backgroundColor: "#FFFFFF",
            border: "0.5px solid #E2E5EA",
            padding: 24,
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: 0.5, marginBottom: 16 }}>
            TODAY&apos;S SESSION
          </h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#2563EB" }} />
              <span style={{ fontSize: 14, color: "#1F2937" }}>Learn: {continueTopic.topic.title.en}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#7C3AED" }} />
              <span style={{ fontSize: 14, color: "#1F2937" }}>Practice: Keep your streak</span>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: totalWrong > 0 ? "#059669" : "#E5E7EB" }}
              />
              <span style={{ fontSize: 14, color: totalWrong > 0 ? "#1F2937" : "#6B7280" }}>
                {totalWrong > 0
                  ? `Review: ${Math.min(totalWrong, 3)} past mistake${totalWrong !== 1 ? "s" : ""}`
                  : "No reviews needed"}
              </span>
            </div>
          </div>
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: `${subjects.filter((s) => s.status === "active").length} subject active` },
            { label: avgMastery > 0 ? `${masteryPct}% mastery` : "Ready to begin" },
            { label: currentUnitTitle ? `${unitCompleted} of ${unitTotal} in ${currentUnitTitle}` : `${unitCompleted} of ${unitTotal}` },
            { label: dayStreak > 0 ? `${dayStreak} day streak` : "Just starting" },
          ].map((stat, i) => (
            <div
              key={i}
              className="p-4 rounded-xl text-center"
              style={{ backgroundColor: "#F5F6F8" }}
            >
              <div style={{ fontSize: 13, color: "#6B7280" }}>{stat.label}</div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ── Learning Memory (default right card) ── */
function LearningMemory({
  hasStarted,
  weakestTopicTitle,
  fadingTopicTitle,
  fadingDays,
  lastWrongTopicTitle,
  lastWrongUnitTag,
  continueTopicTitle,
  bilingual,
}: {
  hasStarted: boolean;
  weakestTopicTitle: TopicTitle | null;
  fadingTopicTitle: TopicTitle | null;
  fadingDays: number;
  lastWrongTopicTitle: TopicTitle | null;
  lastWrongUnitTag: string | null;
  continueTopicTitle: TopicTitle;
  bilingual: boolean;
}) {
  if (!hasStarted) {
    return (
      <>
        <h3 style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: 0.5, marginBottom: 20 }}>
          LEARNING MEMORY
        </h3>
        <div className="flex items-center justify-center" style={{ minHeight: 180 }}>
          <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 220, lineHeight: 1.5, textAlign: "center" }}>
            Start your first lesson to build your learning memory
          </p>
        </div>
      </>
    );
  }

  // Each row carries an optional title-pair so we can render zh underneath
  // when bilingual mode is on. Rows that don't refer to a topic (e.g. the
  // empty "Nothing yet" placeholder) leave `title` null.
  const rows: Array<{
    label: string;
    title: TopicTitle | null;
    fallback: string;
    suffix?: string | null;
    meta?: string | null;
    color: string;
  }> = [
    {
      label: "Weakest topic",
      title: weakestTopicTitle,
      fallback: "Start learning to find out",
      color: "#1F2937",
    },
    {
      label: "Needs review",
      title: fadingTopicTitle && fadingDays >= 3 ? fadingTopicTitle : null,
      fallback: "Nothing yet",
      suffix: fadingTopicTitle && fadingDays >= 3 ? ` (${fadingDays}d ago)` : null,
      color: "#1F2937",
    },
    {
      label: "Last mistake",
      title: lastWrongTopicTitle,
      fallback: "No mistakes yet",
      meta: lastWrongTopicTitle ? lastWrongUnitTag : null,
      color: "#1F2937",
    },
    {
      label: "Next step",
      title: continueTopicTitle,
      fallback: "",
      suffix: null,
      color: "#2563EB",
    },
  ];

  return (
    <>
      <h3 style={{ fontSize: 14, fontWeight: 500, color: "#6B7280", letterSpacing: 0.5, marginBottom: 20 }}>
        LEARNING MEMORY
      </h3>
      <div className="space-y-4">
        {rows.map((row, i) => {
          const isNextStep = row.label === "Next step";
          const primaryEn = row.title
            ? isNextStep
              ? `Continue: ${row.title.en}`
              : `${row.title.en}${row.suffix ?? ""}`
            : row.fallback;
          return (
            <div key={i}>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 4 }}>{row.label}</div>
              <div style={{ fontSize: 14, color: row.color }}>
                {primaryEn}
                {row.meta && (
                  <span style={{ color: "#9CA3AF" }}> · {row.meta}</span>
                )}
              </div>
              {bilingual && row.title && (
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                  {row.title.zh}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ── Hovered subject detail (right card) ── */
function HoveredDetail({
  subject,
  topicData,
  totalAttempts,
  bilingual,
}: {
  subject: SubjectDef;
  topicData: Array<{ topic: CurriculumTopic; mastery: number; attempts: number; last_seen: string | null }>;
  totalAttempts: number;
  bilingual: boolean;
}) {
  const isActive = subject.status === "active";
  const avgMastery = isActive
    ? topicData.reduce((sum, t) => sum + t.mastery, 0) / topicData.length
    : 0;
  const completedCount = isActive
    ? topicData.filter((t) => t.mastery >= 0.3).length
    : 0;
  const totalTopics = isActive ? topicData.length : (subject.plannedTopics?.length || 0);

  // Active subject rows carry a title-pair; planned-topic rows from
  // subjects.ts are English-only strings, so titleZh stays null for them.
  const displayTopics: Array<{ name: string; titleZh: string | null; mastery: number }> = isActive
    ? topicData.slice(0, 3).map((td) => ({
        name: td.topic.title.en,
        titleZh: td.topic.title.zh,
        mastery: td.mastery,
      }))
    : (subject.plannedTopics || []).slice(0, 3).map((name) => ({
        name,
        titleZh: null,
        mastery: -1,
      }));

  const currentTopicTitle: TopicTitle | null = isActive
    ? topicData.find((t) => t.mastery > 0 && t.mastery < 0.7)?.topic.title
      ?? topicData.find((t) => t.mastery === 0)?.topic.title
      ?? topicData[0]?.topic.title
      ?? null
    : null;

  return (
    <>
      <h3 style={{ fontSize: 14, fontWeight: 500, color: subject.color, letterSpacing: 0.5, marginBottom: 20 }}>
        {subject.name.toUpperCase()}
      </h3>

      {isActive ? (
        <>
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "#6B7280" }}>Topics:</span>
              <span style={{ color: "#1F2937", fontWeight: 500 }}>
                {completedCount} of {totalTopics}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "#6B7280" }}>Mastery:</span>
              <span style={{ color: "#1F2937", fontWeight: 500 }}>
                {Math.round(avgMastery * 100)}%
              </span>
            </div>
            <div className="flex items-start justify-between text-sm">
              <span style={{ color: "#6B7280" }}>Current topic:</span>
              <span
                style={{
                  color: "#1F2937", fontWeight: 500, fontSize: 13, textAlign: "right", maxWidth: 170,
                }}
              >
                {currentTopicTitle?.en}
                {bilingual && currentTopicTitle?.zh && (
                  <span style={{ display: "block", color: "#9CA3AF", fontWeight: 400, fontSize: 11, marginTop: 2 }}>
                    {currentTopicTitle.zh}
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="space-y-2 mb-6">
            {displayTopics.map((t, i) => {
              const ml = masteryLabel(t.mastery);
              return (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <span style={{ flex: 1, overflow: "hidden", marginRight: 8 }}>
                    <span style={{ fontSize: 13, color: "#1F2937", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.name}
                    </span>
                    {bilingual && t.titleZh && (
                      <span style={{ fontSize: 11, color: "#9CA3AF", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.titleZh}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: ml.color, fontWeight: 500, flexShrink: 0 }}>
                    {ml.text}
                  </span>
                </div>
              );
            })}
          </div>
          <Link
            href={`/subject/${subject.id}`}
            className="block w-full text-center rounded-lg transition-opacity hover:opacity-90"
            style={{
              backgroundColor: subject.color,
              color: "#FFFFFF",
              fontSize: 13,
              padding: "10px 16px",
              textDecoration: "none",
            }}
          >
            View all topics
          </Link>
          {totalAttempts > 0 && (
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8, textAlign: "center" }}>
              {totalAttempts} practiced
            </p>
          )}
        </>
      ) : (
        <>
          <span
            className="inline-block px-2 py-1 rounded text-xs"
            style={{ backgroundColor: "#F5F6F8", color: "#6B7280", marginBottom: 16 }}
          >
            Coming soon
          </span>
          <div className="space-y-2">
            {displayTopics.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-1.5">
                <span style={{ fontSize: 13, color: "#9CA3AF", flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>—</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 16 }}>
            Curriculum in development
          </p>
        </>
      )}
    </>
  );
}
