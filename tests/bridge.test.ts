import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import { createCuelyBridge } from "../src/main/bridge";
import { createDemoScript } from "../src/shared/demo-script";

function minimalScript(): CueScript {
  return {
    version: 1,
    cues: [
      { id: "one", text: "First cue", keywords: ["first"] },
      { id: "two", text: "Second cue", keywords: ["second"] },
    ],
  };
}

describe("createCuelyBridge", () => {
  it("loads and compiles markdown cue scripts from disk", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "cuely-bridge-test-"));
    const markdownPath = join(tempDir, "script.md");
    await writeFile(
      markdownPath,
      `---
title: Demo Script
---
- Open with the number {kw: revenue, growth}
  - up 18%
- Ask for budget {kw: budget, ask}
`,
      "utf8",
    );

    const bridge = createCuelyBridge({ script: minimalScript(), cwd: tempDir });
    const loaded = await bridge.loadScript(markdownPath);

    expect(loaded.title).toBe("Demo Script");
    expect(loaded.cues).toHaveLength(2);
    expect(loaded.cues[0]?.keywords).toEqual(["revenue", "growth"]);
    expect(loaded.cues[0]?.notes).toBe("up 18%");

    await rm(tempDir, { recursive: true, force: true });
  });

  it("dispatches hotkeys to tracker and listeners", async () => {
    const bridge = createCuelyBridge({ script: createDemoScript() });
    const hotkeys: string[] = [];
    const positions: number[] = [];

    const offHotkey = bridge.onHotkey((action) => hotkeys.push(action));
    const offTracker = bridge.onTrackerEvent((event) => {
      if (event.type === "position") {
        positions.push(event.state.index);
      }
    });

    await bridge.triggerHotkey("next");
    await bridge.triggerHotkey("top");

    offHotkey();
    offTracker();

    expect(hotkeys).toEqual(["next", "top"]);
    expect(positions).toContain(1);
    expect(positions).toContain(0);
  });
});
