import type { Cue } from "../cue-model";
import type { TranscriptChunk } from "../transcript-source";

export interface LlmJudgeOptions {
  enabled: boolean;
}

export function scoreCueWithLlmJudge(
  _cue: Cue,
  _chunks: TranscriptChunk[],
  _options: LlmJudgeOptions,
): number {
  void _cue;
  void _chunks;
  void _options;
  return 0;
}
