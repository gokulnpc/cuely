import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import type { CuelyBridge, DisplayInfo, HotkeyAction, ScriptPreset } from "../src/shared/bridge";
import {
  applySourceSelection,
  buildSourceSelection,
} from "../src/renderer/source-selection";

function createBridgeStub(overrides: Partial<CuelyBridge> = {}): CuelyBridge {
  const script: CueScript = {
    version: 1,
    cues: [{ id: "one", text: "one" }],
  };

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
      return script;
    },
    async selectSource(
      _kind: "mock" | "cloud" | "native",
      _opts?: Record<string, unknown>,
    ): Promise<void> {
      void _kind;
      void _opts;
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

describe("source-selection helpers", () => {
  it("buildSourceSelection builds cloud options payload", () => {
    const selection = buildSourceSelection("cloud", {
      provider: "assemblyai",
      apiKeyEnv: "ASSEMBLYAI_API_KEY",
      locale: "en-US",
      interim: false,
    });

    expect(selection.kind).toBe("cloud");
    expect(selection.kind === "cloud" ? selection.options?.provider : null).toBe("assemblyai");
  });

  it("applySourceSelection routes mock with chunks", async () => {
    let lastKind: "mock" | "cloud" | "native" | null = null;
    let lastOpts: Record<string, unknown> | undefined;
    const bridge = createBridgeStub({
      async selectSource(kind: "mock" | "cloud" | "native", opts?: Record<string, unknown>): Promise<void> {
        lastKind = kind;
        lastOpts = opts;
      },
    });

    await applySourceSelection({
      bridge,
      selection: { kind: "mock" },
      demoChunks: [{ text: "hello", final: true, at: 1 }],
    });

    expect(lastKind).toBe("mock");
    expect(Array.isArray(lastOpts?.chunks)).toBe(true);
  });

  it("applySourceSelection routes cloud options", async () => {
    let lastKind: "mock" | "cloud" | "native" | null = null;
    let lastOpts: Record<string, unknown> | undefined;
    const bridge = createBridgeStub({
      async selectSource(kind: "mock" | "cloud" | "native", opts?: Record<string, unknown>): Promise<void> {
        lastKind = kind;
        lastOpts = opts;
      },
    });

    await applySourceSelection({
      bridge,
      selection: {
        kind: "cloud",
        options: {
          provider: "deepgram",
          apiKeyEnv: "DEEPGRAM_API_KEY",
          locale: "en-US",
          interim: true,
        },
      },
      demoChunks: [],
    });

    expect(lastKind).toBe("cloud");
    expect(lastOpts?.provider).toBe("deepgram");
    expect(lastOpts?.apiKeyEnv).toBe("DEEPGRAM_API_KEY");
  });
});
