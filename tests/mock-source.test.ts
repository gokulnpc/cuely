import { describe, expect, it } from "vitest";
import type { TranscriptChunk } from "../src/core/transcript-source";
import { MockTranscriptSource } from "../src/sources/mock-source";

describe("MockTranscriptSource", () => {
  it("replays chunks deterministically on an injected scheduler", async () => {
    const scheduled: Array<{ delay: number; cb: () => void }> = [];
    const emitted: TranscriptChunk[] = [];

    const source = new MockTranscriptSource(
      [
        { text: "one", final: false, at: 1_000 },
        { text: "two", final: true, at: 1_500 },
      ],
      {
        now: () => 10_000,
        setTimeoutFn: (cb, delay) => {
          scheduled.push({ cb, delay });
          return scheduled.length;
        },
        clearTimeoutFn: () => undefined,
      },
    );

    source.onChunk((chunk) => emitted.push(chunk));
    await source.start();

    for (const task of scheduled.sort((a, b) => a.delay - b.delay)) {
      task.cb();
    }

    expect(emitted).toEqual([
      { text: "one", final: false, at: 10_000 },
      { text: "two", final: true, at: 10_500 },
    ]);
  });

  it("start/stop are idempotent and status listeners receive transitions", async () => {
    const statuses: string[] = [];
    const source = new MockTranscriptSource([]);

    source.onStatus((status) => statuses.push(status.state));
    await source.start();
    await source.start();
    await source.stop();
    await source.stop();

    expect(statuses[0]).toBe("idle");
    expect(statuses.filter((state) => state === "listening")).toHaveLength(1);
    expect(statuses.at(-1)).toBe("idle");
  });
});
