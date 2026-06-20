import type { CueScript } from "../core/cue-model";
import type { SourceStatus, TranscriptSource } from "../core/transcript-source";
import { CueTracker, type CueTrackerConfig, type TrackerEvent } from "../core/tracker";
import type { HotkeyAction } from "../shared/bridge";

export interface TrackerServiceSnapshot {
  script: CueScript;
  following: boolean;
  positionIndex: number;
}

export class TrackerService {
  private readonly script: CueScript;
  private readonly tracker: CueTracker;
  private readonly trackerListeners = new Set<(event: TrackerEvent) => void>();
  private readonly sourceStatusListeners = new Set<(status: SourceStatus) => void>();
  private currentSource: TranscriptSource | null = null;
  private detachSourceChunk: (() => void) | null = null;
  private detachSourceStatus: (() => void) | null = null;
  private following = true;
  private sourceStatus: SourceStatus = { state: "idle" };

  constructor(script: CueScript, config?: Partial<CueTrackerConfig>) {
    this.script = script;
    this.tracker = new CueTracker(script, config);
    this.tracker.on((event) => {
      for (const listener of this.trackerListeners) {
        listener(event);
      }
    });
  }

  onTrackerEvent(listener: (event: TrackerEvent) => void): () => void {
    this.trackerListeners.add(listener);
    return () => this.trackerListeners.delete(listener);
  }

  onSourceStatus(listener: (status: SourceStatus) => void): () => void {
    this.sourceStatusListeners.add(listener);
    listener(this.sourceStatus);
    return () => this.sourceStatusListeners.delete(listener);
  }

  async selectSource(source: TranscriptSource): Promise<void> {
    await this.disconnectCurrentSource();
    this.currentSource = source;
    this.detachSourceChunk = source.onChunk((chunk) => {
      if (!this.following) {
        return;
      }
      this.tracker.pushTranscript(chunk);
    });
    this.detachSourceStatus = source.onStatus((status) => {
      this.publishStatus(status);
    });
    try {
      await source.start();
    } catch (error) {
      this.following = false;
      try {
        await source.stop();
      } catch {
        // Ignore source-stop failures while handling startup errors.
      }
      this.clearCurrentSourceBindings();
      if (this.sourceStatus.state !== "error") {
        const message =
          error instanceof Error ? error.message : "transcription source failed to start";
        this.publishStatus({ state: "error", message, recoverable: false });
      }
      throw error;
    }
  }

  async stopSource(): Promise<void> {
    await this.disconnectCurrentSource();
  }

  getSnapshot(): TrackerServiceSnapshot {
    return {
      script: this.script,
      following: this.following,
      positionIndex: this.tracker.position.index,
    };
  }

  applyHotkey(action: HotkeyAction): void {
    if (action === "toggle-following") {
      this.following = !this.following;
      return;
    }

    if (action === "toggle-visible") {
      return;
    }

    const current = this.tracker.position.index;
    if (action === "top") {
      this.tracker.setPosition(0);
      return;
    }
    if (action === "next") {
      this.tracker.setPosition(current + 1);
      return;
    }
    if (action === "prev") {
      this.tracker.setPosition(current - 1);
    }
  }

  setPosition(index: number): void {
    this.tracker.setPosition(index);
  }

  pushTranscriptForTesting(text: string, at: number): void {
    if (!this.following) {
      return;
    }
    this.tracker.pushTranscript({ text, final: true, at });
  }

  private async disconnectCurrentSource(): Promise<void> {
    if (this.currentSource !== null) {
      await this.currentSource.stop();
    }
    this.clearCurrentSourceBindings();
    this.publishStatus({ state: "idle" });
  }

  private clearCurrentSourceBindings(): void {
    this.detachSourceChunk?.();
    this.detachSourceStatus?.();
    this.currentSource = null;
    this.detachSourceChunk = null;
    this.detachSourceStatus = null;
  }

  private publishStatus(status: SourceStatus): void {
    this.sourceStatus = status;
    if (status.state === "error") {
      this.following = false;
    }
    for (const listener of this.sourceStatusListeners) {
      listener(status);
    }
  }
}
