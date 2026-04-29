"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import type { StudentProfile } from "@/lib/types";
import subjects from "@/data/subjects";

type ModuleId = "home" | "learn" | "practice" | "quiz" | "review" | "dashboard";
type ModuleStatus = "ready" | "preview" | "soon";

interface NavItem {
  id: ModuleId;
  href: string;
  label: string;
  status: ModuleStatus;
}

const navItems: NavItem[] = [
  { id: "home", href: "/", label: "Home", status: "ready" },
  { id: "learn", href: "/learn-v2/solving_one_step", label: "Learn", status: "ready" },
  { id: "practice", href: "/practice", label: "Practice", status: "ready" },
  { id: "quiz", href: "/quiz", label: "Quiz", status: "soon" },
  { id: "review", href: "/review", label: "Review", status: "soon" },
  { id: "dashboard", href: "/dashboard", label: "Dashboard", status: "ready" },
];

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

  const isNavActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const mathActive = pathname.startsWith("/subject/math") || pathname === "/learn" || pathname === "/practice";

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

            if (isActive) {
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
            }
            return (
              <div
                key={subj.id}
                className={baseCls}
                style={style}
                title={collapsed ? subj.name : undefined}
              >
                {row}
              </div>
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
