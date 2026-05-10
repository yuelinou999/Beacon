"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { StudentProfile } from "@/lib/types";
import subjects from "@/data/subjects";
import { loadProfile } from "@/lib/progress";
import { resolveActiveStudyTarget, type ActiveStudyTarget } from "@/lib/active-target";
import { DEMO_TOPIC_ID } from "@/lib/demo-targets";

type ModuleId = "home" | "learn" | "practice" | "quiz" | "review" | "dashboard" | "teacher";
type ModuleStatus = "ready" | "preview" | "soon";

interface NavItem {
  id: ModuleId;
  href: string;
  label: string;
  status: ModuleStatus;
}

// Static fallback nav — used during SSR + first paint before profile
// hydrates from localStorage. resolveActiveStudyTarget(null) lands on
// DEMO_UNIT_ID's first topic, so the fallback hrefs match what a fresh
// profile would resolve to. After mount the build below re-runs with
// the real profile and any href differences swap in (acceptable per
// codex round-1 — small flicker, no skeleton chrome needed).
function buildNavItems(target: ActiveStudyTarget): NavItem[] {
  // Quiz href: prefer the active topic's quiz when one exists; fall back
  // to the demo quiz topic otherwise. Avoids landing the user on the bare
  // "Quiz not yet available" page when their active topic happens to be
  // one of the 6 unit_6 topics that don't yet carry a quiz bank.
  const quizHref = target.topic.quiz
    ? `/quiz?topic=${target.topicId}`
    : `/quiz?topic=${DEMO_TOPIC_ID}`;
  return [
    { id: "home", href: "/", label: "Home", status: "ready" },
    { id: "learn", href: `/learn-v2/${target.topicId}`, label: "Learn", status: "ready" },
    { id: "practice", href: `/practice?topic=${target.topicId}`, label: "Practice", status: "ready" },
    { id: "quiz", href: quizHref, label: "Quiz", status: "ready" },
    { id: "review", href: "/review", label: "Review", status: "ready" },
    { id: "dashboard", href: "/dashboard", label: "Dashboard", status: "ready" },
    { id: "teacher", href: "/teacher", label: "Family view", status: "ready" },
  ];
}

// SSR-safe initial target. Calling the same resolveActiveStudyTarget
// helper the post-mount effect uses keeps SSR fallback and client
// re-resolution literally one source of truth — no parallel
// DEMO_UNIT_ID-then-getTopicsForUnit path that could drift if the
// resolver's logic ever changes (codex round-2 polish suggestion).
// resolveActiveStudyTarget(null) is pure and cheap to evaluate at
// module load.
const INITIAL_TARGET: ActiveStudyTarget = resolveActiveStudyTarget(null);

const STATUS_DOT: Record<ModuleStatus, string> = {
  ready: "#059669",
  preview: "#D97706",
  soon: "#9CA3AF",
};

