export interface TranscriptChunk {
  text: string;
  final: boolean;
  at: number;
  confidence?: number;
}

export type TranscriptListener = (chunk: TranscriptChunk) => void;

export type SourceStatus =
  | { state: "idle" }
  | { state: "listening" }
  | { state: "error"; message: string; recoverable: boolean };

export interface TranscriptSource {
  start(): Promise<void>;
  stop(): Promise<void>;
  onChunk(listener: TranscriptListener): () => void;
  onStatus(listener: (s: SourceStatus) => void): () => void;
  readonly kind: "mock" | "cloud" | "native";
}
