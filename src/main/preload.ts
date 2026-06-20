import type { CuelyBridge } from "../shared/bridge";

export function registerBridgeOnWindow(bridge: CuelyBridge): void {
  if (typeof window === "undefined") {
    return;
  }
  window.cuely = bridge;
}
