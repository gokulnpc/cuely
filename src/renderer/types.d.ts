import type { CuelyBridge } from "../shared/bridge";
import type { CuelyShell } from "./cuely-shell";

declare global {
  interface Window {
    cuely?: CuelyBridge;
    cuelyShell?: CuelyShell;
  }
}

export {};
