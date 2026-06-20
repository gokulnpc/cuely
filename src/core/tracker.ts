import type { CueScript } from "./cue-model";
import type { TranscriptChunk } from "./transcript-source";
import { scoreCueWithEmbeddings } from "./matchers/embedding";
import { scoreCueWithKeywords } from "./matchers/keyword";
import { scoreCueWithLlmJudge } from "./matchers/llm-judge";

export interface CueTrackerConfig {
  windowMs: number;
  advanceMargin: number;
  minDwellMs: number;
  stickiness: number;
  lookahead: number;
  lowConfidenceMs: number;
  matchers: {
    keyword: { enabled: true; recencyHalfLifeMs: number };
    embedding?: { enabled: boolean };
    llmJudge?: { enabled: boolean };
  };
}

export interface PositionState {
  cueId: string;
  index: number;
  confidence: number;
  source: "voice" | "manual";
}

export type TrackerEvent =
  | { type: "position"; state: PositionState }
  | { type: "unsure"; sinceMs: number }
  | { type: "scores"; perCue: Record<string, number> };

const DEFAULT_CONFIG: CueTrackerConfig = {
  windowMs: 15_000,
  advanceMargin: 0.15,
  minDwellMs: 1_200,
  stickiness: 0.1,
  lookahead: Number.POSITIVE_INFINITY,
  lowConfidenceMs: 8_000,
  matchers: {
    keyword: { enabled: true, recencyHalfLifeMs: 6_000 },
    embedding: { enabled: false },
    llmJudge: { enabled: false },
  },
};

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

export class CueTracker {
  private readonly script: CueScript;
  private readonly config: CueTrackerConfig;
  private readonly listeners = new Set<(e: TrackerEvent) => void>();
  private readonly transcriptWindow: TranscriptChunk[] = [];
  private _position: PositionState;
  private pendingRivalIndex: number | null = null;
  private pendingRivalSince: number | null = null;
  private lowConfidenceSince: number | null = null;
  private unsureEmitted = false;
  private manualCoolOffUntil = 0;
  private lastTimestamp = 0;

  constructor(script: CueScript, config: Partial<CueTrackerConfig> = {}) {
    if (script.cues.length === 0) {
      throw new Error("CueTracker requires at least one cue.");
    }

    this.script = script;
    this.config = this.mergeConfig(config);
    this._position = {
      cueId: script.cues[0].id,
      index: 0,
      confidence: 1,
      source: "voice",
    };
  }

