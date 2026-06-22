export interface OverlayCue {
  id: string;
  text: string;
}

export interface OverlayKeyBind {
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  code: string;
  label: string;
}

export type OverlayKeyBindAction =
  | "next"
  | "prev"
  | "top"
  | "close"
  | "compact"
  | "opacityDown"
  | "opacityUp";

export type OverlayKeyBindMap = Record<OverlayKeyBindAction, OverlayKeyBind>;

export interface OverlayPresentState {
  cues: OverlayCue[];
  currentIndex: number;
  overlayOpacity: number;
  overlayCompact: boolean;
  overlayPos: "top" | "bottom";
  fontScale: number;
  mirror: boolean;
  keybinds: OverlayKeyBindMap;
}

export type OverlayAction =
  | { type: "next" }
  | { type: "prev" }
  | { type: "close" }
  | { type: "set-opacity"; value: number }
  | { type: "toggle-compact" }
  | { type: "snap-vertical" };
