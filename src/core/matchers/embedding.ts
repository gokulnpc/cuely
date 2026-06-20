import type { Cue } from "../cue-model";
import type { TranscriptChunk } from "../transcript-source";

export interface EmbeddingMatcherOptions {
  enabled: boolean;
}

export function scoreCueWithEmbeddings(
  _cue: Cue,
  _chunks: TranscriptChunk[],
  _options: EmbeddingMatcherOptions,
): number {
  void _cue;
  void _chunks;
  void _options;
  return 0;
}
