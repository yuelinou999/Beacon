"use client";

import { CSSProperties, useEffect, useState } from "react";
import { getBilingual, getSecondLanguage } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { translate, getCachedTranslation } from "@/lib/translate";
import type { TranslateTargetLanguage } from "@/lib/types";

// <BilingualSubtitle/> — render a translated subtitle under an English label
// when bilingual mode is on.
//
//   bilingual OFF                  → renders nothing
//   bilingual ON, no second lang   → renders nothing (settings incomplete)
//   bilingual ON, second lang = zh → renders fallbackZh from curriculum.json
//                                     (no API call — already in our data)
//   bilingual ON, second lang = X  → fetches /api/translate(english, X) and
//                                     renders the result; nothing while
//                                     loading; nothing if the fetch fails
//                                     (degrades silently — bilingual is
//                                     decoration, not load-bearing UX)
//
// Reads settings directly + subscribes to onSettingsChanged so it lives
// independently of any parent's bilingual state. Cache hits resolve
// synchronously via getCachedTranslation so the first paint after a cache
// warm-up shows the translation without a flash of empty.

const VALID_LANGS: TranslateTargetLanguage[] = ["zh", "hi", "es", "sw", "fr", "ar"];

function isValidLang(s: string): s is TranslateTargetLanguage {
  return (VALID_LANGS as string[]).includes(s);
}

interface BilingualSubtitleProps {
  english: string;
  fallbackZh?: string;
  className?: string;
  style?: CSSProperties;
}

export default function BilingualSubtitle({
  english,
  fallbackZh,
  className,
  style,
}: BilingualSubtitleProps) {
  const [bilingual, setBilingual] = useState(false);
  const [secondLang, setSecondLang] = useState<string>("");

  // Settings sync — initial read + same-tab event + cross-tab focus.
  useEffect(() => {
    const refresh = () => {
      setBilingual(getBilingual());
      setSecondLang(getSecondLanguage());
    };
    refresh();
    window.addEventListener("focus", refresh);
    const unsub = onSettingsChanged(refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      unsub();
    };
  }, []);

  const lang: TranslateTargetLanguage | null = isValidLang(secondLang) ? secondLang : null;

  // For non-zh languages, seed with cache hit synchronously to avoid a flash
  // of empty on every render. Effect below handles the network case.
  const cachedSync =
    lang && lang !== "zh" && english ? getCachedTranslation(english, lang) : null;
  const [translated, setTranslated] = useState<string | null>(cachedSync);

  useEffect(() => {
    if (!bilingual || !lang || lang === "zh" || !english) {
      setTranslated(null);
      return;
    }
    // Sync cache lookup first (covers the case where settings refreshed
    // after the initial useState ran).
    const cached = getCachedTranslation(english, lang);
    if (cached) {
      setTranslated(cached);
      return;
    }
    setTranslated(null);
    const controller = new AbortController();
    let cancelled = false;
    translate(english, lang, controller.signal)
      .then((t) => {
        if (!cancelled) setTranslated(t);
      })
      .catch((err) => {
        // Bilingual is decoration — fail silently in UI; surface tech
        // detail in console for diagnosis.
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("[bilingual-subtitle] translate failed:", err);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [bilingual, lang, english]);

  if (!bilingual || !english) return null;
  if (!lang) return null;

  if (lang === "zh") {
    if (!fallbackZh) return null;
    return (
      <span className={className} style={style}>
        {fallbackZh}
      </span>
    );
  }

  if (!translated) return null;
  return (
    <span className={className} style={style}>
      {translated}
    </span>
  );
}
