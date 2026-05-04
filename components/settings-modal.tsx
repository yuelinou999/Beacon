"use client";

import { useState, useEffect } from "react";
import { X, User, Globe, Users, AlertTriangle } from "lucide-react";
import { resetProfile } from "@/lib/progress";
import { emitSettingsChanged } from "@/lib/settings-events";

const STUDENT_NAME_KEY = "beacon_student_name";
const BILINGUAL_KEY = "beacon_bilingual";
const GRADE_KEY = "beacon_grade";
const COUNTRY_KEY = "beacon_country";
const SECOND_LANG_KEY = "beacon_second_language";

export function getStudentName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STUDENT_NAME_KEY) || "";
}

export function getBilingual(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BILINGUAL_KEY) === "true";
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
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (open) {
      setName(getStudentName());
      setGrade(getGrade());
      setCountry(getCountry());
      setBilingual(getBilingual());
      setSecondLang(getSecondLanguage());
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
