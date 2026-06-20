import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import type {
  SourceStatus,
  TranscriptChunk,
  TranscriptListener,
  TranscriptSource,
} from "../src/core/transcript-source";
import { TrackerService } from "../src/main/tracker-service";

class FailingTranscriptSource implements TranscriptSource {
  public readonly kind = "cloud" as const;

  private readonly chunkListeners = new Set<TranscriptListener>();
  private readonly statusListeners = new Set<(status: SourceStatus) => void>();

  async start(): Promise<void> {
    this.emitStatus({
      state: "error",
      message: "transcription provider unavailable",
      recoverable: false,
    });
    throw new Error("transcription provider unavailable");
  }

  async stop(): Promise<void> {
    this.emitStatus({ state: "idle" });
  }

  onChunk(listener: TranscriptListener): () => void {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  onStatus(listener: (s: SourceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener({ state: "idle" });
    return () => this.statusListeners.delete(listener);
  }

  emitChunk(chunk: TranscriptChunk): void {
    for (const listener of this.chunkListeners) {
      listener(chunk);
    }
  }

  private emitStatus(status: SourceStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

class HealthyTranscriptSource implements TranscriptSource {
  public readonly kind = "mock" as const;

  private readonly statusListeners = new Set<(status: SourceStatus) => void>();

  async start(): Promise<void> {
    this.emitStatus({ state: "listening" });
  }

  async stop(): Promise<void> {
    this.emitStatus({ state: "idle" });
  }

  onChunk(_listener: TranscriptListener): () => void {
    void _listener;
    return () => undefined;
  }

  onStatus(listener: (s: SourceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener({ state: "idle" });
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(status: SourceStatus): void {
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }
}

function createScript(): CueScript {
  return {
    version: 1,
    cues: [
      { id: "c1", text: "Intro", keywords: ["intro"] },
      { id: "c2", text: "Ask", keywords: ["ask"] },
    ],
  };
}

describe("TrackerService", () => {
  it("degrades to manual mode after source error", async () => {
    const service = new TrackerService(createScript());
    const statuses: SourceStatus[] = [];
    const offStatus = service.onSourceStatus((status) => statuses.push(status));

    await expect(service.selectSource(new FailingTranscriptSource())).rejects.toThrow(
      /provider unavailable/i,
    );

    expect(service.getSnapshot().following).toBe(false);
    expect(statuses.some((status) => status.state === "error")).toBe(true);

    service.applyHotkey("toggle-following");
    expect(service.getSnapshot().following).toBe(false);

    offStatus();
  });

  it("can recover to a healthy source after startup failure", async () => {
    const service = new TrackerService(createScript());
    const statuses: SourceStatus[] = [];
    const offStatus = service.onSourceStatus((status) => statuses.push(status));

    await expect(service.selectSource(new FailingTranscriptSource())).rejects.toThrow(
      /provider unavailable/i,
    );
    await expect(service.selectSource(new HealthyTranscriptSource())).resolves.toBeUndefined();

    expect(statuses.some((status) => status.state === "listening")).toBe(true);

    offStatus();
  });
});
