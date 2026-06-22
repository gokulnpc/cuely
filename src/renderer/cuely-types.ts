export type AppView = "script" | "settings";
export type Theme = "dark" | "light";
export type TranscriptionSource = "native" | "cloud" | "mock";
export type ReadingWidth = "narrow" | "comfortable" | "wide";
export type OverlayPos = "top" | "bottom";

export interface Cue {
  id: string;
  text: string;
  keywords: string[];
  notes: string;
}

export type KeyBindAction =
  | "next"
  | "prev"
  | "top"
  | "close"
  | "compact"
  | "opacityDown"
  | "opacityUp";

export interface KeyBind {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
  label: string;
}

export type KeyBindMap = Record<KeyBindAction, KeyBind>;

export interface PresetCue {
  text: string;
  keywords?: string[];
  notes?: string;
}

export interface Preset {
  title: string;
  session: string;
  cues: PresetCue[];
}
