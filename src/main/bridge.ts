import type { CueScript } from "../core/cue-model";
import { compileCueScriptFromMarkdown } from "../core/cue-compiler";
import type { SourceStatus, TranscriptChunk } from "../core/transcript-source";
import type { TrackerEvent } from "../core/tracker";
import { CloudStreamingSource } from "../sources/cloud-source";
import { MockTranscriptSource } from "../sources/mock-source";
import { NativeTranscriptSource } from "../sources/native-source";
import type { CuelyBridge, DisplayInfo, HotkeyAction } from "../shared/bridge";
import { TrackerService } from "./tracker-service";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface BridgeOptions {
  script: CueScript;
  cwd?: string;
}

export function createCuelyBridge(options: BridgeOptions): CuelyBridge {
  let activeScript = options.script;
  const cwd = options.cwd ?? process.cwd();
  const hotkeyListeners = new Set<(action: HotkeyAction) => void>();
  const trackerListeners = new Set<(event: TrackerEvent) => void>();
  const sourceStatusListeners = new Set<(status: SourceStatus) => void>();
  let latestSourceStatus: SourceStatus = { state: "idle" };
  let trackerService = new TrackerService(activeScript, activeScript.config);
  let unsubscribeTrackerRelay: (() => void) | null = null;
  let unsubscribeSourceRelay: (() => void) | null = null;

  const attachRelay = (service: TrackerService): void => {
    unsubscribeTrackerRelay?.();
    unsubscribeSourceRelay?.();
    unsubscribeTrackerRelay = service.onTrackerEvent((event) => {
      for (const listener of trackerListeners) {
        listener(event);
      }
    });
    unsubscribeSourceRelay = service.onSourceStatus((status) => {
      latestSourceStatus = status;
      for (const listener of sourceStatusListeners) {
        listener(status);
      }
    });
  };
  attachRelay(trackerService);

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
    async loadScript(path?: string): Promise<CueScript> {
      if (!path) {
        return activeScript;
      }

      const nextScript = await loadCueScript(path, cwd);
      await trackerService.stopSource();
      trackerService = new TrackerService(nextScript, nextScript.config);
      activeScript = nextScript;
      attachRelay(trackerService);
      return nextScript;
    },
    async selectSource(kind: "mock" | "cloud" | "native", opts?: Record<string, unknown>): Promise<void> {
      if (kind === "mock") {
        const chunks = chunksFromUnknown(opts?.chunks);
        const timeScale = typeof opts?.timeScale === "number" ? opts.timeScale : undefined;
        await trackerService.selectSource(new MockTranscriptSource(chunks, { timeScale }));
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
    async triggerHotkey(action: HotkeyAction): Promise<void> {
      trackerService.applyHotkey(action);
      emitHotkey(hotkeyListeners, action);
    },
    onSourceStatus(cb: (s: SourceStatus) => void): () => void {
      sourceStatusListeners.add(cb);
      cb(latestSourceStatus);
      return () => sourceStatusListeners.delete(cb);
    },
    onTrackerEvent(cb: (e: TrackerEvent) => void): () => void {
      trackerListeners.add(cb);
      return () => trackerListeners.delete(cb);
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

function chunksFromUnknown(chunks: unknown): TranscriptChunk[] {
  if (!Array.isArray(chunks)) {
    return [];
  }
  return chunks
    .filter((value): value is { text: string; final: boolean; at: number; confidence?: number } => {
      if (typeof value !== "object" || value === null) {
        return false;
      }
      const candidate = value as Record<string, unknown>;
      return typeof candidate.text === "string" && typeof candidate.final === "boolean" && typeof candidate.at === "number";
    })
    .map((chunk) => ({ ...chunk }));
}

async function loadCueScript(path: string, cwd: string): Promise<CueScript> {
  const absolutePath = path.startsWith("/") ? path : resolve(cwd, path);
  const content = await readFile(absolutePath, "utf8");
  const isMarkdown = /\.md(?:own)?$/iu.test(absolutePath);
  if (isMarkdown) {
    return compileCueScriptFromMarkdown(content);
  }
  return validateCueScriptJson(JSON.parse(content));
}

function validateCueScriptJson(raw: unknown): CueScript {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Cue script JSON must be an object.");
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1) {
    throw new Error("Cue script JSON must have version = 1.");
  }
  if (!Array.isArray(record.cues) || record.cues.length === 0) {
    throw new Error("Cue script JSON must include a non-empty cues array.");
  }
  return raw as CueScript;
}
