import type {
  SourceStatus,
  TranscriptChunk,
  TranscriptListener,
  TranscriptSource,
} from "../core/transcript-source";

export interface MockTranscriptSourceOptions {
  now?: () => number;
  setTimeoutFn?: (cb: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  timeScale?: number;
}

export class MockTranscriptSource implements TranscriptSource {
  public readonly kind = "mock" as const;

  private readonly chunkListeners = new Set<TranscriptListener>();
  private readonly statusListeners = new Set<(status: SourceStatus) => void>();
  private readonly now: () => number;
  private readonly setTimeoutFn: (
    cb: () => void,
    delayMs: number,
  ) => unknown;
  private readonly clearTimeoutFn: (id: unknown) => void;
  private readonly timeScale: number;
  private readonly script: TranscriptChunk[];
  private readonly timerIds: unknown[] = [];
  private status: SourceStatus = { state: "idle" };
  private started = false;

  constructor(script: TranscriptChunk[], options: MockTranscriptSourceOptions = {}) {
    this.script = [...script].sort((a, b) => a.at - b.at);
    this.now = options.now ?? (() => Date.now());
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn =
      options.clearTimeoutFn ??
      ((id) => {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      });
    this.timeScale = options.timeScale && options.timeScale > 0 ? options.timeScale : 1;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;
    this.setStatus({ state: "listening" });
    this.scheduleScript();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }

    this.started = false;
    while (this.timerIds.length > 0) {
      const timerId = this.timerIds.pop();
      if (timerId !== undefined) {
        this.clearTimeoutFn(timerId);
      }
    }

    this.setStatus({ state: "idle" });
  }

  onChunk(listener: TranscriptListener): () => void {
    this.chunkListeners.add(listener);
    return () => {
      this.chunkListeners.delete(listener);
    };
  }

  onStatus(listener: (s: SourceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private scheduleScript(): void {
    if (this.script.length === 0) {
      return;
    }

    const firstChunk = this.script[0];
    if (!firstChunk) {
      return;
    }
    const firstAt = firstChunk.at;
    const startAt = this.now();

    for (const chunk of this.script) {
      const normalizedDelay = Math.max(0, (chunk.at - firstAt) / this.timeScale);
      const timerId = this.setTimeoutFn(() => {
        if (!this.started) {
          return;
        }

        this.emitChunk({
          ...chunk,
          at: startAt + normalizedDelay,
        });
      }, normalizedDelay);
      this.timerIds.push(timerId);
    }
  }

  private emitChunk(chunk: TranscriptChunk): void {
    for (const listener of this.chunkListeners) {
      listener(chunk);
    }
  }

  private setStatus(status: SourceStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
