"use client";

import { useState, useEffect } from "react";
import { X, User, Globe, Users, AlertTriangle, Cpu, Sparkles } from "lucide-react";
import { resetProfile } from "@/lib/progress";
import { emitSettingsChanged } from "@/lib/settings-events";
import { loadXiaomeiDemoProfile } from "@/lib/demo-profile";

const STUDENT_NAME_KEY = "beacon_student_name";
const BILINGUAL_KEY = "beacon_bilingual";
const GRADE_KEY = "beacon_grade";
const COUNTRY_KEY = "beacon_country";
const SECOND_LANG_KEY = "beacon_second_language";
const BROWSER_AI_KEY = "beacon_browser_ai";

export function getStudentName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STUDENT_NAME_KEY) || "";
}

export function getBilingual(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BILINGUAL_KEY) === "true";
}

// Read the "Browser-side AI" toggle. When true, AI features (currently
// /review's "show me a different way") run inference locally via
// WebLLM + Gemma 2 2B instead of routing to /api/explain (Ollama).
//
// The Day 1-2 spike's L2 cold-restart verification is what makes this
// honest: with the toggle on AND model already downloaded, AI tutoring
// works with no network connection — the demo claim that pillar A
// of the 14-day plan is built around.
export function getBrowserAI(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BROWSER_AI_KEY) === "true";
}

export function getGrade(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(GRADE_KEY) || "";
}

export function getCountry(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(COUNTRY_KEY) || "";
}

export function getSecondLanguage(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(SECOND_LANG_KEY) || "";
}

const GRADES = ["Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const COUNTRIES = [
  "United States", "China", "India", "Mexico", "Brazil",
  "Nigeria", "Kenya", "Philippines", "Indonesia", "Other",
];
const SECOND_LANGUAGES = [
  { value: "zh", label: "Chinese 中文" },
  { value: "hi", label: "Hindi हिन्दी" },
  { value: "es", label: "Spanish Español" },
  { value: "sw", label: "Swahili" },
  { value: "fr", label: "French Français" },
  { value: "ar", label: "Arabic العربية" },
];

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  onProfileChange: () => void;
}

