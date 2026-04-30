"use client";

import Link from "next/link";
import { ChevronLeft, Clock, FileText, BarChart3, Lock } from "lucide-react";
import type { QuizBank, TopicWithPhases } from "@/lib/curriculum-types";

interface StartPhaseProps {
  quiz: QuizBank;
  topic: TopicWithPhases;
  onStart: () => void;
}

export default function StartPhaseView({ quiz, topic, onStart }: StartPhaseProps) {
  return (
    <div className="max-w-2xl mx-auto px-8 py-12">
      <Link
        href="/subject/math"
        className="flex items-center gap-2 transition-colors hover:opacity-70 mb-8"
        style={{ color: "#2563EB" }}
      >
        <ChevronLeft size={16} />
        <span style={{ fontSize: "14px" }}>Back to course</span>
      </Link>

      <div
        className="rounded-xl p-10 text-center"
        style={{ backgroundColor: "#FFFFFF", border: "1px solid #E2E5EA" }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ backgroundColor: "#EFF6FF" }}
        >
          <FileText size={32} style={{ color: "#2563EB" }} />
        </div>

        <h1 style={{ fontSize: "24px", fontWeight: 500, color: "#0F2A4A", marginBottom: "8px" }}>
          {quiz.title}
        </h1>
        <p style={{ fontSize: "14px", color: "#6B7280", marginBottom: "32px" }}>
          {quiz.description}
        </p>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: "#F5F6F8" }}
          >
            <FileText size={18} style={{ color: "#6B7280", margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "#1F2937", fontWeight: 500 }}>
              {quiz.questions.length} questions
            </p>
          </div>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: "#F5F6F8" }}
          >
            <Clock size={18} style={{ color: "#6B7280", margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "#1F2937", fontWeight: 500 }}>
              ~{quiz.estimated_minutes} minutes
            </p>
          </div>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: "#F5F6F8" }}
          >
            <BarChart3 size={18} style={{ color: "#6B7280", margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "#1F2937", fontWeight: 500 }}>
              {quiz.difficulty_label}
            </p>
          </div>
          <div
            className="rounded-lg p-4"
            style={{ backgroundColor: "#F5F6F8" }}
          >
            <Lock size={18} style={{ color: "#6B7280", margin: "0 auto 8px" }} />
            <p style={{ fontSize: "13px", color: "#1F2937", fontWeight: 500 }}>No hints available</p>
          </div>
        </div>

        {/* Rules */}
        <div
          className="rounded-lg p-5 mb-8 text-left"
          style={{ backgroundColor: "#EFF6FF" }}
        >
          <ul className="space-y-2" style={{ fontSize: "14px", color: "#1E40AF", lineHeight: 1.6 }}>
            <li>&bull; This is a formal assessment. You won&apos;t see answers until the end.</li>
            <li>&bull; The AI assistant is paused during the quiz &mdash; you&apos;re on your own!</li>
            <li>&bull; Your results will appear in your Dashboard analysis.</li>
          </ul>
        </div>

        {/* Topics covered */}
        <p style={{ fontSize: "12px", color: "#9CA3AF", marginBottom: "32px" }}>
          Covers: Variables, Expressions, One-step equations, Inverse operations
        </p>

        {/* Buttons */}
        <button
          onClick={onStart}
          className="w-full px-8 py-4 rounded-lg mb-4 transition-colors"
          style={{ backgroundColor: "#0F2A4A", color: "#FFFFFF", fontSize: "16px", fontWeight: 500 }}
        >
          Start quiz &rarr;
        </button>
        <Link
          href={`/practice?topic=${topic.id}`}
          className="inline-block transition-colors hover:underline"
          style={{ fontSize: "14px", color: "#6B7280" }}
        >
          Not ready &mdash; go back to Practice
        </Link>
      </div>
    </div>
  );
}
