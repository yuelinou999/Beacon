// Client-side translate helper for <BilingualSubtitle/> and any other UI
// surface that wants to display non-Chinese translations of short English
// strings via /api/translate.
//
// Cache: persistent in localStorage (translations don't change once
// generated; same text+lang always maps to the same output). Cache hits
// return synchronously without an API call. Misses fire one /api/translate
// POST and cache the result.
//
// Concurrency: while a fetch is in flight for a given (text, lang), other
// callers requesting the same key wait on the same promise — no duplicate
// network requests.

import type {
  TranslateRequest,
  TranslateResponse,
  TranslateTargetLanguage,
} from "./types";

const CACHE_KEY = "beacon_translation_cache_v1";

type CacheMap = Record<string, string>;

function cacheKey(text: string, lang: TranslateTargetLanguage): string {
  return `${lang}::${text}`;
}

function readCache(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as CacheMap;
    return {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or disabled — accept the loss; cache will rebuild.
  }
}

// In-flight request dedup: if two callers ask for the same (text, lang)
// simultaneously, both await the same promise.
const inflight = new Map<string, Promise<string>>();

export function getCachedTranslation(
  text: string,
  lang: TranslateTargetLanguage,
): string | null {
  const key = cacheKey(text, lang);
  const cache = readCache();
  return cache[key] ?? null;
}

export async function translate(
  text: string,
  lang: TranslateTargetLanguage,
  signal?: AbortSignal,
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const key = cacheKey(trimmed, lang);
  const cache = readCache();
  if (cache[key]) return cache[key];

  // Dedup concurrent calls for the same key.
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const body: TranslateRequest = { text: trimmed, targetLanguage: lang };
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText.slice(0, 160)}`);
    }
    const data = (await res.json()) as TranslateResponse;
    const translation = (data.translation ?? "").trim();
    if (!translation) throw new Error("empty_translation");

    // Persist
    const fresh = readCache();
    fresh[key] = translation;
    writeCache(fresh);
    return translation;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
