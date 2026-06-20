import type { TranscriptChunk } from "../core/transcript-source";
import type { CuelyBridge } from "../shared/bridge";
import { PrompterSession } from "./prompter-session";

export interface ScriptLoadResult {
  session: PrompterSession;
  status: string;
  success: boolean;
  sourceReady: boolean;
}

export async function loadScriptIntoSession(params: {
  bridge: CuelyBridge;
  path: string;
  currentSession: PrompterSession;
  demoChunks: TranscriptChunk[];
}): Promise<ScriptLoadResult> {
  const { bridge, path, currentSession, demoChunks } = params;
  try {
    const nextScript = await bridge.loadScript(path);
    const nextSession = new PrompterSession(nextScript);
    try {
      await bridge.selectSource("mock", { chunks: demoChunks });
      return {
        session: nextSession,
        status: `Loaded script: ${nextScript.title ?? path}`,
        success: true,
        sourceReady: true,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Loaded script, but failed to start source.";
      return {
        session: nextSession,
        status: `Loaded script, but source failed: ${message}`,
        success: true,
        sourceReady: false,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load script.";
    return {
      session: currentSession,
      status: message,
      success: false,
      sourceReady: false,
    };
  }
}
