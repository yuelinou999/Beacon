"use client";

import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

interface MathRendererProps {
  content: string | null | undefined;
  className?: string;
}

// Render a string that may contain LaTeX math expressions.
// Inline math: $...$
// Display math: $$...$$
// Non-math text passes through as-is. Unparseable LaTeX falls back to plain text.

export default function MathRenderer({ content, className }: MathRendererProps) {
  // Defensive coercion: type says string|null|undefined but in practice
  // callers occasionally pass non-string values (stale HMR module cache,
  // malformed LLM payload bypassing TS, etc.). Normalize at the boundary
  // so renderMathContent below can assume a real string.
  const safeContent = typeof content === "string" ? content : "";
  const html = useMemo(() => renderMathContent(safeContent), [safeContent]);
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function renderMathContent(text: string): string {
  // Belt-and-suspenders — even though the only caller now coerces, this
  // function is also called recursively / indirectly and the cost of the
  // typeof check is zero compared to a runtime crash inside dangerouslySet.
  if (typeof text !== "string") return "";

  // Process display math first ($$...$$), then inline ($...$).
  // We split on patterns and render each segment.

  const segments: string[] = [];
  let remaining = text;

  // Display math: $$...$$
  while (true) {
    const start = remaining.indexOf("$$");
    if (start === -1) break;
    const end = remaining.indexOf("$$", start + 2);
    if (end === -1) break;

    segments.push(escapeHtml(remaining.slice(0, start)));
    const latex = remaining.slice(start + 2, end);
    segments.push(renderLatex(latex, true));
    remaining = remaining.slice(end + 2);
  }
  segments.push(remaining);

  // Now process inline math in the joined result
  const joined = segments.join("");
  return processInlineMath(joined);
}

function processInlineMath(text: string): string {
  // Match $...$ but not $$. Use a simple scan approach.
  const parts: string[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip already-rendered katex spans (from display math)
    if (text.startsWith('<span class="katex', i)) {
      const closeTag = "</span>";
      // Find the matching close — katex output has nested spans,
      // so find the katex-html close
      let depth = 0;
      let j = i;
      while (j < text.length) {
        if (text[j] === "<" && text.startsWith("<span", j)) depth++;
        if (text[j] === "<" && text.startsWith("</span>", j)) {
          depth--;
          if (depth === 0) {
            j += closeTag.length;
            break;
          }
        }
        j++;
      }
      parts.push(text.slice(i, j));
      i = j;
      continue;
    }

    if (text[i] === "$" && text[i + 1] !== "$") {
      const end = text.indexOf("$", i + 1);
      if (end !== -1 && end > i + 1) {
        const latex = text.slice(i + 1, end);
        // Unescape HTML entities that might have been escaped
        const unescaped = latex.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
        parts.push(renderLatex(unescaped, false));
        i = end + 1;
        continue;
      }
    }

    parts.push(text[i]);
    i++;
  }

  return parts.join("");
}

// Tags that show up when a small LLM regurgitates KaTeX/MathML output it saw
// during training. Detected verbatim inside $...$ delimiters, these would
// otherwise be re-typeset by KaTeX (strict:false makes it accept anything),
// producing italic angle-bracket soup instead of refusing to render.
const RENDERED_MATH_LEAK = /<(?:mrow|mfrac|mn|mo|mi|msup|msub|msqrt|math|semantics|annotation|span\s+class="katex)/i;

function renderLatex(latex: string, displayMode: boolean): string {
  if (RENDERED_MATH_LEAK.test(latex)) {
    return escapeHtml(latex);
  }
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: false,
    });
  } catch {
    // Fallback: show raw text
    return `<code>${escapeHtml(latex)}</code>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br/>");
}
