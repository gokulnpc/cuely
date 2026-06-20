import type {
  SourceStatus,
  TranscriptListener,
  TranscriptSource,
} from "../core/transcript-source";

export class CloudStreamingSource implements TranscriptSource {
  public readonly kind = "cloud" as const;

  private readonly chunkListeners = new Set<TranscriptListener>();
  private readonly statusListeners = new Set<(status: SourceStatus) => void>();
  private status: SourceStatus = { state: "idle" };

  async start(): Promise<void> {
    this.setStatus({ state: "listening" });
  }

  async stop(): Promise<void> {
    this.setStatus({ state: "idle" });
  }

  onChunk(listener: TranscriptListener): () => void {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  onStatus(listener: (s: SourceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: SourceStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}
