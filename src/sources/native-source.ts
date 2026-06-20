import type {
  SourceStatus,
  TranscriptListener,
  TranscriptSource,
} from "../core/transcript-source";

export class NativeTranscriptSource implements TranscriptSource {
  public readonly kind = "native" as const;

  private readonly chunkListeners = new Set<TranscriptListener>();
  private readonly statusListeners = new Set<(status: SourceStatus) => void>();
  private status: SourceStatus = { state: "idle" };

  async start(): Promise<void> {
    this.setStatus({ state: "error", message: "Not available in cloud builds.", recoverable: true });
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