  on(listener: (e: TrackerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get position(): PositionState {
    return this._position;
  }

  setPosition(index: number, opts: { coolOffMs?: number } = {}): void {
    if (!Number.isFinite(index)) {
      return;
    }

    const bounded = Math.min(this.script.cues.length - 1, Math.max(0, Math.trunc(index)));
    const cue = this.script.cues[bounded];
    const coolOffMs = opts.coolOffMs ?? 4_000;

    this.manualCoolOffUntil = Math.max(this.lastTimestamp, 0) + Math.max(coolOffMs, 0);
    this.pendingRivalIndex = null;
    this.pendingRivalSince = null;
    this.lowConfidenceSince = null;
    this.unsureEmitted = false;

    this._position = {
      cueId: cue.id,
      index: bounded,
      confidence: 1,
      source: "manual",
    };

    this.emit({ type: "position", state: this._position });
  }

  pushTranscript(chunk: TranscriptChunk): void {
    try {
      const normalizedChunk = this.normalizeChunk(chunk);
      this.lastTimestamp = Math.max(this.lastTimestamp, normalizedChunk.at);
      this.transcriptWindow.push(normalizedChunk);
      this.pruneWindow(normalizedChunk.at);

      const scoreState = this.computeScores(normalizedChunk.at);
      this.emit({ type: "scores", perCue: scoreState.perCue });

      const currentScore = scoreState.perCue[this.position.cueId] ?? 0;
      const leaderIsRival = scoreState.bestIndex !== this.position.index;
      const rivalLead = scoreState.bestScore - currentScore;
      const clearRivalLead = leaderIsRival && rivalLead > this.config.advanceMargin;
      const canAutoMove = normalizedChunk.at >= this.manualCoolOffUntil;

      if (clearRivalLead && canAutoMove) {
        if (this.pendingRivalIndex !== scoreState.bestIndex) {
          this.pendingRivalIndex = scoreState.bestIndex;
          this.pendingRivalSince = normalizedChunk.at;
        } else if (
          this.pendingRivalSince !== null &&
          normalizedChunk.at - this.pendingRivalSince >= this.config.minDwellMs
        ) {
          const cue = this.script.cues[scoreState.bestIndex];
          this._position = {
            cueId: cue.id,
            index: scoreState.bestIndex,
            confidence: clamp01(scoreState.bestScore),
            source: "voice",
          };
          this.pendingRivalIndex = null;
          this.pendingRivalSince = null;
          this.emit({ type: "position", state: this._position });
        }
      } else {
        this.pendingRivalIndex = null;
        this.pendingRivalSince = null;
      }

      this.updateUnsure(scoreState.bestScore, normalizedChunk.at);
    } catch {
      // Explicitly swallow malformed chunk handling; tracker must never throw.
    }
  }

  private updateUnsure(bestScore: number, now: number): void {
    const threshold = this.config.advanceMargin;
    if (bestScore >= threshold) {
      this.lowConfidenceSince = null;
      this.unsureEmitted = false;
      return;
    }

    if (this.lowConfidenceSince === null) {
      this.lowConfidenceSince = now;
      return;
    }

    const elapsed = now - this.lowConfidenceSince;
    if (!this.unsureEmitted && elapsed >= this.config.lowConfidenceMs) {
      this.unsureEmitted = true;
      this.emit({ type: "unsure", sinceMs: elapsed });
    }
  }

  private computeScores(now: number): {
    perCue: Record<string, number>;
    bestIndex: number;
    bestScore: number;
  } {
    const perCue: Record<string, number> = {};
    let bestIndex = this.position.index;
    let bestScore = -1;
    const searchable = this.searchableIndexes();

    for (let i = 0; i < this.script.cues.length; i += 1) {
      const cue = this.script.cues[i];
      let score = 0;

      if (searchable.has(i)) {
        if (this.config.matchers.keyword.enabled) {
          score += scoreCueWithKeywords(cue, this.transcriptWindow, now, {
            recencyHalfLifeMs: this.config.matchers.keyword.recencyHalfLifeMs,
          });
        }

        if (this.config.matchers.embedding?.enabled) {
          score += scoreCueWithEmbeddings(cue, this.transcriptWindow, { enabled: true });
        }

        if (this.config.matchers.llmJudge?.enabled) {
          score += scoreCueWithLlmJudge(cue, this.transcriptWindow, { enabled: true });
        }
      }

      if (i === this.position.index) {
        score += this.config.stickiness;
      }

      const clampedScore = clamp01(score);
      perCue[cue.id] = clampedScore;

      if (clampedScore > bestScore) {
        bestScore = clampedScore;
        bestIndex = i;
      }
    }

    return {
      perCue,
      bestIndex,
      bestScore: Math.max(bestScore, 0),
    };
  }

  private searchableIndexes(): Set<number> {
    if (!Number.isFinite(this.config.lookahead)) {
      return new Set(this.script.cues.map((_, i) => i));
    }

    const reach = Math.max(Math.trunc(this.config.lookahead), 0);
    const from = Math.max(0, this.position.index - reach);
    const to = Math.min(this.script.cues.length - 1, this.position.index + reach);
    const indexes = new Set<number>();
    for (let i = from; i <= to; i += 1) {
      indexes.add(i);
    }
    return indexes;
  }

  private normalizeChunk(chunk: TranscriptChunk): TranscriptChunk {
    return {
      text: typeof chunk?.text === "string" ? chunk.text : "",
      final: Boolean(chunk?.final),
      at: Number.isFinite(chunk?.at) ? chunk.at : this.lastTimestamp,
      confidence: Number.isFinite(chunk?.confidence) ? chunk.confidence : undefined,
    };
  }

  private pruneWindow(now: number): void {
    const threshold = now - this.config.windowMs;
    while (this.transcriptWindow.length > 0 && this.transcriptWindow[0].at < threshold) {
      this.transcriptWindow.shift();
    }
  }

  private emit(event: TrackerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private mergeConfig(partial: Partial<CueTrackerConfig>): CueTrackerConfig {
    return {
      ...DEFAULT_CONFIG,
      ...partial,
      matchers: {
        ...DEFAULT_CONFIG.matchers,
        ...partial.matchers,
        keyword: {
          ...DEFAULT_CONFIG.matchers.keyword,
          ...partial.matchers?.keyword,
        },
      },
    };
  }
}