/* ── Icons (inline, no library) ── */
const iconBase = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ModuleIcon({ id }: { id: ModuleId }) {
  switch (id) {
    case "home":
      return (
        <svg {...iconBase}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-4a1 1 0 0 1-1-1v-6h-4v6a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case "learn":
      return (
        <svg {...iconBase}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "practice":
      return (
        <svg {...iconBase}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
        </svg>
      );
    case "quiz":
      return (
        <svg {...iconBase}>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z" />
          <polyline points="14 2 14 8 20 8" />
          <path d="M10 18h1" />
          <path d="M10 14a2 2 0 1 1 2 2h-1" />
        </svg>
      );
    case "review":
      return (
        <svg {...iconBase}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <polyline points="3 4 3 10 9 10" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...iconBase}>
          <line x1="12" y1="20" x2="12" y2="10" />
          <line x1="18" y1="20" x2="18" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    case "teacher":
      // Mortarboard / graduation-cap silhouette — distinguishes the
      // efficacy HUD from the student-facing /dashboard sibling.
      return (
        <svg {...iconBase}>
          <path d="M22 10v6" />
          <path d="M2 10l10-5 10 5-10 5-10-5z" />
          <path d="M6 12v5c0 1.66 3 3 6 3s6-1.34 6-3v-5" />
        </svg>
      );
  }
}

function SettingsIcon() {
  return (
    <svg {...iconBase}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      {direction === "left"
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  );
}

function SidebarInner({
  profile: _profile,
  onSettingsClick,
  collapsed,
  onToggleCollapse,
}: {
  profile: StudentProfile | null;
  onSettingsClick?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const pathname = usePathname();

  // Resolve the active study target from profile.current_unit. Re-runs on
  // every route change so a click on "Start Unit" in the subject page
  // (which writes current_unit and navigates) immediately refreshes the
  // Learn / Practice / Quiz hrefs here without needing a separate event.
  // We hold the full ActiveStudyTarget (not just topicId) so buildNavItems
  // can introspect target.topic.quiz to decide whether the active topic
  // is a valid quiz destination.
  const [activeTarget, setActiveTarget] = useState<ActiveStudyTarget>(INITIAL_TARGET);
  useEffect(() => {
    setActiveTarget(resolveActiveStudyTarget(loadProfile()));
  }, [pathname]);

  const navItems = buildNavItems(activeTarget);

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/";
    const path = href.split("?")[0];
    // Path-segment-aware match: `/teacher` should highlight on
    // `/teacher` and `/teacher/<anything>` but NOT on `/teacher-foo`.
    // Plain startsWith was vulnerable to that false positive once
    // sibling routes like `/teacher-something` were introduced.
    return pathname === path || pathname.startsWith(path + "/");
  };

  const mathActive =
    pathname.startsWith("/subject/math") ||
    pathname === "/learn" ||
    pathname === "/practice" ||
    pathname === "/quiz";

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-30 flex flex-col transition-[width] duration-200"
      style={{
        width: collapsed ? 60 : 240,
        backgroundColor: "#0F2A4A",
      }}
    >
      {/* Collapse toggle — tab on the right edge */}
      <button
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute top-4 w-6 h-6 rounded-full flex items-center justify-center hover:brightness-110 transition z-10"
        style={{
          right: -12,
          backgroundColor: "#2563EB",
          color: "#FFFFFF",
        }}
      >
        <ChevronIcon direction={collapsed ? "right" : "left"} />
      </button>

      {/* Logo */}
      <div className={`py-8 ${collapsed ? "px-3" : "px-6"}`}>
        {collapsed ? (
          <Link href="/" className="w-full flex justify-center">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: 16, fontWeight: 600 }}
            >
              B
            </div>
          </Link>
        ) : (
          <Link href="/" className="block">
            <div style={{ color: "#FFFFFF", fontSize: 20, fontWeight: 500, lineHeight: 1.2 }}>Beacon</div>
            <div style={{ color: "#6BAADF", fontSize: 12, marginTop: 4 }}>Offline classroom</div>
          </Link>
        )}
      </div>

      {/* Subjects */}
      <div className={`mb-6 ${collapsed ? "px-3" : "px-6"}`}>
        {!collapsed && (
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.5,
              marginBottom: 12,
            }}
          >
            SUBJECTS
          </div>
        )}
        <div className="space-y-2">
          {subjects.map((subj) => {
            const isActive = subj.status === "active";
            const isCurrent = subj.id === "math" && mathActive;
            const row = (
              <>
                <span
                  className="w-2 h-2 rounded-full shrink-0 inline-block"
                  style={{ backgroundColor: subj.color }}
                />
                {!collapsed && (
                  <>
                    <span style={{ color: "#FFFFFF", fontSize: 14, flex: 1, textAlign: "left" }}>
                      {subj.name}
                    </span>
                    {!isActive && (
                      <span style={{ color: "#6BAADF", fontSize: 11 }}>Soon</span>
                    )}
                  </>
                )}
              </>
            );

            const baseCls = `w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-lg transition`;
            const style: React.CSSProperties = {
              opacity: isActive ? 1 : 0.5,
              backgroundColor: isCurrent ? "rgba(107,170,223,0.08)" : "transparent",
            };

            // Both active and coming-soon subjects route to /subject/{id};
            // the destination renders the appropriate state (active catalog
            // for math, coming-soon shell with planned topics for science /
            // english). Per codex round-1: an honest preview is better than
            // a dead-end div — user can browse what's coming, "Soon" tag
            // sets expectations for the disabled CTAs they'll see there.
            return (
              <Link
                key={subj.id}
                href={`/subject/${subj.id}`}
                className={`${baseCls} hover:bg-white/5`}
                style={style}
                title={collapsed ? subj.name : undefined}
              >
                {row}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Modules */}
      <div className={`flex-1 ${collapsed ? "px-3" : "px-6"}`}>
        {!collapsed && (
          <div
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: 0.5,
              marginBottom: 12,
            }}
          >
            MODULES
          </div>
        )}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = isNavActive(item.href);
            const isSoon = item.status === "soon";
            const baseCls = `relative w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-lg transition`;
            const style: React.CSSProperties = {
              backgroundColor: active ? "rgba(107,170,223,0.1)" : "transparent",
              color: active ? "#6BAADF" : "#FFFFFF",
              opacity: isSoon ? 0.5 : 1,
              cursor: isSoon ? "default" : undefined,
            };
            const inner = (
              <>
                {active && !collapsed && (
                  <span
                    className="absolute left-0 top-0 bottom-0 w-1 rounded-r"
                    style={{ backgroundColor: "#6BAADF" }}
                  />
                )}
                {!collapsed && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 inline-block"
                    style={{ backgroundColor: STATUS_DOT[item.status] }}
                  />
                )}
                <span className="relative inline-flex items-center">
                  <ModuleIcon id={item.id} />
                  {collapsed && (
                    <span
                      className="absolute rounded-full"
                      style={{
                        top: -3,
                        right: -5,
                        width: 8,
                        height: 8,
                        backgroundColor: STATUS_DOT[item.status],
                        border: "1px solid #0F2A4A",
                      }}
                      aria-hidden
                    />
                  )}
                </span>
                {!collapsed && (
                  <>
                    <span style={{ fontSize: 14, flex: 1 }}>{item.label}</span>
                    {item.status === "preview" && (
                      <span style={{ fontSize: 11, color: "#D97706" }}>Preview</span>
                    )}
                    {item.status === "soon" && (
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>Soon</span>
                    )}
                  </>
                )}
              </>
            );

            if (isSoon) {
              return (
                <div
                  key={item.id}
                  title={collapsed ? `${item.label} — coming soon` : undefined}
                  className={baseCls}
                  style={style}
                >
                  {inner}
                </div>
              );
            }

            return (
              <Link
                key={item.id}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={baseCls}
                style={style}
              >
                {inner}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className={`py-6 ${collapsed ? "px-3" : "px-6"}`}>
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            title={collapsed ? "Settings" : undefined}
            className={`w-full flex items-center ${collapsed ? "justify-center px-2" : "gap-3 px-3"} py-2 rounded-lg transition hover:bg-white/5 mb-6`}
            style={{ color: "#FFFFFF" }}
          >
            <SettingsIcon />
            {!collapsed && <span style={{ fontSize: 14 }}>Settings</span>}
          </button>
        )}
        {!collapsed && (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, lineHeight: 1.5 }}>
            Powered by Gemma 4 · Running locally via Ollama
          </div>
        )}
      </div>
    </aside>
  );
}

export default function Sidebar({
  profile,
  onSettingsClick,
  collapsed,
  onToggleCollapse,
}: {
  profile: StudentProfile | null;
  onSettingsClick?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <Suspense>
      <SidebarInner
        profile={profile}
        onSettingsClick={onSettingsClick}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
      />
    </Suspense>
  );
}
