"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Sidebar from "@/components/sidebar";
import Topbar from "@/components/topbar";
import SettingsModal from "@/components/settings-modal";
import { getStudentName } from "@/components/settings-modal";
import BrowserAIDownloadModal from "@/components/browser-ai-download-modal";
import AIPanel from "@/components/ai-panel";
import { AIContextProvider, useAIContext } from "@/components/ai-context";
import { loadProfile } from "@/lib/progress";
import type { StudentProfile } from "@/lib/types";
import curriculum from "@/data/curriculum.json";

function getBreadcrumbs(pathname: string, quizTopicId: string | null) {
  if (pathname === "/") {
    return { title: "Beacon", breadcrumbs: [{ label: "Home" }] };
  }
  if (pathname.startsWith("/subject/")) {
    return {
      title: "Mathematics",
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Mathematics" },
      ],
    };
  }
  if (pathname === "/practice") {
    return {
      title: "Practice",
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Mathematics", href: "/subject/math" },
        { label: "Practice" },
      ],
    };
  }
  if (pathname === "/quiz") {
    if (quizTopicId) {
      const topic = (
        curriculum.topics as Array<{ id: string; title: { en: string } }>
      ).find((t) => t.id === quizTopicId);
      if (topic?.title?.en) {
        return {
          title: topic.title.en,
          breadcrumbs: [
            { label: "Home", href: "/" },
            { label: "Mathematics", href: "/subject/math" },
            { label: "Quiz" },
            { label: topic.title.en },
          ],
        };
      }
    }
    return {
      title: "Quiz",
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Mathematics", href: "/subject/math" },
        { label: "Quiz" },
      ],
    };
  }
  if (pathname === "/review") {
    return {
      title: "Review",
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Review" },
      ],
    };
  }
  if (pathname === "/dashboard") {
    return {
      title: "Dashboard",
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Dashboard" },
      ],
    };
  }
  if (pathname.startsWith("/learn-v2/")) {
    const topicId = pathname.replace("/learn-v2/", "");
    const topic = (
      curriculum.topics as Array<{ id: string; title: { en: string } }>
    ).find((t) => t.id === topicId);
    const topicLabel = topic?.title.en ?? "Lesson";
    return {
      title: topicLabel,
      breadcrumbs: [
        { label: "Home", href: "/" },
        { label: "Mathematics", href: "/subject/math" },
        { label: "Learn" },
        { label: topicLabel },
      ],
    };
  }
  return { title: pathname.slice(1) || "Beacon", breadcrumbs: [{ label: "Home", href: "/" }] };
}

function ExpandButton({ target }: { target: "center" | "panel" }) {
  const { expanded, toggleExpand } = useAIContext();
  const isExpanded = expanded === target;

  return (
    <button
      onClick={() => toggleExpand(target)}
      className="text-muted hover:text-navy transition p-1"
      title={isExpanded ? "Restore layout" : "Expand"}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {isExpanded ? (
          <>
            <polyline points="4 14 10 14 10 20"/>
            <polyline points="20 10 14 10 14 4"/>
            <line x1="14" y1="10" x2="21" y2="3"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </>
        ) : (
          <>
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </>
        )}
      </svg>
    </button>
  );
}

function RenderedTopbar({
  pathname,
  subtitle,
  quizTopicId,
}: {
  pathname: string;
  subtitle?: string;
  quizTopicId: string | null;
}) {
  const { title, breadcrumbs } = getBreadcrumbs(pathname, quizTopicId);
  return (
    <Topbar
      title={title}
      subtitle={subtitle}
      breadcrumbs={breadcrumbs}
      rightContent={<ExpandButton target="center" />}
    />
  );
}

function QuizTopbarLoader({
  pathname,
  subtitle,
}: {
  pathname: string;
  subtitle?: string;
}) {
  const searchParams = useSearchParams();
  const quizTopicId = searchParams.get("topic");
  return (
    <RenderedTopbar
      pathname={pathname}
      subtitle={subtitle}
      quizTopicId={quizTopicId}
    />
  );
}

function ShellTopbar({
  pathname,
  subtitle,
}: {
  pathname: string;
  subtitle?: string;
}) {
  if (pathname === "/quiz") {
    return (
      <Suspense
        fallback={
          <RenderedTopbar
            pathname={pathname}
            subtitle={subtitle}
            quizTopicId={null}
          />
        }
      >
        <QuizTopbarLoader pathname={pathname} subtitle={subtitle} />
      </Suspense>
    );
  }
  return (
    <RenderedTopbar
      pathname={pathname}
      subtitle={subtitle}
      quizTopicId={null}
    />
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { expanded, toggleExpand: toggle } = useAIContext();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [studentName, setStudentName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Hydration guard. Server SSR + the very first client render must
  // produce identical HTML; once `mounted` flips to true after hydration,
  // we're free to render localStorage-derived content (student name,
  // bilingual subtitle, persisted toggles, etc.). This avoids the
  // "Expected server HTML to contain matching <p> in <div>" hydration
  // mismatch that fires when studentName is populated from localStorage
  // and the topbar's conditional subtitle <p> appears asymmetrically.
  const [mounted, setMounted] = useState(false);

  const refreshProfile = useCallback(() => {
    setProfile(loadProfile());
    setStudentName(getStudentName());
  }, []);

  useEffect(() => {
    setMounted(true);
    refreshProfile();
    const onFocus = () => refreshProfile();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshProfile();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === "beacon_student_profile") refreshProfile();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshProfile]);

  useEffect(() => {
    refreshProfile();
  }, [pathname, refreshProfile]);

  // Gate subtitle on `mounted` — see hydration guard comment above.
  // Until React confirms hydration is done, server and first client
  // render both produce subtitle=undefined → no <p> in topbar tree.
  const subtitle = mounted && pathname === "/" && studentName
    ? `Welcome back, ${studentName}`
    : undefined;

  const aiPanelHidden = pathname === "/dashboard";
  const centerHidden = expanded === "panel" && !aiPanelHidden;

  return (
    <div className="flex h-screen bg-surface">
      <Sidebar
        profile={profile}
        onSettingsClick={() => setSettingsOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div
        className="flex flex-1 transition-[margin-left] duration-200"
        style={{ marginLeft: sidebarCollapsed ? 60 : 240 }}
      >
        {/* Center content */}
        {centerHidden ? (
          <div
            className="w-10 bg-surface border-r border-border flex flex-col items-center justify-center cursor-pointer hover:bg-card transition shrink-0"
            onClick={() => toggle("panel")}
          >
            <span className="text-muted text-xs" style={{ writingMode: "vertical-rl" }}>Content</span>
            <span className="text-muted mt-2">&rsaquo;</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-w-[380px]">
            <ShellTopbar pathname={pathname} subtitle={subtitle} />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        )}

        {/* AI panel — hidden on /dashboard (full-width design) */}
        {!aiPanelHidden && <AIPanel />}
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onProfileChange={refreshProfile}
      />

      {/* Renders only when the WebLLM engine is loading or errored —
          silent in idle/ready states. Mounted at shell level so the
          download progress / error UI overlays any page the learner
          is on, not just /review. Self-contained: subscribes to the
          engine status stream, no props needed. */}
      <BrowserAIDownloadModal />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AIContextProvider>
      <ShellInner>{children}</ShellInner>
    </AIContextProvider>
  );
}
