import type {
  SourceStatus,
  TranscriptChunk,
  TranscriptListener,
  TranscriptSource,
} from "../core/transcript-source";

export interface CloudSourceOptions {
  provider: "deepgram" | "assemblyai";
  apiKeyEnv: string;
  locale?: string;
  interim?: boolean;
}

export interface CloudSocket {
  onopen: (() => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  close(code?: number, reason?: string): void;
}

interface CloudSourceRuntimeOptions {
  socketFactory?: (url: string) => CloudSocket;
  now?: () => number;
  setTimeoutFn?: (cb: () => void, delayMs: number) => unknown;
  clearTimeoutFn?: (id: unknown) => void;
  reconnectBackoffMs?: number[];
}

const DEFAULT_BACKOFF_MS = [500, 1_000, 2_000];

export class CloudStreamingSource implements TranscriptSource {
  public readonly kind = "cloud" as const;

  private readonly options: CloudSourceOptions;
  private readonly socketFactory: (url: string) => CloudSocket;
  private readonly now: () => number;
  private readonly setTimeoutFn: (cb: () => void, delayMs: number) => unknown;
  private readonly clearTimeoutFn: (id: unknown) => void;
  private readonly reconnectBackoffMs: number[];
  private readonly chunkListeners = new Set<TranscriptListener>();
  private readonly statusListeners = new Set<(status: SourceStatus) => void>();
  private status: SourceStatus = { state: "idle" };
  private socket: CloudSocket | null = null;
  private started = false;
  private reconnectAttempt = 0;
  private reconnectTimerId: unknown = null;
  private stopping = false;

  constructor(options: CloudSourceOptions, runtime: CloudSourceRuntimeOptions = {}) {
    this.options = options;
    this.socketFactory = runtime.socketFactory ?? defaultSocketFactory;
    this.now = runtime.now ?? (() => Date.now());
    this.setTimeoutFn = runtime.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn =
      runtime.clearTimeoutFn ??
      ((id) => {
        clearTimeout(id as ReturnType<typeof setTimeout>);
      });
    this.reconnectBackoffMs = runtime.reconnectBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const apiKey = process.env[this.options.apiKeyEnv];
    if (!apiKey) {
      const message = `Missing API key in env var ${this.options.apiKeyEnv}`;
      this.setStatus({ state: "error", message, recoverable: false });
      throw new Error(message);
    }

    this.started = true;
    this.stopping = false;
    this.reconnectAttempt = 0;
    this.openSocket(apiKey);
  }

