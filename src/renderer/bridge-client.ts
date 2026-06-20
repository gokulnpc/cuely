import type { CuelyBridge } from "../shared/bridge";

export function getCuelyBridge(): CuelyBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.cuely ?? null;
}
