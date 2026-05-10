"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Clock, Check, Lock, ChevronDown, ChevronRight, TrendingUp, Sparkles } from "lucide-react";
import { loadProfile, getTopicProgress, setCurrentUnit } from "@/lib/progress";
import { getBilingual } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { useAIContext } from "@/components/ai-context";
import BilingualSubtitle from "@/components/bilingual-subtitle";
import {
  getAllTopics,
  getGrade7,
  isUnitAuthored,
  isTopicProgressable,
} from "@/lib/curriculum";
import type {
  StudentProfile,
  CurriculumTopic,
  CurriculumUnit,
} from "@/lib/types";
import subjects from "@/data/subjects";
import AdvisorPanel from "./_components/advisor-panel";

// ── Mastery thresholds ────────────────────────────────
// Mirrors lib/progress.ts:deriveTopicStatus and the home page semantics.
const MASTERY_PRACTICING = 0.3; // counts as "started"
const MASTERY_STRONG = 0.7;     // counts as "mastered" for unit-completion

function masteryBarColor(m: number): string {
  if (m >= MASTERY_STRONG) return "bg-success";
  if (m >= 0.4) return "bg-warning";
  if (m > 0) return "bg-danger";
  return "bg-border";
}

// ── Unit status derivation ────────────────────────────
// Status drives the pill, the action button, and the lock state.

// "coming_soon" is the catalog-side recognition that a unit exists in the
// curriculum tree but has no authored lesson content yet (every topic is a
// `phases: { stub: true }` placeholder). Distinct from "locked" — locked
// means a real unit gated by prereq mastery; coming_soon means the unit
// hasn't been built. Stub-only units render with all CTAs disabled so users
// can't click into a /learn-v2 dead-end.
type UnitStatus = "completed" | "in-progress" | "eligible" | "locked" | "coming_soon";

interface UnitView {
  unit: CurriculumUnit;
  topics: CurriculumTopic[];
  // Subset of `topics` that can actually accumulate mastery — i.e. non-stub
  // AND has a practice or quiz bank. Stubs (no authored content) and bridge
  // topics (concept/analogy only, no practice) cannot reach MASTERY_STRONG
  // because the only mastery channels are practice attempts and quiz attempts
  // (lib/progress.ts:341,408). Including them in the completion denominator
  // would make condensed units like unit_2_proportional uncompletable by
  // design — see code review notes from Day 5.
  progressableTopics: CurriculumTopic[];
  topicProgress: Map<string, { mastery: number; attempts: number; last_seen: string | null }>;
  status: UnitStatus;
  startedTopics: number;
  completedTopics: number;
  avgMastery: number;
  resumeTopicId: string | null;
}

function isUnitCompleted(view: Omit<UnitView, "status" | "resumeTopicId">): boolean {
  // Use progressableTopics as the denominator — non-progressable topics
  // can't reach MASTERY_STRONG, so requiring 100% of `topics` would mean
  // a unit with any bridge or stub topic could never report completion.
  return (
    view.progressableTopics.length > 0 &&
    view.completedTopics === view.progressableTopics.length
  );
}

function deriveUnitStatus(
  unit: CurriculumUnit,
  view: Omit<UnitView, "status" | "resumeTopicId">,
  unitCompletion: Map<string, boolean>,
): UnitStatus {
  // Coming-soon takes precedence over every other status. A unit with no
  // authored content can't be "eligible", "in-progress", etc., regardless
  // of prereq state — the entire concept of progress is moot until lessons
  // are written. Checking first also keeps the chain readable: stub-only
  // units short-circuit before any progress-derived logic runs.
  if (!isUnitAuthored(unit.id)) return "coming_soon";
  if (isUnitCompleted(view)) return "completed";
  if (view.startedTopics > 0) return "in-progress";
  // Has the prerequisite unit been completed?
  const prereqsMet = unit.prerequisites.every((pid) => unitCompletion.get(pid) === true);
  return prereqsMet ? "eligible" : "locked";
}

const STATUS_LABEL: Record<UnitStatus, string> = {
  completed: "Completed",
  "in-progress": "In progress",
  eligible: "Eligible",
  locked: "Needs prerequisite",
  coming_soon: "Coming soon",
};