  async stop(): Promise<void> {
    if (!this.started && this.socket === null) {
      return;
    }
    this.stopping = true;
    this.started = false;
    this.reconnectAttempt = 0;
    if (this.reconnectTimerId !== null) {
      this.clearTimeoutFn(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
    this.socket?.close(1000, "client stop");
    this.socket = null;
    this.setStatus({ state: "idle" });
    this.stopping = false;
  }

  onChunk(listener: TranscriptListener): () => void {
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  onStatus(listener: (s: SourceStatus) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(status: SourceStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private openSocket(apiKey: string): void {
    const socket = this.socketFactory(buildProviderUrl(this.options, apiKey));
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.setStatus({ state: "listening" });
    };

    socket.onmessage = (event) => {
      const chunk = parseProviderFrame(this.options.provider, event.data, this.now());
      if (!chunk) {
        return;
      }
      this.emitChunk(chunk);
    };

    socket.onerror = (event) => {
      const message = event.message ?? "Cloud transcription socket error";
      this.setStatus({ state: "error", message, recoverable: true });
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.stopping || !this.started) {
        return;
      }
      this.scheduleReconnect(apiKey);
    };
  }

  private scheduleReconnect(apiKey: string): void {
    if (this.reconnectAttempt >= this.reconnectBackoffMs.length) {
      this.setStatus({
        state: "error",
        message: "Cloud transcription connection failed",
        recoverable: false,
      });
      this.started = false;
      return;
    }

    const delay = this.reconnectBackoffMs[this.reconnectAttempt];
    if (delay === undefined) {
      this.setStatus({
        state: "error",
        message: "Cloud transcription connection failed",
        recoverable: false,
      });
      this.started = false;
      return;
    }
    this.reconnectAttempt += 1;
    this.setStatus({
      state: "error",
      message: "Cloud transcription disconnected; reconnecting",
      recoverable: true,
    });

    this.reconnectTimerId = this.setTimeoutFn(() => {
      this.reconnectTimerId = null;
      if (!this.started || this.stopping) {
        return;
      }
      this.openSocket(apiKey);
    }, delay);
  }

  private emitChunk(chunk: TranscriptChunk): void {
    for (const listener of this.chunkListeners) {
      listener(chunk);
    }
  }
}

function parseProviderFrame(
  provider: CloudSourceOptions["provider"],
  rawData: string,
  at: number,
): TranscriptChunk | null {
  let payload: unknown;
  try {
    payload = JSON.parse(rawData);
  } catch {
    return null;
  }

  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const frame = payload as Record<string, unknown>;
  const mapped = provider === "deepgram" ? mapDeepgramFrame(frame) : mapAssemblyAiFrame(frame);
  if (!mapped || mapped.text.trim().length === 0) {
    return null;
  }

  return { ...mapped, at };
}

function mapDeepgramFrame(frame: Record<string, unknown>): Omit<TranscriptChunk, "at"> | null {
  const channel = frame.channel;
  if (typeof channel !== "object" || channel === null) {
    return null;
  }

  const alternatives = (channel as Record<string, unknown>).alternatives;
  if (!Array.isArray(alternatives) || alternatives.length === 0) {
    return null;
  }

  const first = alternatives[0];
  if (typeof first !== "object" || first === null) {
    return null;
  }

  const firstRecord = first as Record<string, unknown>;
  const text = typeof firstRecord.transcript === "string" ? firstRecord.transcript : "";
  const confidence =
    typeof firstRecord.confidence === "number" && Number.isFinite(firstRecord.confidence)
      ? firstRecord.confidence
      : undefined;
  const isFinal =
    typeof frame.is_final === "boolean"
      ? frame.is_final
      : typeof frame.final === "boolean"
        ? frame.final
        : false;

  return confidence === undefined
    ? { text, final: isFinal }
    : { text, final: isFinal, confidence };
}

function mapAssemblyAiFrame(frame: Record<string, unknown>): Omit<TranscriptChunk, "at"> | null {
  const text = typeof frame.text === "string" ? frame.text : "";
  const messageType =
    typeof frame.message_type === "string" ? frame.message_type : typeof frame.type === "string" ? frame.type : "";
  const normalizedType = messageType.toLowerCase();
  const isFinal =
    normalizedType === "finaltranscript" ||
    normalizedType === "final" ||
    (typeof frame.final === "boolean" ? frame.final : false);
  const confidence =
    typeof frame.confidence === "number" && Number.isFinite(frame.confidence) ? frame.confidence : undefined;

  return confidence === undefined
    ? { text, final: isFinal }
    : { text, final: isFinal, confidence };
}

function buildProviderUrl(options: CloudSourceOptions, apiKey: string): string {
  const locale = options.locale ?? "en-US";
  const interim = options.interim ?? true;
  if (options.provider === "deepgram") {
    return `wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&interim_results=${String(interim)}&language=${encodeURIComponent(locale)}&token=${encodeURIComponent(apiKey)}`;
  }

  return `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&word_boost=&language_code=${encodeURIComponent(locale)}&token=${encodeURIComponent(apiKey)}`;
}

function defaultSocketFactory(url: string): CloudSocket {
  const WebSocketCtor = globalThis.WebSocket;
  if (!WebSocketCtor) {
    throw new Error("WebSocket runtime is unavailable.");
  }
  const socket = new WebSocketCtor(url);
  const wrapper: CloudSocket = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    close(code?: number, reason?: string): void {
      socket.close(code, reason);
    },
  };
  socket.onopen = () => {
    wrapper.onopen?.();
  };
  socket.onclose = (event) => {
    wrapper.onclose?.({ code: event.code, reason: event.reason });
  };
  socket.onerror = () => {
    wrapper.onerror?.({ message: "WebSocket error" });
  };
  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      wrapper.onmessage?.({ data: event.data });
    }
  };
  return wrapper;
}
