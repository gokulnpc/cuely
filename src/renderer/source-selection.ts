import type { TranscriptChunk } from "../core/transcript-source";
import type { CloudSourceOptions, CuelyBridge } from "../shared/bridge";

export type SourceSelection =
  | { kind: "mock" }
  | { kind: "cloud"; options?: CloudSourceOptions }
  | { kind: "native" };

export async function applySourceSelection(params: {
  bridge: CuelyBridge;
  selection: SourceSelection;
  demoChunks: TranscriptChunk[];
}): Promise<void> {
  const { bridge, selection, demoChunks } = params;

  if (selection.kind === "mock") {
    await bridge.selectSource("mock", { chunks: demoChunks });
    return;
  }

  if (selection.kind === "cloud") {
    const cloudOpts = {
      ...(selection.options ?? {}),
    };
    await bridge.selectSource("cloud", cloudOpts);
    return;
  }

  await bridge.selectSource("native");
}

export function buildSourceSelection(
  kind: "mock" | "cloud" | "native",
  cloudOptions: CloudSourceOptions,
): SourceSelection {
  if (kind === "mock") {
    return { kind: "mock" };
  }
  if (kind === "native") {
    return { kind: "native" };
  }

  return {
    kind: "cloud",
    options: {
      ...(cloudOptions.provider ? { provider: cloudOptions.provider } : {}),
      ...(cloudOptions.apiKeyEnv ? { apiKeyEnv: cloudOptions.apiKeyEnv } : {}),
      ...(cloudOptions.locale ? { locale: cloudOptions.locale } : {}),
      ...(typeof cloudOptions.interim === "boolean" ? { interim: cloudOptions.interim } : {}),
    },
  };
}
