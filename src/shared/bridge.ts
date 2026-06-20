import type { CueScript } from "../core/cue-model";
import type { SourceStatus } from "../core/transcript-source";
import type { TrackerEvent } from "../core/tracker";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  label: string;
  primary: boolean;
  bounds: Rect;
}

export type HotkeyAction =
  | "next"
  | "prev"
  | "top"
  | "toggle-following"
  | "toggle-visible";

export interface CuelyBridge {
  setContentProtection(on: boolean): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  listDisplays(): Promise<DisplayInfo[]>;
  moveToDisplay(displayId: number): Promise<void>;
  setMirror(on: boolean): Promise<void>;
  loadScript(path?: string): Promise<CueScript>;
  selectSource(kind: "mock" | "cloud" | "native", opts?: Record<string, unknown>): Promise<void>;
  triggerHotkey(action: HotkeyAction): Promise<void>;
  onSourceStatus(cb: (s: SourceStatus) => void): () => void;
  onTrackerEvent(cb: (e: TrackerEvent) => void): () => void;
  onHotkey(cb: (action: HotkeyAction) => void): () => void;
}

declare global {
  interface Window {
    cuely?: CuelyBridge;
  }
}
