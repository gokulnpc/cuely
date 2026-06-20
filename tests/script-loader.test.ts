import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import type { CuelyBridge, DisplayInfo, HotkeyAction, ScriptPreset } from "../src/shared/bridge";
import { createDemoScript, createDemoTranscript } from "../src/shared/demo-script";
import { PrompterSession } from "../src/renderer/prompter-session";
import { loadScriptIntoSession } from "../src/renderer/script-loader";

function createBridgeStub(overrides: Partial<CuelyBridge> = {}): CuelyBridge {
  return {
    async setContentProtection(_on: boolean): Promise<void> {
      void _on;
    },
    async setAlwaysOnTop(_on: boolean): Promise<void> {
      void _on;
    },
    async listDisplays(): Promise<DisplayInfo[]> {
      return [];
    },
    async moveToDisplay(_displayId: number): Promise<void> {
      void _displayId;
    },
    async setMirror(_on: boolean): Promise<void> {
      void _on;
    },
    async listScriptPresets(): Promise<ScriptPreset[]> {
      return [];
    },
    async loadScript(): Promise<CueScript> {
      return createDemoScript();
    },
    async selectSource(): Promise<void> {
      return;
    },
    async triggerHotkey(_action: HotkeyAction): Promise<void> {
      void _action;
    },
    onSourceStatus(): () => void {
      return () => undefined;
    },
    onTrackerEvent(): () => void {
      return () => undefined;
    },
    onHotkey(): () => void {
      return () => undefined;
    },
    ...overrides,
  };
}

describe("loadScriptIntoSession", () => {
  it("returns a new session and success status when loading works", async () => {
    let selectSourceCalls = 0;
    const bridge = createBridgeStub({
      async loadScript(): Promise<CueScript> {
        return {
          version: 1,
          title: "Loaded Script",
          cues: [{ id: "loaded", text: "Loaded cue", keywords: ["loaded"] }],
        };
      },
      async selectSource(): Promise<void> {
        selectSourceCalls += 1;
      },
    });
    const previousSession = new PrompterSession(createDemoScript());

    const result = await loadScriptIntoSession({
      bridge,
      path: "scripts/loaded.md",
      currentSession: previousSession,
      demoChunks: createDemoTranscript(),
    });

    expect(result.success).toBe(true);
    expect(result.sourceReady).toBe(true);
    expect(result.session).not.toBe(previousSession);
    expect(result.session.getViewModel().title).toBe("Loaded Script");
    expect(selectSourceCalls).toBe(1);
  });

  it("keeps loaded session when source start fails after successful load", async () => {
    let selectSourceCalls = 0;
    const bridge = createBridgeStub({
      async loadScript(): Promise<CueScript> {
        return {
          version: 1,
          title: "Loaded Script",
          cues: [{ id: "loaded", text: "Loaded cue", keywords: ["loaded"] }],
        };
      },
      async selectSource(): Promise<void> {
        selectSourceCalls += 1;
        throw new Error("source startup failed");
      },
    });
    const previousSession = new PrompterSession(createDemoScript());

    const result = await loadScriptIntoSession({
      bridge,
      path: "scripts/loaded.md",
      currentSession: previousSession,
      demoChunks: createDemoTranscript(),
    });

    expect(result.success).toBe(true);
    expect(result.sourceReady).toBe(false);
    expect(result.session).not.toBe(previousSession);
    expect(result.session.getViewModel().title).toBe("Loaded Script");
    expect(result.status).toMatch(/source failed/i);
    expect(selectSourceCalls).toBe(1);
  });

  it("keeps existing session when script load fails", async () => {
    let selectSourceCalls = 0;
    const bridge = createBridgeStub({
      async loadScript(): Promise<CueScript> {
        throw new Error("Script path not found");
      },
      async selectSource(): Promise<void> {
        selectSourceCalls += 1;
      },
    });
    const previousSession = new PrompterSession(createDemoScript());

    const result = await loadScriptIntoSession({
      bridge,
      path: "scripts/missing.md",
      currentSession: previousSession,
      demoChunks: createDemoTranscript(),
    });

    expect(result.success).toBe(false);
    expect(result.sourceReady).toBe(false);
    expect(result.session).toBe(previousSession);
    expect(result.status).toMatch(/not found/i);
    expect(selectSourceCalls).toBe(0);
  });
});
