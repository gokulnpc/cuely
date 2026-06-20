import { afterEach, describe, expect, it } from "vitest";
import { CloudStreamingSource, type CloudSocket } from "../src/sources/cloud-source";
import type { TranscriptChunk } from "../src/core/transcript-source";

class FakeSocket implements CloudSocket {
  public onopen: (() => void) | null = null;
  public onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  public onerror: ((event: { message?: string }) => void) | null = null;
  public onmessage: ((event: { data: string }) => void) | null = null;
  public closeCalls = 0;

  close(): void {
    this.closeCalls += 1;
  }

  emitOpen(): void {
    this.onopen?.();
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  emitError(message: string): void {
    this.onerror?.({ message });
  }

  emitClose(code?: number, reason?: string): void {
    this.onclose?.({
      ...(code !== undefined ? { code } : {}),
      ...(reason !== undefined ? { reason } : {}),
    });
  }
}

describe("CloudStreamingSource", () => {
  const envKey = "TEST_CLOUD_API_KEY";

  afterEach(() => {
    delete process.env[envKey];
  });

  it("rejects start when api key env var is missing", async () => {
    const source = new CloudStreamingSource({ provider: "deepgram", apiKeyEnv: envKey });

    await expect(source.start()).rejects.toThrow(/missing api key/i);
  });

  it("maps deepgram partial/final frames into transcript chunks", async () => {
    process.env[envKey] = "secret";

    const sockets: FakeSocket[] = [];
    const emitted: TranscriptChunk[] = [];
    const statuses: string[] = [];
    const urls: string[] = [];

    const source = new CloudStreamingSource(
      { provider: "deepgram", apiKeyEnv: envKey },
      {
        socketFactory: (url) => {
          urls.push(url);
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
        now: () => 1_234,
      },
    );

    source.onChunk((chunk) => emitted.push(chunk));
    source.onStatus((status) => statuses.push(status.state));

    await source.start();
    const socket = sockets[0];
    expect(socket).toBeDefined();
    socket?.emitOpen();
    socket?.emitMessage({
      type: "Results",
      is_final: false,
      channel: { alternatives: [{ transcript: "hello team", confidence: 0.41 }] },
    });
    socket?.emitMessage({
      type: "Results",
      is_final: true,
      channel: { alternatives: [{ transcript: "hello team welcome", confidence: 0.92 }] },
    });

    expect(statuses).toContain("listening");
    expect(urls[0]).toContain("deepgram");
    expect(urls[0]).toContain("token=secret");
    expect(emitted).toEqual([
      { text: "hello team", final: false, confidence: 0.41, at: 1_234 },
      { text: "hello team welcome", final: true, confidence: 0.92, at: 1_234 },
    ]);
  });

  it("maps assemblyai partial and final frames", async () => {
    process.env[envKey] = "secret";
    const sockets: FakeSocket[] = [];
    const emitted: TranscriptChunk[] = [];
    const urls: string[] = [];

    const source = new CloudStreamingSource(
      { provider: "assemblyai", apiKeyEnv: envKey },
      {
        socketFactory: (url) => {
          urls.push(url);
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
        now: () => 500,
      },
    );

    source.onChunk((chunk) => emitted.push(chunk));
    await source.start();
    sockets[0]?.emitOpen();
    sockets[0]?.emitMessage({ message_type: "PartialTranscript", text: "budget ask", confidence: 0.5 });
    sockets[0]?.emitMessage({ message_type: "FinalTranscript", text: "budget ask now", confidence: 0.9 });

    expect(urls[0]).toContain("assemblyai");
    expect(urls[0]).toContain("token=secret");
    expect(emitted).toEqual([
      { text: "budget ask", final: false, confidence: 0.5, at: 500 },
      { text: "budget ask now", final: true, confidence: 0.9, at: 500 },
    ]);
  });

  it("ignores malformed and empty frames", async () => {
    process.env[envKey] = "secret";
    const socket = new FakeSocket();
    const emitted: TranscriptChunk[] = [];

    const source = new CloudStreamingSource(
      { provider: "deepgram", apiKeyEnv: envKey },
      {
        socketFactory: () => socket,
        now: () => 900,
      },
    );
    source.onChunk((chunk) => emitted.push(chunk));
    await source.start();
    socket.emitOpen();
    socket.onmessage?.({ data: "not-json" });
    socket.emitMessage({ type: "Results", is_final: false, channel: { alternatives: [{ transcript: "" }] } });
    socket.emitMessage({ type: "Results", channel: {} });

    expect(emitted).toEqual([]);
  });

  it("retries after close and emits terminal error after retry budget", async () => {
    process.env[envKey] = "secret";

    const sockets: FakeSocket[] = [];
    const scheduled: Array<{ delayMs: number; run: () => void }> = [];
    const statuses: Array<{ state: string; recoverable?: boolean }> = [];

    const source = new CloudStreamingSource(
      { provider: "assemblyai", apiKeyEnv: envKey },
      {
        socketFactory: () => {
          const socket = new FakeSocket();
          sockets.push(socket);
          return socket;
        },
        reconnectBackoffMs: [10],
        setTimeoutFn: (cb, delayMs) => {
          scheduled.push({ delayMs, run: cb });
          return scheduled.length;
        },
        clearTimeoutFn: () => undefined,
      },
    );

    source.onStatus((status) => {
      if (status.state === "error") {
        statuses.push({ state: status.state, recoverable: status.recoverable });
      } else {
        statuses.push({ state: status.state });
      }
    });

    await source.start();
    sockets[0]?.emitOpen();
    sockets[0]?.emitClose(1006, "dropped");

    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(10);
    expect(statuses.some((status) => status.state === "error" && status.recoverable)).toBe(true);

    scheduled[0]?.run();
    expect(sockets).toHaveLength(2);
    sockets[1]?.emitClose(1006, "dropped again");

    expect(
      statuses.some((status) => status.state === "error" && status.recoverable === false),
    ).toBe(true);
  });

  it("treats server-side terminal close as non-recoverable", async () => {
    process.env[envKey] = "secret";
    const socket = new FakeSocket();
    const statuses: Array<{ state: string; recoverable?: boolean }> = [];
    const source = new CloudStreamingSource(
      { provider: "deepgram", apiKeyEnv: envKey },
      {
        socketFactory: () => socket,
      },
    );

    source.onStatus((status) => {
      if (status.state === "error") {
        statuses.push({ state: status.state, recoverable: status.recoverable });
      } else {
        statuses.push({ state: status.state });
      }
    });

    await source.start();
    socket.emitOpen();
    socket.emitClose(4001, "unauthorized");

    expect(statuses.some((status) => status.state === "error" && status.recoverable === false)).toBe(true);
  });

  it("emits non-recoverable error if socket creation fails", async () => {
    process.env[envKey] = "secret";
    const statuses: Array<{ state: string; recoverable?: boolean }> = [];
    const source = new CloudStreamingSource(
      { provider: "deepgram", apiKeyEnv: envKey },
      {
        socketFactory: () => {
          throw new Error("Socket unavailable");
        },
      },
    );
    source.onStatus((status) => {
      if (status.state === "error") {
        statuses.push({ state: status.state, recoverable: status.recoverable });
      }
    });

    await expect(source.start()).rejects.toThrow(/socket unavailable/i);
    expect(statuses.some((status) => status.recoverable === false)).toBe(true);
  });
});
