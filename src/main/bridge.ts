import type { CueScript } from "../core/cue-model";
import { CloudStreamingSource } from "../sources/cloud-source";
import { MockTranscriptSource } from "../sources/mock-source";
import { NativeTranscriptSource } from "../sources/native-source";
import type { CuelyBridge, DisplayInfo, HotkeyAction } from "../shared/bridge";
import type { TrackerEvent } from "../core/tracker";
import type { SourceStatus } from "../core/transcript-source";
import { TrackerService } from "./tracker-service";

export interface BridgeOptions {
  script: CueScript;
}

export function createCuelyBridge(options: BridgeOptions): CuelyBridge {
  const trackerService = new TrackerService(options.script, options.script.config);
  const hotkeyListeners = new Set<(action: HotkeyAction) => void>();

  return {
    async setContentProtection(_on: boolean): Promise<void> {
      void _on;
      return;
    },
    async setAlwaysOnTop(_on: boolean): Promise<void> {
      void _on;
      return;
    },
    async listDisplays(): Promise<DisplayInfo[]> {
      return [{ id: 1, label: "Primary display", primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
    },
    async moveToDisplay(_displayId: number): Promise<void> {
      void _displayId;
      return;
    },
    async setMirror(_on: boolean): Promise<void> {
      void _on;
      return;
    },
    async loadScript(): Promise<CueScript> {
      return options.script;
    },
    async selectSource(kind: "mock" | "cloud" | "native", opts?: Record<string, unknown>): Promise<void> {
      if (kind === "mock") {
        const chunks = Array.isArray(opts?.chunks) ? opts.chunks : [];
        await trackerService.selectSource(MockTranscriptSourceFromUnknown(chunks));
        return;
      }
      if (kind === "cloud") {
        await trackerService.selectSource(
          new CloudStreamingSource({ provider: "deepgram", apiKeyEnv: "DEEPGRAM_API_KEY" }),
        );
        return;
      }
      await trackerService.selectSource(new NativeTranscriptSource());
    },
    onSourceStatus(cb: (s: SourceStatus) => void): () => void {
      return trackerService.onSourceStatus(cb);
    },
    onTrackerEvent(cb: (e: TrackerEvent) => void): () => void {
      return trackerService.onTrackerEvent(cb);
    },
    onHotkey(cb: (action: HotkeyAction) => void): () => void {
      hotkeyListeners.add(cb);
      return () => hotkeyListeners.delete(cb);
    },
  };
}

export function emitHotkey(hotkeyListeners: Set<(action: HotkeyAction) => void>, action: HotkeyAction): void {
  for (const listener of hotkeyListeners) {
    listener(action);
  }
}

function MockTranscriptSourceFromUnknown(chunks: unknown[]): MockTranscriptSource {
  const safeChunks = chunks
    .filter((value): value is { text: string; final: boolean; at: number; confidence?: number } => {
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const candidate = value as Record<string, unknown>;
      return typeof candidate.text === "string" && typeof candidate.final === "boolean" && typeof candidate.at === "number";
    })
    .map((chunk) => ({ ...chunk }));
  return new MockTranscriptSource(safeChunks);
}
