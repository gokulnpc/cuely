import type { CuelyBridge } from "../shared/bridge";
import { createDemoScript } from "../shared/demo-script";
import { createCuelyBridge } from "./bridge";

export function bootstrapMainProcess(): CuelyBridge {
  const script = createDemoScript();
  return createCuelyBridge({ script });
}
