import type { Cue } from "../cue-model";
import type { TranscriptChunk } from "../transcript-source";

export type EmbeddingSimilarityFn = (input: {
  cueText: string;
  cueKeywords: string[];
  transcriptText: string;
}) => number;

export interface EmbeddingMatcherOptions {
  enabled: boolean;
  weight?: number;
  similarityFn?: EmbeddingSimilarityFn;
}

let similarityOverrideForTesting: EmbeddingSimilarityFn | null = null;

export function setEmbeddingSimilarityOverrideForTesting(
  similarityFn: EmbeddingSimilarityFn | null,
): void {
  similarityOverrideForTesting = similarityFn;
}

export function scoreCueWithEmbeddings(
  cue: Cue,
  chunks: TranscriptChunk[],
  options: EmbeddingMatcherOptions,
): number {
  if (!options.enabled || chunks.length === 0) {
    return 0;
  }

  const transcriptText = chunks
    .map((chunk) => (typeof chunk.text === "string" ? chunk.text.trim() : ""))
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();
  if (!transcriptText) {
    return 0;
  }

  const cueKeywords = cue.keywords?.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean) ?? [];
  const similarityFn = options.similarityFn ?? similarityOverrideForTesting;
  const similarity = similarityFn
    ? clamp01(
        similarityFn({
          cueText: cue.text,
          cueKeywords,
          transcriptText,
        }),
      )
    : defaultEmbeddingSimilarity({
        cueText: cue.text,
        cueKeywords,
        transcriptText,
      });
  const weight = options.weight ?? 0.25;
  return clamp01(similarity * Math.max(0, weight));
}

function defaultEmbeddingSimilarity(params: {
  cueText: string;
  cueKeywords: string[];
  transcriptText: string;
}): number {
  const cueTokens = new Set<string>([
    ...tokenize(params.cueText),
    ...params.cueKeywords.flatMap((keyword) => tokenize(keyword)),
  ]);
  const transcriptTokens = new Set<string>(tokenize(params.transcriptText));

  if (cueTokens.size === 0 || transcriptTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of cueTokens) {
    if (transcriptTokens.has(token)) {
      overlap += 1;
    }
  }

  const denominator = cueTokens.size + transcriptTokens.size;
  if (denominator === 0) {
    return 0;
  }
  return clamp01((2 * overlap) / denominator);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .filter((token) => token.length > 2);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
