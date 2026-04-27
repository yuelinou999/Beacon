"use client";

import { useState, useEffect } from "react";
import { loadProfile, saveProfile, resetProfile } from "@/lib/progress";

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

  const handleSaveName = (val: string) => {
    setName(val);
    localStorage.setItem(STUDENT_NAME_KEY, val);
  };

  const handleGrade = (val: string) => {
    setGrade(val);
    localStorage.setItem(GRADE_KEY, val);
  };

  const handleCountry = (val: string) => {
    setCountry(val);
    localStorage.setItem(COUNTRY_KEY, val);
  };

  const handleBilingual = (val: boolean) => {
    setBilingual(val);
    localStorage.setItem(BILINGUAL_KEY, String(val));
    onProfileChange();
  };

  const handleSecondLang = (val: string) => {
    setSecondLang(val);
    localStorage.setItem(SECOND_LANG_KEY, val);
    onProfileChange();
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
    onProfileChange();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-card rounded-xl shadow-xl w-full max-w-md p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-heading-sm text-navy">Settings</h3>
          <button onClick={onClose} className="text-muted hover:text-navy text-xl leading-none">&times;</button>
        </div>

        {/* Multi-student hint */}
        <div className="space-y-2">
          <p className="text-label uppercase text-muted">Student profiles</p>
          <div className="flex items-center justify-between py-2 px-3 bg-surface rounded-lg">
            <span className="text-[13px] text-body font-medium">{name || "Student 1"}</span>
            <button
              onClick={() => {}}
              className="text-[11px] text-muted hover:text-blue transition flex items-center gap-1"
              title="Coming soon"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add student
            </button>
          </div>
          <p className="text-[10px] text-muted">Multi-student profiles coming soon. Use &quot;Reset progress&quot; to switch students.</p>
        </div>

        {/* Student profile section */}
        <div className="space-y-4 pt-2 border-t border-border">
          <p className="text-label uppercase text-muted">Student details</p>

          {/* Student name */}
          <div>
            <label className="text-xs text-muted block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleSaveName(e.target.value)}
              placeholder="Enter your name"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-body focus:outline-none focus:border-blue"
            />
          </div>

          {/* Grade level */}
          <div>
            <label className="text-xs text-muted block mb-1">Age / Grade level</label>
            <select
              value={grade}
              onChange={(e) => handleGrade(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-body focus:outline-none focus:border-blue bg-white"
            >
              <option value="">Select grade</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Country */}
          <div>
            <label className="text-xs text-muted block mb-1">Country</label>
            <select
              value={country}
              onChange={(e) => handleCountry(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-body focus:outline-none focus:border-blue bg-white"
            >
              <option value="">Select country</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Language section */}
        <div className="space-y-4 pt-2 border-t border-border">
          <p className="text-label uppercase text-muted">Language</p>

          {/* Interface language */}
          <div>
            <label className="text-xs text-muted block mb-1">Interface language</label>
            <select
              disabled
              className="w-full border border-border rounded-lg px-3 py-2 text-sm text-muted bg-surface"
            >
              <option>English</option>
            </select>
          </div>

          {/* Bilingual mode */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-body">Bilingual mode</span>
            <button
              onClick={() => handleBilingual(!bilingual)}
              className={`w-10 h-5 rounded-full transition relative ${bilingual ? "bg-blue" : "bg-gray-300"}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition ${bilingual ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          {/* Second language (only when bilingual ON) */}
          {bilingual && (
            <div>
              <label className="text-xs text-muted block mb-1">Second language</label>
              <select
                value={secondLang}
                onChange={(e) => handleSecondLang(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-body focus:outline-none focus:border-blue bg-white"
              >
                <option value="">Select language</option>
                {SECOND_LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Data section */}
        <div className="pt-2 border-t border-border">
          <p className="text-label uppercase text-muted mb-3">Data</p>
          <button
            onClick={handleReset}
            className={`text-sm px-4 py-2 rounded-lg transition ${
              confirmReset
                ? "bg-danger text-white"
                : "border border-danger text-danger hover:bg-danger-bg"
            }`}
          >
            {confirmReset ? "Confirm reset — this cannot be undone" : "Reset all progress"}
          </button>
        </div>
      </div>
    </div>
  );
}
