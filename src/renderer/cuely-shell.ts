import type { OverlayAction, OverlayPresentState } from "../shared/overlay-protocol";

export interface CuelyShell {
  isOverlayMode(): boolean;
  openOverlay(state: OverlayPresentState): Promise<void>;
  closeOverlay(): Promise<void>;
  pushOverlayState(state: OverlayPresentState): void;
  onOverlayState(listener: (state: OverlayPresentState) => void): () => void;
  sendOverlayAction(action: OverlayAction): void;
  onOverlayAction(listener: (action: OverlayAction) => void): () => void;
  setOverlaySize(size: { width: number; height: number }): void;
  snapOverlay(position: "top" | "bottom"): void;
  onOverlayClosed(listener: () => void): () => void;
}

export function getCuelyShell(): CuelyShell | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.cuelyShell ?? null;
}
