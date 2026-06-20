import type { Cue } from "../cue-model";
import type { TranscriptChunk } from "../transcript-source";

export interface KeywordMatcherOptions {
  recencyHalfLifeMs: number;
}

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "to",
  "we",
  "with",
  "you",
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function deriveKeywordsFromCueText(text: string, maxKeywords = 5): string[] {
  return unique(tokenize(text)).slice(0, maxKeywords);
}

export function cueKeywords(cue: Cue): string[] {
  if (cue.keywords && cue.keywords.length > 0) {
    return unique(cue.keywords.map((kw) => normalizeText(kw)).filter(Boolean));
  }

  return deriveKeywordsFromCueText(cue.text);
}

export function scoreCueWithKeywords(
  cue: Cue,
  chunks: TranscriptChunk[],
  nowMs: number,
  options: KeywordMatcherOptions,
): number {
  const keywords = cueKeywords(cue);
  if (keywords.length === 0 || chunks.length === 0) {
    return 0;
  }

  const halfLife = Math.max(options.recencyHalfLifeMs, 1);
  let weightedHits = 0;

  for (const chunk of chunks) {
    const normalized = normalizeText(typeof chunk.text === "string" ? chunk.text : "");
    if (!normalized) {
      continue;
    }

    const ageMs = Math.max(nowMs - chunk.at, 0);
    const recencyWeight = Math.pow(0.5, ageMs / halfLife);
    const perChunkHitCount = keywords.reduce((acc, keyword) => {
      return normalized.includes(keyword) ? acc + 1 : acc;
    }, 0);

    if (perChunkHitCount > 0) {
      weightedHits += (perChunkHitCount / keywords.length) * recencyWeight;
    }
  }

  return Math.min(1, weightedHits);
}