export default function SettingsModal({ open, onClose, onProfileChange }: SettingsModalProps) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [country, setCountry] = useState("");
  const [bilingual, setBilingual] = useState(false);
  const [secondLang, setSecondLang] = useState("");
  const [browserAI, setBrowserAIState] = useState(false);
  const [webGpuOk, setWebGpuOk] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (open) {
      setName(getStudentName());
      setGrade(getGrade());
      setCountry(getCountry());
      setBilingual(getBilingual());
      setSecondLang(getSecondLanguage());
      setBrowserAIState(getBrowserAI());
      // WebGPU is the runtime requirement for WebLLM. Detect once on
      // modal open so we can disable the toggle on browsers that don't
      // expose it (older Safari, iOS pre-17, Firefox without flag).
      setWebGpuOk(
        typeof navigator !== "undefined" && "gpu" in navigator,
      );
      setConfirmReset(false);
    }
  }, [open]);

  if (!open) return null;

  // Auto-save on every change. The Close/Done buttons in the footer just
  // dismiss — fields persist to localStorage as the user edits them.
  // This keeps the diff small vs. a buffered-form refactor; see the footer
  // comment for the full reasoning.
  //
  // Every handler emits two signals:
  //   1. emitSettingsChanged() — same-tab DOM event for pages that read
  //      settings into local state (e.g. getBilingual() readers).
  //   2. onProfileChange() — AppShell-scoped callback to refresh its
  //      profile-derived UI (e.g. Sidebar's student-name display).
  // Both fire on every handler so behavior is uniform across fields.

  const notifyChanged = () => {
    emitSettingsChanged();
    onProfileChange();
  };

  const handleSaveName = (val: string) => {
    setName(val);
    localStorage.setItem(STUDENT_NAME_KEY, val);
    notifyChanged();
  };

  const handleGrade = (val: string) => {
    setGrade(val);
    localStorage.setItem(GRADE_KEY, val);
    notifyChanged();
  };

  const handleCountry = (val: string) => {
    setCountry(val);
    localStorage.setItem(COUNTRY_KEY, val);
    notifyChanged();
  };

  const handleBilingual = (val: boolean) => {
    setBilingual(val);
    localStorage.setItem(BILINGUAL_KEY, String(val));
    notifyChanged();
  };

  const handleSecondLang = (val: string) => {
    setSecondLang(val);
    localStorage.setItem(SECOND_LANG_KEY, val);
    notifyChanged();
  };

  // Browser-AI toggle. Persists immediately, then on the ON-edge
  // dynamic-imports the WebLLM engine and pre-warms the download.
  // Dynamic import is critical: it keeps WebLLM out of the eager
  // chunk that loads on every page (settings-modal mounts at app
  // shell level), so users who never enable browser-AI never pay
  // the WebLLM bundle cost.
  //
  // The download progress UI (BrowserAIDownloadModal) listens to the
  // engine's status stream — no need to thread state from here. We
  // fire-and-forget; errors surface in the download modal, not in
  // settings (settings stays a configuration surface, not an inference
  // ops surface).
  //
  // Toggle-OFF emits an explicit reset to the engine status stream so
  // the download modal's subscribers see a fresh "idle" signal. This
  // makes a subsequent toggle-ON re-trigger the modal cleanly even if
  // the user had dismissed it during a prior load. Weight cache is
  // untouched — toggling off doesn't redownload on toggle-back-on.
  const handleBrowserAI = (val: boolean) => {
    setBrowserAIState(val);
    localStorage.setItem(BROWSER_AI_KEY, String(val));
    notifyChanged();
    if (val) {
      void import("@/lib/webllm-engine").then(({ ensureEngine }) => {
        // Swallow errors — BrowserAIDownloadModal renders the failure
        // state via the status subscription. Re-throwing here would
        // surface as an unhandled-promise console warning.
        ensureEngine().catch(() => {});
      });
    } else {
      void import("@/lib/webllm-engine").then(({ resetStatusToIdle }) => {
        resetStatusToIdle();
      });
    }
  };

  // Demo profile loader. Writes a populated Xiaomei profile + settings
  // to localStorage so the Family view's KPIs / mastery distribution /
  // mistake taxonomy / activity strip all show real numbers when
  // recording the demo video. Honest-labeled in the UI as a demo
  // helper, not a product feature — judges who explore Settings will
  // see the explanatory copy.
  const handleLoadXiaomeiDemo = () => {
    loadXiaomeiDemoProfile();
    // Sync local state so the modal reflects the new persisted values
    // before the user closes it.
    setName("Xiaomei");
    setGrade("Grade 7");
    setCountry("China");
    setBilingual(true);
    setSecondLang("zh");
    notifyChanged();
    onClose();
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetProfile();
    localStorage.removeItem(STUDENT_NAME_KEY);
    localStorage.removeItem(GRADE_KEY);
    localStorage.removeItem(COUNTRY_KEY);
    localStorage.removeItem(SECOND_LANG_KEY);
    localStorage.removeItem(BILINGUAL_KEY);
    // Clear Browser-AI toggle alongside the rest. Without this,
    // "Reset all progress" leaves Browser-AI on if it was on,
    // which is inconsistent with how every other setting behaves
    // and surprises users who expect a clean slate.
    localStorage.removeItem(BROWSER_AI_KEY);
    notifyChanged();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#FFFFFF" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div
          className="flex items-center justify-between px-8 py-6 border-b sticky top-0"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E5EA", zIndex: 10 }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: 500, color: "#0F2A4A" }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 rounded-lg transition-colors hover:bg-gray-100"
          >
            <X size={20} style={{ color: "#6B7280" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-6 space-y-8">
          {/* Student Profile */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <User size={18} style={{ color: "#0F2A4A" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                Student profile
              </h3>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="settings-name"
                  style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px", display: "block" }}
                >
                  Name
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(e) => handleSaveName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF", fontSize: "14px" }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="settings-grade"
                    style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px", display: "block" }}
                  >
                    Grade
                  </label>
                  <select
                    id="settings-grade"
                    value={grade}
                    onChange={(e) => handleGrade(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF", fontSize: "14px" }}
                  >
                    <option value="">Select grade</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="settings-country"
                    style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px", display: "block" }}
                  >
                    Country
                  </label>
                  <select
                    id="settings-country"
                    value={country}
                    onChange={(e) => handleCountry(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF", fontSize: "14px" }}
                  >
                    <option value="">Select country</option>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Language */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Globe size={18} style={{ color: "#0F2A4A" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                Language
              </h3>
            </div>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="settings-interface-lang"
                  style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px", display: "block" }}
                >
                  Interface language
                </label>
                <select
                  id="settings-interface-lang"
                  disabled
                  className="w-full px-4 py-3 rounded-lg border focus:outline-none"
                  style={{ borderColor: "#E2E5EA", backgroundColor: "#F5F6F8", color: "#9CA3AF", fontSize: "14px" }}
                >
                  <option>English</option>
                </select>
              </div>

              {/* Bilingual toggle row */}
              <div
                className="flex items-center justify-between p-4 rounded-lg"
                style={{ backgroundColor: "#F5F6F8" }}
              >
                <div>
                  <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500, marginBottom: "4px" }}>
                    Bilingual mode
                  </div>
                  <div style={{ fontSize: "12px", color: "#6B7280" }}>
                    Show translations alongside primary language
                  </div>
                </div>
                <button
                  onClick={() => handleBilingual(!bilingual)}
                  role="switch"
                  aria-checked={bilingual}
                  aria-label="Toggle bilingual mode"
                  className="w-11 h-6 rounded-full transition relative"
                  style={{ backgroundColor: bilingual ? "#2563EB" : "#D1D5DB" }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: bilingual ? "22px" : "2px" }}
                  />
                </button>
              </div>

              {/* Second language picker — only when bilingual ON */}
              {bilingual && (
                <div>
                  <label
                    htmlFor="settings-second-lang"
                    style={{ fontSize: "13px", color: "#6B7280", marginBottom: "8px", display: "block" }}
                  >
                    Second language
                  </label>
                  <select
                    id="settings-second-lang"
                    value={secondLang}
                    onChange={(e) => handleSecondLang(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: "#E2E5EA", backgroundColor: "#FFFFFF", fontSize: "14px" }}
                  >
                    <option value="">Select language</option>
                    {SECOND_LANGUAGES.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* AI Engine — browser-side vs server-side toggle.
              Demo-critical surface: this is where the "truly offline
              browser Gemma" pillar A claim is exposed to the learner. */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Cpu size={18} style={{ color: "#0F2A4A" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                AI engine
              </h3>
            </div>
            <div className="space-y-3">
              <div
                className="flex items-center justify-between p-4 rounded-lg"
                style={{
                  backgroundColor: "#F5F6F8",
                  opacity: webGpuOk ? 1 : 0.6,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500, marginBottom: "4px" }}>
                    Browser-side AI (offline)
                  </div>
                  <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.5 }}>
                    Run Gemma 2 2B directly in your browser. First time
                    enables a one-time ~1.6&nbsp;GB download; after that
                    AI tutoring works with no internet.
                  </div>
                </div>
                <button
                  onClick={() => webGpuOk && handleBrowserAI(!browserAI)}
                  role="switch"
                  aria-checked={browserAI}
                  aria-label="Toggle browser-side AI"
                  disabled={!webGpuOk}
                  className="w-11 h-6 rounded-full transition relative shrink-0"
                  style={{
                    backgroundColor: browserAI ? "#2563EB" : "#D1D5DB",
                    cursor: webGpuOk ? "pointer" : "not-allowed",
                    marginLeft: "16px",
                  }}
                >
                  <span
                    className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                    style={{ left: browserAI ? "22px" : "2px" }}
                  />
                </button>
              </div>
              {!webGpuOk && (
                <div
                  className="px-4 py-3 rounded-lg"
                  style={{ backgroundColor: "#FEF3C7", border: "1px solid #FCD34D" }}
                >
                  <div style={{ fontSize: "12px", color: "#92400E", lineHeight: 1.5 }}>
                    Your browser doesn&rsquo;t expose WebGPU, which is required
                    for browser-side AI. Try Chrome 113+, Edge, or Safari 17+
                    on a recent device.
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Student Profiles (multi-student placeholder) */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Users size={18} style={{ color: "#0F2A4A" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                Student profiles
              </h3>
            </div>
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: "#E2E5EA", backgroundColor: "#FAFBFC" }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500 }}>
                    {name || "Student 1"} (Current)
                  </div>
                  <div style={{ fontSize: "12px", color: "#6B7280" }}>
                    {grade ? `${grade} · ` : ""}Mathematics
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#059669" }} />
              </div>
              <button
                disabled
                title="Multi-student profiles coming soon"
                className="w-full px-4 py-2.5 rounded-lg border mt-3"
                style={{
                  borderColor: "#E2E5EA",
                  backgroundColor: "#FFFFFF",
                  color: "#9CA3AF",
                  fontSize: "13px",
                  cursor: "not-allowed",
                }}
              >
                + Add another student
              </button>
              <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: "8px", textAlign: "center" }}>
                Multi-student profiles coming soon. Use &ldquo;Reset all progress&rdquo; below to switch students.
              </div>
            </div>
          </section>

          {/* Demo helpers — for hackathon recording / quick walk-throughs.
              Honestly labeled so judges exploring Settings see exactly
              what this is. Not a product feature; ships in this build
              because the alternative — recording a video on a fresh
              empty profile — would show zeros across the Family view
              and undersell the efficacy HUD. */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Sparkles size={18} style={{ color: "#0F2A4A" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#0F2A4A" }}>
                Demo helpers
              </h3>
            </div>
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: "#E2E5EA", backgroundColor: "#FAFBFC" }}
            >
              <div style={{ fontSize: "14px", color: "#1F2937", fontWeight: 500, marginBottom: "8px" }}>
                Load Xiaomei demo profile
              </div>
              <div style={{ fontSize: "12px", color: "#6B7280", marginBottom: "16px", lineHeight: 1.5 }}>
                Populate the app with a realistic 30-day learning history for
                the persona <strong>Xiaomei</strong> &mdash; rural Yunnan,
                China, 12 y/o, Mandarin bilingual. Useful for screenshots or
                video recording: the Family view shows real KPIs, the
                weakest-topics list has content, and recent mistakes appear in
                /review. Overwrites any existing profile.
              </div>
              <button
                type="button"
                onClick={handleLoadXiaomeiDemo}
                className="px-5 py-2.5 rounded-lg transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: "#0F2A4A",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  border: "none",
                }}
              >
                Load Xiaomei demo profile
              </button>
            </div>
          </section>

          {/* Danger Zone */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <AlertTriangle size={18} style={{ color: "#EF4444" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 500, color: "#EF4444" }}>
                Danger zone
              </h3>
            </div>
            <div
              className="p-5 rounded-lg border"
              style={{ borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }}
            >
              <div style={{ fontSize: "14px", color: "#991B1B", fontWeight: 500, marginBottom: "8px" }}>
                Reset all progress
              </div>
              <div style={{ fontSize: "12px", color: "#B91C1C", marginBottom: "16px", lineHeight: 1.5 }}>
                This will permanently delete all learning data, progress, and history for the current
                student. This action cannot be undone.
              </div>
              <button
                onClick={handleReset}
                className="px-5 py-2.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: confirmReset ? "#991B1B" : "#EF4444",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  border: "none",
                }}
              >
                {confirmReset ? "Confirm reset — this cannot be undone" : "Reset all progress"}
              </button>
            </div>
          </section>
        </div>

        {/* Sticky footer.
            Both buttons just dismiss the modal. Field changes auto-save on
            every interaction (see localStorage writes above), so there's
            nothing to commit. Reference labels these "Cancel / Save changes"
            but here neither button has anything to cancel or save — buffering
            form state would require a broader refactor — so the labels are
            "Close / Done" to be honest about behavior. */}
        <div
          className="px-8 py-5 border-t flex justify-end gap-3 sticky bottom-0"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E2E5EA" }}
        >
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg border transition-colors hover:bg-gray-50"
            style={{ borderColor: "#E2E5EA", color: "#6B7280", fontSize: "14px" }}
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg transition-colors"
            style={{ backgroundColor: "#2563EB", color: "#FFFFFF", fontSize: "14px" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
