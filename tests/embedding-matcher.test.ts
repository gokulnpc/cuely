import { describe, expect, it } from "vitest";
import { scoreCueWithEmbeddings } from "../src/core/matchers/embedding";

describe("scoreCueWithEmbeddings", () => {
  it("returns zero when disabled", () => {
    const score = scoreCueWithEmbeddings(
      { id: "c1", text: "Budget request", keywords: ["budget"] },
      [{ text: "budget request", final: true, at: 1_000 }],
      { enabled: false },
    );
    expect(score).toBe(0);
  });

  it("supports injected similarity function with weight", () => {
    const score = scoreCueWithEmbeddings(
      { id: "c1", text: "Budget request", keywords: ["budget"] },
      [{ text: "resource planning", final: true, at: 1_000 }],
      {
        enabled: true,
        weight: 0.5,
        similarityFn: () => 0.8,
      },
    );

    expect(score).toBeCloseTo(0.4, 5);
  });
});
