"use client";

import { CSSProperties, useEffect, useState } from "react";
import { getBilingual, getSecondLanguage } from "@/components/settings-modal";
import { onSettingsChanged } from "@/lib/settings-events";
import { translate, getCachedTranslation } from "@/lib/translate";
import type { TranslateTargetLanguage } from "@/lib/types";

// Note on hydration safety: do NOT seed useState from getCachedTranslation()
// at render time. localStorage is server-empty / client-populated, which
// would diverge SSR HTML from the first client render and trip a hydration
// mismatch. State always starts null; the effect below reads cache + runs
// fetch after mount. Cost: a brief empty flash on warm-cache loads, which
// is acceptable for a decorative subtitle.

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
  // Optional inline separator rendered BEFORE the translated text. Use when
  // embedding the subtitle in a sentence ("Mathematics · {topic} · {trans}").
  // Skipped when nothing renders, so no orphan separators.
  prefix?: string;
  className?: string;
  style?: CSSProperties;
}

export default function BilingualSubtitle({
  english,
  fallbackZh,
  prefix,
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

  // Always start null — see hydration note at top of file.
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    if (!bilingual || !lang || lang === "zh" || !english) {
      setTranslated(null);
      return;
    }
    // Cache hit paints next render synchronously without a network round
    // trip. Cold path falls through to translate().
    const cached = getCachedTranslation(english, lang);
    if (cached) {
      setTranslated(cached);
      return;
    }
    setTranslated(null);
    // Local cancelled flag protects against late setState after unmount or
    // dependency change. Note: we deliberately do NOT abort the underlying
    // fetch — translate() shares a single promise across concurrent callers
    // (in-flight dedup), and aborting here would cancel the request for
    // every other component that joined it. The fetch runs to completion
    // and warms the cache for next time.
    let cancelled = false;
    translate(english, lang)
      .then((t) => {
        if (!cancelled) setTranslated(t);
      })
      .catch((err) => {
        // Bilingual is decoration — fail silently in UI; surface tech
        // detail in console for diagnosis.
        console.warn("[bilingual-subtitle] translate failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [bilingual, lang, english]);

  if (!bilingual || !english) return null;
  if (!lang) return null;

  if (lang === "zh") {
    if (!fallbackZh) return null;
    return (
      <span className={className} style={style}>
        {prefix}
        {fallbackZh}
      </span>
    );
  }

  if (!translated) return null;
  return (
    <span className={className} style={style}>
      {prefix}
      {translated}
    </span>
  );
}
