"use client";

import { Check } from "lucide-react";

interface PhaseProgressProps {
  currentPhase: 1 | 2 | 3 | 4 | 5 | "complete";
}

export default function PhaseProgress({ currentPhase }: PhaseProgressProps) {
  const stepIndex = currentPhase === "complete" ? 6 : currentPhase;
  const phases = [
    { num: 1, label: "Concept", completed: stepIndex > 1 },
    { num: 2, label: "Analogy", completed: stepIndex > 2 },
    { num: 3, label: "Example", completed: stepIndex > 3 },
    { num: 4, label: "Guided", completed: stepIndex > 4 },
    { num: 5, label: "Independent", completed: currentPhase === "complete" },
  ];

  return (
    <div className="mb-10">
      <div className="flex items-center justify-center gap-2 mb-3">
        {phases.map((phase, index) => (
          <div key={phase.num} className="flex items-center">
            <div className="relative">
              {phase.completed ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#059669" }}
                >
                  <Check size={16} style={{ color: "#FFFFFF" }} />
                </div>
              ) : currentPhase === phase.num ? (
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center relative"
                  style={{ backgroundColor: "#2563EB" }}
                >
                  <span style={{ color: "#FFFFFF", fontSize: "14px", fontWeight: 500 }}>
                    {phase.num}
                  </span>
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ backgroundColor: "#2563EB" }}
                  />
                </div>
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ border: "2px solid #E2E5EA", backgroundColor: "#FFFFFF" }}
                >
                  <span style={{ color: "#9CA3AF", fontSize: "13px" }}>{phase.num}</span>
                </div>
              )}
            </div>
            {index < phases.length - 1 && (
              <div
                className="w-16 h-0.5 mx-1"
                style={{ backgroundColor: phase.completed ? "#059669" : "#E2E5EA" }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="text-center" style={{ fontSize: "13px", color: "#6B7280" }}>
        {currentPhase === 1 && "Step 1: Learn the concept"}
        {currentPhase === 2 && "Step 2: Real-life connection"}
        {currentPhase === 3 && "Step 3: Watch an example"}
        {currentPhase === 4 && "Step 4: Try with help"}
        {currentPhase === 5 && "Step 5: Practice on your own"}
        {currentPhase === "complete" && "Lesson complete!"}
      </div>
    </div>
  );
}