const STATUS_COLOR: Record<UnitStatus, { fg: string; bg: string }> = {
  completed: { fg: "#059669", bg: "#ECFDF5" },
  "in-progress": { fg: "#2563EB", bg: "#EFF6FF" },
  eligible: { fg: "#6B7280", bg: "#F3F4F6" },
  locked: { fg: "#D97706", bg: "#FEF3C7" },
  // Neutral gray — the affordance is clearly non-actionable, not a
  // user-correctable gate like "locked". Distinct from "eligible" gray
  // by being slightly cooler (#6B7280 fg on #F0F2F5 bg) so the two
  // states aren't confusable at a glance.
  coming_soon: { fg: "#6B7280", bg: "#F0F2F5" },
};

// ── Grade selector ───────────────────────────────────
// Only Grade 7 has real curriculum data in curriculum.json today. Other grades
// render a coming-soon placeholder. Reference renders the same six buttons
// regardless of which grade is selected so the user can switch back.
//
// Shared across both branches in MathCourseCatalog: the grade-7 catalog view
// AND the non-7 coming-soon view. Keep this component standalone — do not
// inline it back into either branch, otherwise the two copies drift.

const GRADES_AVAILABLE = [5, 6, 7, 8, 9, 10] as const;
const REAL_GRADE = 7;

