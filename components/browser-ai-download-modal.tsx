"use client";

// Browser-AI download progress overlay.
//
// Renders when the WebLLM engine is in `loading` or `error` state. Idle
// and ready states render nothing — the modal exists exclusively to
// surface long-running first-load progress and surface failures the
// learner can act on.
//
// First load: Plan B (Gemma 2 2B) is ~1.6 GB. Spike data showed ~70 s
// download on a 24 MB/s connection; on Xiaomei's old Android tablet it
// will be longer. Without this overlay the learner would just see the
// settings toggle flip on and nothing visible would happen for minutes —
// they'd assume it was broken. The overlay also gives a graceful path
// to dismiss / retry on failure.
//
// Mounted once at the AppShell level so it can render over any page.
// Subscribes to the engine status stream — no prop wiring needed.

import { useEffect, useState } from "react";
import { X, AlertTriangle, Sparkles } from "lucide-react";
import type { EngineStatus } from "@/lib/webllm-engine";
import { subscribe } from "@/lib/webllm-engine";

export default function BrowserAIDownloadModal() {
  const [status, setStatus] = useState<EngineStatus>({ phase: "idle" });
  // Allow the user to dismiss the modal even while loading is in
  // progress — they can keep using Beacon while the model finishes.
  //
  // Reset semantics: dismissed must reset whenever a NEW loading
  // session starts (e.g. user dismissed an error, toggled off, then
  // toggled on again — ensureEngine() reboots and we want the modal
  // to re-appear). The engine state machine never goes back to "idle"
  // on its own (loading → ready or loading → error are the only
  // post-mount transitions; see lib/webllm-engine.ts), so a "reset on
  // idle" rule alone would silently suppress the modal forever after
  // a single dismiss + retry cycle. Reset on loading-entry instead.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let prevPhase: EngineStatus["phase"] | null = null;
    const unsubscribe = subscribe((s) => {
      setStatus(s);
      // Fresh loading session — un-dismiss so progress is visible
      // again. Covers: initial boot, retry after error, future
      // toggle-driven engine restarts.
      if (s.phase === "loading" && prevPhase !== "loading") {
        setDismissed(false);
      }
      // Belt-and-suspenders: if engine state ever does return to
      // idle, also reset (no current code path produces this, but
      // it's the obvious "fresh start" signal and costs nothing).
      if (s.phase === "idle") setDismissed(false);
      prevPhase = s.phase;
    });
    return unsubscribe;
  }, []);

  // Render conditions: only loading or error states show UI. Idle and
  // ready are silent — engine is either un-needed or already serving.
  if (status.phase === "idle" || status.phase === "ready") return null;
  if (dismissed) return null;

  const isError = status.phase === "error";
  const progressPct = status.phase === "loading" ? Math.round(status.progress * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
    >
      <div
        className="rounded-xl shadow-2xl max-w-md w-full mx-4"
        style={{ backgroundColor: "#FFFFFF" }}
      >
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "#E2E5EA" }}
        >
          <div className="flex items-center gap-2">
            {isError ? (
              <AlertTriangle size={18} style={{ color: "#EF4444" }} />
            ) : (
              <Sparkles size={18} style={{ color: "#2563EB" }} />
            )}
            <h2 style={{ fontSize: "16px", fontWeight: 500, color: "#0F2A4A" }}>
              {isError ? "Browser AI couldn't load" : "Setting up browser AI"}
            </h2>
          </div>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="p-1.5 rounded-lg transition-colors hover:bg-gray-100"
          >
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="px-6 py-5">
          {isError ? (
            <>
              <p style={{ fontSize: "14px", color: "#1F2937", lineHeight: 1.6, marginBottom: "8px" }}>
                Gemma 2 2B couldn&rsquo;t download or initialize.
              </p>
              <p
                className="font-mono"
                style={{
                  fontSize: "12px",
                  color: "#6B7280",
                  backgroundColor: "#F9FAFB",
                  padding: "10px 12px",
                  borderRadius: "6px",
                  marginBottom: "12px",
                  wordBreak: "break-word",
                }}
              >
                {status.message}
              </p>
              <p style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.5 }}>
                Most common causes: no internet on first download, browser
                doesn&rsquo;t support WebGPU, or the model cache is partially
                corrupted. Try toggling browser-AI off and on again in
                Settings to retry.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "14px", color: "#1F2937", lineHeight: 1.6, marginBottom: "16px" }}>
                Downloading Gemma 2 2B (~1.6&nbsp;GB). This is a one-time
                setup; afterward AI tutoring works without an internet
                connection.
              </p>

              <div
                className="w-full h-2 rounded-full mb-2"
                style={{ backgroundColor: "#E5E7EB" }}
              >
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: "#2563EB",
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span
                  className="font-mono"
                  style={{ fontSize: "11px", color: "#6B7280" }}
                >
                  {status.text}
                </span>
                <span
                  style={{ fontSize: "12px", color: "#1F2937", fontWeight: 500 }}
                >
                  {progressPct}%
                </span>
              </div>

              <p style={{ fontSize: "12px", color: "#9CA3AF", marginTop: "16px", lineHeight: 1.5 }}>
                You can keep using Beacon — close this dialog and we&rsquo;ll
                let you know when AI is ready.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