function GradeSelector({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (grade: number) => void;
}) {
  return (
    <div className="flex gap-2 mb-8">
      {GRADES_AVAILABLE.map((g) => {
        const isSelected = selected === g;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onSelect(g)}
            aria-pressed={isSelected}
            className="px-5 py-2 rounded-full transition-all"
            style={{
              backgroundColor: isSelected ? "#0F2A4A" : "transparent",
              color: isSelected ? "#FFFFFF" : "#6B7280",
              border: isSelected ? "none" : "0.5px solid #E2E5EA",
              fontSize: "14px",
            }}
          >
            Grade {g}
            {g !== REAL_GRADE && (
              <span style={{ fontSize: "11px", marginLeft: "6px", opacity: 0.7 }}>
                Preview
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function SubjectDetailPage() {
  const params = useParams();
  const subjectId = params.id as string;
  const subjectDef = subjects.find((s) => s.id === subjectId);

  const { setContext } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [bilingual, setBilingual] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setProfile(loadProfile());
      setBilingual(getBilingual());
    };
    refresh();
    window.addEventListener("focus", refresh);
    const unsubscribe = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsubscribe();
    };
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
  // Activate-unit callback bundles the setCurrentUnit + setProfile pair so
  // the catalog component doesn't need direct access to the profile state
  // setter.
  //
  // Early-click race fix (codex round-2): if the user fires this click
  // before the mount-effect has hydrated `profile` from localStorage,
  // we used to silently no-op — navigation went through but
  // current_unit didn't update, breaking the Tier 1 "all entry points
  // agree" promise for that session. Defensive load: fall back to a
  // synchronous loadProfile() snapshot when state is still null.
  // loadProfile is sync (localStorage read) and safe in a click handler
  // since clicks only fire client-side.
  const handleActivateUnit = (unitId: string) => {
    const current = profile ?? loadProfile();
    const updated = setCurrentUnit(current, unitId);
    setProfile(updated);
  };
  return (
    <MathCourseCatalog
      profile={profile}
      bilingual={bilingual}
      setContext={setContext}
      onActivateUnit={handleActivateUnit}
    />
  );
}

function MathCourseCatalog({
  profile,
  bilingual,
  setContext,
  onActivateUnit,
}: {
  profile: StudentProfile | null;
  bilingual: boolean;
  setContext: ReturnType<typeof useAIContext>["setContext"];
  onActivateUnit: (unitId: string) => void;
}) {
  const allTopics = getAllTopics();
  const grade = getGrade7();
  const units = grade?.units ?? [];

  // Build per-unit views (data layer).
  const unitCompletion = new Map<string, boolean>();
  const unitViews: UnitView[] = [];

  for (const unit of units) {
    const topics = unit.topics
      .map((tid) => allTopics.find((t) => t.id === tid))
      .filter((t): t is CurriculumTopic => t !== undefined);

    // Topics the learner can actually finish via practice/quiz — drives
    // every progress metric below and the resume-target selection. The
    // full `topics` list is still kept for rendering the lesson list so
    // bridge/stub rows stay visible (just inert).
    const progressableTopics = topics.filter(isTopicProgressable);

    const topicProgress = new Map<
      string,
      { mastery: number; attempts: number; last_seen: string | null }
    >();

    // Hydrate progress for every row we render — including bridges/stubs
    // — so the topic-list UI can show their (always 0) mastery bars.
    for (const t of topics) {
      const tp = profile
        ? getTopicProgress(profile, t.id)
        : { mastery: 0, attempts: 0, last_seen: null };
      topicProgress.set(t.id, {
        mastery: tp.mastery,
        attempts: tp.attempts,
        last_seen: tp.last_seen,
      });
    }

    // Progression metrics count progressable topics only — bridges and
    // stubs can never raise mastery, so including them in the denominator
    // permanently caps avgMastery and blocks unit completion.
    let startedTopics = 0;
    let completedTopics = 0;
    let masterySum = 0;
    for (const t of progressableTopics) {
      const tp = topicProgress.get(t.id) ?? { mastery: 0, attempts: 0, last_seen: null };
      if (tp.mastery > 0) startedTopics += 1;
      if (tp.mastery >= MASTERY_STRONG) completedTopics += 1;
      masterySum += tp.mastery;
    }

    const avgMastery =
      progressableTopics.length > 0 ? masterySum / progressableTopics.length : 0;

    // First-pass partial view, then status derivation needs unitCompletion map
    // built progressively (units are listed in dependency order in the JSON).
    const partial = {
      unit,
      topics,
      progressableTopics,
      topicProgress,
      startedTopics,
      completedTopics,
      avgMastery,
    };

    const status = deriveUnitStatus(unit, partial, unitCompletion);
    // For prereq-chain purposes, coming_soon units are NON-BLOCKING.
    // A unit with no authored content can't be "completed" by definition;
    // counting it as a real gate would lock every authored unit
    // downstream of any stub-only prereq (e.g. unit_6_equations whose
    // prereq is unit_5_rational, currently stub-only — would render as
    // "Locked / Needs prerequisite" on every fresh profile, blocking the
    // entire demo path). Treating coming_soon as bypassed in the
    // completion map is honest: the gate doesn't exist yet, so it
    // shouldn't gate anything.
    unitCompletion.set(
      unit.id,
      status === "completed" || status === "coming_soon",
    );

    // Resume target: only ever points at a progressable topic — never
    // route a learner into a bridge or stub that has no completion path.
    // Order: first started-but-not-mastered, else first not-started,
    // else first progressable topic.
    const resumeTopicId =
      progressableTopics.find((t) => {
        const m = topicProgress.get(t.id)?.mastery ?? 0;
        return m > 0 && m < MASTERY_STRONG;
      })?.id ??
      progressableTopics.find(
        (t) => (topicProgress.get(t.id)?.mastery ?? 0) === 0,
      )?.id ??
      progressableTopics[0]?.id ??
      null;

    unitViews.push({ ...partial, status, resumeTopicId });
  }

  const totalTopics = allTopics.length;
  // Mastery-bearing topic count across the whole catalog. Used as the
  // denominator for the "Mastered: X of Y" summary so the ratio reflects
  // topics the learner can actually complete (not stubs/bridges that are
  // permanently 0 mastery). Also used as the weighted-average denominator.
  const totalProgressableTopics = unitViews.reduce(
    (s, v) => s + v.progressableTopics.length,
    0,
  );
  const overallCompleted = unitViews.reduce((s, v) => s + v.completedTopics, 0);
  const overallMastery =
    totalProgressableTopics > 0
      ? unitViews.reduce(
          (s, v) => s + v.avgMastery * v.progressableTopics.length,
          0,
        ) / totalProgressableTopics
      : 0;

  // Recommendation: first in-progress unit, else first eligible.
  const recommendUnit =
    unitViews.find((v) => v.status === "in-progress") ??
    unitViews.find((v) => v.status === "eligible") ??
    null;

  // ── Expand state: which unit's topic list is open ──
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(
    recommendUnit?.unit.id ?? null,
  );

  // ── Advisor panel: which unit's readiness check is open ──
  // Only one panel at a time (single string id, not a Set). Toggling on the
  // same unit closes; toggling on a different unit switches over.
  const [advisorUnitId, setAdvisorUnitId] = useState<string | null>(null);
  const toggleAdvisor = (unitId: string) => {
    setAdvisorUnitId((prev) => (prev === unitId ? null : unitId));
  };

  // ── Selected grade ───────────────────────────────────
  // Only REAL_GRADE (7) has real curriculum data; other grades fall through
  // to the coming-soon branch below.
  const [selectedGrade, setSelectedGrade] = useState<number>(REAL_GRADE);

  useEffect(() => {
    setContext({
      page: "home",
      completedTopics: overallCompleted,
      totalTopics,
      weakestTopic: recommendUnit?.unit.title ?? "",
    });
  }, [overallCompleted, totalTopics, recommendUnit?.unit.title, setContext]);

  if (!grade) {
    return (
      <div className="px-8 py-12 text-center text-muted text-sm">
        Grade 7 curriculum is missing from data/curriculum.json.
      </div>
    );
  }

  // ── Non-7 grades: coming-soon placeholder ────────────
  // Matches design-reference/CourseCatalogScreen.tsx lines 184–233. Same
  // GradeSelector renders so the user can switch back to 7.
  if (selectedGrade !== REAL_GRADE) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          <Link
            href="/"
            className="flex items-center gap-2 mb-8 transition-colors hover:opacity-70"
            style={{ color: "#2563EB" }}
          >
            <ChevronLeft size={16} />
            <span style={{ fontSize: "14px" }}>Home</span>
          </Link>

          <div
            className="rounded-xl p-8 mb-8 text-center"
            style={{ backgroundColor: "#EFF6FF", border: "2px solid #BFDBFE" }}
          >
            <div
              style={{
                fontSize: "20px",
                fontWeight: 500,
                color: "#2563EB",
                marginBottom: "8px",
              }}
            >
              Grade {selectedGrade} curriculum coming soon
            </div>
            <p style={{ fontSize: "14px", color: "#6B7280" }}>
              We&apos;re developing comprehensive content for this grade.
              Preview the planned structure below.
            </p>
          </div>

          <GradeSelector selected={selectedGrade} onSelect={setSelectedGrade} />

          <div style={{ opacity: 0.5 }}>
            <p
              style={{
                fontSize: "14px",
                color: "#9CA3AF",
                textAlign: "center",
                padding: "40px 0",
              }}
            >
              Unit curriculum for Grade {selectedGrade} is in development
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Back link */}
        <Link
          href="/"
          className="flex items-center gap-2 mb-8 transition-colors hover:opacity-70"
          style={{ color: "#2563EB" }}
        >
          <ChevronLeft size={16} />
          <span style={{ fontSize: "14px" }}>Home</span>
        </Link>

        {/* SECTION 1: Grade Hero */}
        <div
          className="rounded-xl p-8 mb-6"
          style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
        >
          <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A", marginBottom: "12px" }}>
            {grade.title}
          </h1>
          <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "16px" }}>
            {grade.summary}
          </p>
          <p style={{ fontSize: "15px", color: "#1F2937", lineHeight: 1.7, marginBottom: "20px" }}>
            {grade.description}
          </p>

          <div
            className="flex items-center gap-6 mb-4 pb-4 border-b"
            style={{ borderColor: "#F0F3F7" }}
          >
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: "#6B7280" }} />
              <span style={{ fontSize: "13px", color: "#6B7280" }}>
                {units.length} units &middot; {totalTopics} lessons &middot; ~{grade.estimated_hours} hours total
              </span>
            </div>
            {/* Intentional addition vs. design reference: surfaces real student progress.
                Denominator is totalProgressableTopics — only counting topics that can
                actually accumulate mastery — so the ratio matches what the math gates. */}
            <div style={{ fontSize: "13px", color: "#6B7280" }}>
              Mastered:{" "}
              <span style={{ color: "#1F2937", fontWeight: 500 }}>
                {overallCompleted} of {totalProgressableTopics}
              </span>
              {" · "}
              <span style={{ color: "#1F2937", fontWeight: 500 }}>
                {Math.round(overallMastery * 100)}%
              </span>
            </div>
          </div>

          <p style={{ fontSize: "13px", color: "#6B7280", fontStyle: "italic" }}>
            {grade.who_its_for}
          </p>
        </div>

        {/* AI Recommendation Banner */}
        {recommendUnit && (
          <div
            className="rounded-lg p-4 mb-8 flex items-center gap-3"
            style={{ backgroundColor: "#EFF6FF", border: "1px solid #BFDBFE" }}
          >
            <TrendingUp size={18} style={{ color: "#2563EB" }} />
            <div>
              <span style={{ fontSize: "14px", color: "#1E40AF", fontWeight: 500 }}>
                Beacon recommends:{" "}
              </span>
              <span style={{ fontSize: "14px", color: "#1E3A8A" }}>
                {recommendUnit.status === "in-progress" ? "Continue " : "Start "}
                Unit {recommendUnit.unit.number} &mdash; {recommendUnit.unit.title}
              </span>
            </div>
          </div>
        )}

        {/* SECTION 2: Grade Selector */}
        <GradeSelector selected={selectedGrade} onSelect={setSelectedGrade} />

        {/* SECTION 3: Unit Cards */}
        <div className="space-y-4">
          {unitViews.map((view) => {
            const {
              unit,
              status,
              topics,
              progressableTopics,
              topicProgress,
              completedTopics,
              avgMastery,
              resumeTopicId,
            } = view;
            const isExpanded = expandedUnitId === unit.id;
            const colors = STATUS_COLOR[status];
            const prereqLabel =
              unit.prerequisites.length === 0
                ? "None"
                : unit.prerequisites
                    .map((pid) => units.find((u) => u.id === pid)?.title ?? pid)
                    .join(", ");

            return (
              <div
                key={unit.id}
                className="rounded-xl"
                style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
              >
                {/* Card body — informational. The chevron toggles the expansion;
                    the footer CTA navigates. Two independent affordances. */}
                <div className="p-6">
                  {/* Top Row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: "#EFF6FF",
                          color: "#2563EB",
                          fontSize: "14px",
                          fontWeight: 500,
                        }}
                      >
                        {unit.number}
                      </div>
                      <h3
                        style={{
                          fontSize: "16px",
                          fontWeight: 500,
                          color: "#1F2937",
                        }}
                      >
                        {unit.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {status === "locked" && <Lock size={14} style={{ color: "#D97706" }} />}
                      {status === "completed" && <Check size={14} style={{ color: "#059669" }} />}
                      <div
                        className="px-3 py-1 rounded-full flex items-center gap-1.5"
                        style={{
                          backgroundColor: colors.bg,
                          color: colors.fg,
                          fontSize: "12px",
                          fontWeight: 500,
                        }}
                      >
                        {status === "in-progress" && (
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: colors.fg }}
                          />
                        )}
                        {STATUS_LABEL[status]}
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedUnitId(isExpanded ? null : unit.id)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? "Collapse lesson list" : "Expand lesson list"}
                        className="p-1 -m-1 rounded-md transition-colors hover:bg-gray-100"
                      >
                        {isExpanded ? (
                          <ChevronDown size={16} style={{ color: "#9CA3AF" }} />
                        ) : (
                          <ChevronRight size={16} style={{ color: "#9CA3AF" }} />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "12px", lineHeight: 1.6 }}>
                    {unit.description}
                  </p>

                  {/* Skills */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {unit.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-3 py-1 rounded-md"
                        style={{ backgroundColor: "#F3F4F6", color: "#4B5563", fontSize: "11px" }}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>

                  {/* Bottom Row — meta on the left, primary CTA on the right.
                      The CTA is always visible (no expansion required). */}
                  <div
                    className="flex items-center justify-between gap-4 pt-4 border-t"
                    style={{ borderColor: "#F0F3F7" }}
                  >
                    <div className="flex items-center gap-6 flex-wrap min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock size={14} style={{ color: "#9CA3AF" }} />
                        <span style={{ fontSize: "12px", color: "#6B7280" }}>
                          {unit.estimated_lessons} lessons &middot; ~{unit.estimated_hours} hours
                        </span>
                      </div>
                      <div style={{ fontSize: "12px", color: "#6B7280" }}>
                        Prerequisite:{" "}
                        <span style={{ color: "#1F2937" }}>{prereqLabel}</span>
                      </div>
                      {status === "in-progress" && (
                        <div style={{ fontSize: "12px", color: "#2563EB", fontWeight: 500 }}>
                          {completedTopics}/{progressableTopics.length} lessons &middot; {Math.round(avgMastery * 100)}% mastery
                        </div>
                      )}
                    </div>
                    <UnitFooterCta
                      status={status}
                      resumeTopicId={resumeTopicId}
                      firstTopicId={progressableTopics[0]?.id ?? topics[0]?.id ?? null}
                      onActivate={() => onActivateUnit(unit.id)}
                      onCheckReadiness={() => toggleAdvisor(unit.id)}
                      advisorOpen={advisorUnitId === unit.id}
                    />
                  </div>
                </div>

                {/* Expanded topic list */}
                {isExpanded && (
                  <div
                    className="border-t px-6 pb-5 pt-4"
                    style={{ borderColor: "#F0F3F7" }}
                  >
                    <p
                      className="text-label uppercase mb-3"
                      style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: 500, letterSpacing: "0.5px" }}
                    >
                      LESSONS
                    </p>
                    <div className="space-y-2">
                      {topics.map((topic, idx) => {
                        const tp = topicProgress.get(topic.id) ?? {
                          mastery: 0,
                          attempts: 0,
                          last_seen: null,
                        };
                        const mastery = tp.mastery;
                        const isLocked = status === "locked";
                        const isComingSoon = status === "coming_soon";
                        // Per-row preview: a topic that exists in the unit
                        // but cannot accumulate mastery (stub or bridge).
                        // Different from `isComingSoon` (which is unit-level)
                        // and from `isLocked` (prereq gate). Same inert
                        // affordance posture, different label.
                        const isPreview = !isTopicProgressable(topic);
                        // CTA-disabling combination: locked, coming-soon,
                        // and per-row preview all replace the Start/Practice
                        // buttons with a text-only label. Different reasons,
                        // same posture (non-actionable, dimmed row).
                        const isInert = isLocked || isComingSoon || isPreview;
                        // Within-unit prereq enforcement: a topic's prerequisite
                        // is another topic id; we let the user open any topic
                        // whose unit is unlocked (the unit gate is the primary
                        // lock). This matches the existing learn-v2 routing.
                        const startAction =
                          status === "completed"
                            ? "Review"
                            : mastery > 0
                              ? "Continue"
                              : "Start";

                        return (
                          <div
                            key={topic.id}
                            className="flex items-center gap-4 px-4 py-3 rounded-lg"
                            style={{
                              backgroundColor: "#FAFBFC",
                              border: "0.5px solid #E8EBF0",
                              opacity: isInert ? 0.55 : 1,
                            }}
                          >
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium shrink-0"
                              style={{
                                backgroundColor: mastery >= MASTERY_STRONG ? "#059669" : "#EFF6FF",
                                color: mastery >= MASTERY_STRONG ? "#FFFFFF" : "#2563EB",
                              }}
                            >
                              {idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="truncate"
                                style={{ fontSize: "13px", fontWeight: 500, color: "#1F2937" }}
                              >
                                {topic.title.en}
                              </p>
                              <BilingualSubtitle
                                english={topic.title.en}
                                fallbackZh={topic.title.zh}
                                className="truncate"
                                style={{ display: "block", fontSize: "11px", color: "#6B7280" }}
                              />
                              <div className="w-full h-1 rounded-full mt-2" style={{ backgroundColor: "#E5E7EB" }}>
                                <div
                                  className={`h-1 rounded-full transition-all ${masteryBarColor(mastery)}`}
                                  style={{ width: `${Math.max(mastery * 100, 0)}%` }}
                                />
                              </div>
                            </div>
                            <span
                              className="w-10 text-right shrink-0"
                              style={{ fontSize: "11px", color: "#6B7280" }}
                            >
                              {mastery > 0 ? `${Math.round(mastery * 100)}%` : "—"}
                            </span>
                            {isLocked ? (
                              <span style={{ fontSize: "11px", color: "#D97706" }} className="shrink-0">
                                Locked
                              </span>
                            ) : isComingSoon ? (
                              <span style={{ fontSize: "11px", color: "#6B7280" }} className="shrink-0">
                                Coming soon
                              </span>
                            ) : isPreview ? (
                              <span style={{ fontSize: "11px", color: "#6B7280" }} className="shrink-0">
                                Preview only
                              </span>
                            ) : (
                              <div className="flex gap-2 shrink-0">
                                <Link
                                  href={`/learn-v2/${topic.id}`}
                                  onClick={() => onActivateUnit(unit.id)}
                                  className="rounded-md transition-opacity hover:opacity-90"
                                  style={{
                                    backgroundColor: "#0F2A4A",
                                    color: "#FFFFFF",
                                    fontSize: "12px",
                                    padding: "6px 12px",
                                    textDecoration: "none",
                                  }}
                                >
                                  {startAction}
                                </Link>
                                <Link
                                  href={`/practice?topic=${topic.id}`}
                                  className="rounded-md border transition-colors"
                                  style={{
                                    borderColor: "#E2E5EA",
                                    color: "#6B7280",
                                    fontSize: "12px",
                                    padding: "6px 12px",
                                    textDecoration: "none",
                                  }}
                                >
                                  Practice
                                </Link>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                  </div>
                )}

                {/* Advisor panel — inline expansion, sibling to the
                    expanded topic list. Single panel open at a time
                    across the catalog (advisorUnitId is a single id). */}
                {advisorUnitId === unit.id && (
                  <AdvisorPanel
                    profile={profile}
                    unitId={unit.id}
                    firstTopicId={topics[0]?.id ?? null}
                    onActivate={() => onActivateUnit(unit.id)}
                    onClose={() => setAdvisorUnitId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Unit footer CTA ──────────────────────────────────
// Always-visible, status-driven primary action. Independent of the chevron
// expansion: clicking the CTA navigates; clicking the chevron toggles the
// lesson list. The two affordances are siblings in the DOM, not nested.
//
// CTA copy divergence vs. design reference:
// - Reference (CourseCatalogScreen.tsx) labels the eligible state "Register"
//   and the in-progress state "Resume".
// - This port labels them "Start Unit" and "Continue" instead.
// - Reason: Beacon has no enrollment model. The reference's EnrollmentPanel
//   and Withdraw flow were deliberately omitted from this port, so "Register"
//   would imply a step (enrollment) that doesn't exist in the product and
//   would mislead users. "Start Unit" / "Continue" map the copy directly to
//   what the click actually does — navigate into the lesson flow.

function UnitFooterCta({
  status,
  resumeTopicId,
  firstTopicId,
  onActivate,
  onCheckReadiness,
  advisorOpen,
}: {
  status: UnitStatus;
  resumeTopicId: string | null;
  firstTopicId: string | null;
  // Fires when the user picks this unit as their next thing to study.
  // Parent uses it to persist current_unit so sidebar / home / practice
  // / quiz all re-resolve to this unit's topic on the next render.
  // Not all CTA branches fire it: the "completed → Review" link goes to
  // /practice without changing current_unit (the user is reviewing
  // mastered material, not switching their primary track), and "locked"
  // is non-interactive.
  onActivate?: () => void;
  // Toggles the inline AdvisorPanel for this unit. Only rendered on
  // eligible / in-progress states (the "gate" moments where a readiness
  // check is meaningful). Locked units don't get one — they're already
  // hard-blocked. Completed units don't get one — gate is moot.
  onCheckReadiness?: () => void;
  // Whether this unit's advisor panel is currently open. Used to flip
  // the AI button's visual state (filled when active, ghost when not)
  // so the user has a stable signal of which panel they opened.
  advisorOpen?: boolean;
}) {
  // The "Check readiness with AI" affordance — small ghost-styled
  // sparkle button shown alongside the primary CTA on gating states.
  // Not introduced as a "Register" replacement; the existing Continue /
  // Start Unit CTAs still work without ever touching the advisor.
  const advisorButton =
    onCheckReadiness && (status === "eligible" || status === "in-progress") ? (
      <button
        type="button"
        onClick={onCheckReadiness}
        aria-pressed={advisorOpen}
        aria-label="Check readiness with AI"
        className="inline-flex items-center gap-1.5 rounded-lg shrink-0 transition-colors"
        style={{
          fontSize: "12px",
          padding: "8px 12px",
          color: advisorOpen ? "#FFFFFF" : "#5B21B6",
          backgroundColor: advisorOpen ? "#5B21B6" : "#F5F3FF",
          border: `1px solid ${advisorOpen ? "#5B21B6" : "#C4B5FD"}`,
        }}
      >
        <Sparkles size={12} aria-hidden="true" />
        <span>Check with AI</span>
      </button>
    ) : null;
  if (status === "coming_soon") {
    // Stub-only unit. No active CTA — the user shouldn't be able to click
    // through to a /learn-v2 page that just renders "Coming soon" itself.
    // Single visually-passive pill matches the locked branch's affordance
    // weight so the catalog row stays balanced.
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="rounded-lg shrink-0 inline-flex items-center"
        style={{
          fontSize: "13px",
          padding: "8px 20px",
          color: "#6B7280",
          backgroundColor: "#F0F2F5",
          cursor: "not-allowed",
        }}
      >
        Preview only
      </button>
    );
  }

  if (status === "locked") {
    // Intentional addition vs. design reference: reference renders a "Preview"
    // link to a UnitDetailScreen which is not ported. A disabled <button> keeps
    // the affordance row balanced and is the right element semantically — locked
    // is an actionable state the user can't currently take, not non-interactive
    // text.
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="rounded-lg shrink-0 inline-flex items-center"
        style={{
          fontSize: "13px",
          padding: "8px 20px",
          color: "#9CA3AF",
          backgroundColor: "#F5F6F8",
          cursor: "not-allowed",
        }}
      >
        Locked
      </button>
    );
  }

  if (status === "completed" && firstTopicId) {
    // Routing divergence vs. design reference:
    // - Reference (CourseCatalogScreen.tsx) navigates the completed state via
    //   `onNavigate('learn')` — a prototype-level navigation abstraction with
    //   no literal route attached.
    // - This port routes to `/practice?topic=<firstTopicId>` instead.
    // - Reason: `onNavigate('learn')` doesn't map to a real route in this
    //   codebase. Practice is the more product-correct destination because
    //   mastered lessons are maintained through retrieval (answering questions),
    //   not re-exposure to instruction the student already knows.
    return (
      <Link
        href={`/practice?topic=${firstTopicId}`}
        className="rounded-lg shrink-0 transition-colors hover:border-blue-500"
        style={{
          fontSize: "13px",
          padding: "8px 20px",
          color: "#6B7280",
          backgroundColor: "transparent",
          border: "1px solid #E2E5EA",
          textDecoration: "none",
        }}
      >
        Review
      </Link>
    );
  }

  if (status === "in-progress" && resumeTopicId) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {advisorButton}
        <Link
          href={`/learn-v2/${resumeTopicId}`}
          onClick={onActivate}
          className="rounded-lg shrink-0 transition-opacity hover:opacity-90"
          style={{
            fontSize: "13px",
            padding: "8px 20px",
            color: "#FFFFFF",
            backgroundColor: "#0F2A4A",
            textDecoration: "none",
          }}
        >
          Continue
        </Link>
      </div>
    );
  }

  // Eligible / not-started — start at the unit's first lesson.
  if (firstTopicId) {
    return (
      <div className="flex items-center gap-2 shrink-0">
        {advisorButton}
        <Link
          href={`/learn-v2/${firstTopicId}`}
          onClick={onActivate}
          className="rounded-lg shrink-0 transition-opacity hover:opacity-90"
          style={{
            fontSize: "13px",
            padding: "8px 20px",
            color: "#FFFFFF",
            backgroundColor: "#0F2A4A",
            textDecoration: "none",
          }}
        >
          Start Unit
        </Link>
      </div>
    );
  }

  return null;
}
