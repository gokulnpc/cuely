import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import { setEmbeddingSimilarityOverrideForTesting } from "../src/core/matchers/embedding";
import { CueTracker } from "../src/core/tracker";

function createScript(): CueScript {
  return {
    version: 1,
    title: "Q3 Review",
    cues: [
      { id: "headline", text: "Open with the headline number", keywords: ["revenue", "growth"] },
      {
        id: "enterprise",
        text: "Why it moved: enterprise renewals",
        keywords: ["enterprise", "renewals", "churn"],
      },
      {
        id: "ask",
        text: "What we're asking for",
        keywords: ["ask", "headcount", "budget"],
      },
    ],
  };
}

describe("CueTracker scoring contract", () => {
  it("1) keyword hits outrank unrelated cues", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 6_000 } },
    });

    let latestScores: Record<string, number> = {};
    tracker.on((event) => {
      if (event.type === "scores") {
        latestScores = event.perCue;
      }
    });

    tracker.pushTranscript({ text: "enterprise renewals are improving", final: true, at: 1_000 });

    expect(latestScores.enterprise ?? 0).toBeGreaterThan(latestScores.headline ?? 0);
    expect(latestScores.enterprise ?? 0).toBeGreaterThan(latestScores.ask ?? 0);
  });

  it("2) recent chunks contribute more than older chunks", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      windowMs: 10_000,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 1_000 } },
    });

    let latestScores: Record<string, number> = {};
    tracker.on((event) => {
      if (event.type === "scores") {
        latestScores = event.perCue;
      }
    });

    tracker.pushTranscript({ text: "revenue", final: true, at: 1_000 });
    tracker.pushTranscript({ text: "enterprise", final: true, at: 6_000 });

    expect(latestScores.enterprise ?? 0).toBeGreaterThan(latestScores.headline ?? 0);
  });

  it("3) a move requires margin sustained for minDwellMs", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      advanceMargin: 0.1,
      minDwellMs: 1_000,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 6_000 } },
    });

    tracker.pushTranscript({ text: "enterprise", final: true, at: 1_000 });
    tracker.pushTranscript({ text: "enterprise", final: true, at: 1_500 });
    expect(tracker.position.cueId).toBe("headline");

    tracker.pushTranscript({ text: "enterprise", final: true, at: 2_100 });
    expect(tracker.position.cueId).toBe("enterprise");
    expect(tracker.position.source).toBe("voice");
  });

  it("4) manual setPosition wins and blocks voice moves during cool-off", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      advanceMargin: 0.1,
      minDwellMs: 500,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 6_000 } },
    });

    tracker.setPosition(2, { coolOffMs: 4_000 });
    expect(tracker.position.cueId).toBe("ask");
    expect(tracker.position.source).toBe("manual");

    tracker.pushTranscript({ text: "revenue", final: true, at: 1_000 });
    tracker.pushTranscript({ text: "revenue", final: true, at: 3_000 });
    expect(tracker.position.cueId).toBe("ask");

    tracker.pushTranscript({ text: "revenue", final: true, at: 4_100 });
    tracker.pushTranscript({ text: "revenue", final: true, at: 4_700 });
    expect(tracker.position.cueId).toBe("headline");
    expect(tracker.position.source).toBe("voice");
  });

  it("5) prolonged low confidence emits exactly one unsure event", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      advanceMargin: 0.7,
      lowConfidenceMs: 2_000,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 6_000 } },
    });

    let unsureCount = 0;
    tracker.on((event) => {
      if (event.type === "unsure") {
        unsureCount += 1;
      }
    });

    tracker.pushTranscript({ text: "totally off-topic filler", final: false, at: 0 });
    tracker.pushTranscript({ text: "still off-topic", final: false, at: 1_000 });
    tracker.pushTranscript({ text: "more filler", final: false, at: 2_100 });
    tracker.pushTranscript({ text: "still filler", final: false, at: 4_000 });

    expect(unsureCount).toBe(1);
  });

  it("6) empty or garbled chunks never throw and hold position", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 6_000 } },
    });

    const startCueId = tracker.position.cueId;
    expect(() =>
      tracker.pushTranscript({ text: undefined as unknown as string, final: false, at: NaN }),
    ).not.toThrow();
    expect(tracker.position.cueId).toBe(startCueId);
  });

  it("stays put during off-topic ad-lib and supports later skip-ahead", () => {
    const tracker = new CueTracker(createScript(), {
      stickiness: 0.05,
      advanceMargin: 0.1,
      minDwellMs: 700,
      matchers: { keyword: { enabled: true, recencyHalfLifeMs: 4_000 } },
    });

    tracker.pushTranscript({ text: "revenue growth this quarter", final: true, at: 1_000 });
    tracker.pushTranscript({ text: "random joke about weather and travel", final: true, at: 2_000 });
    tracker.pushTranscript({ text: "another off topic tangent", final: true, at: 3_000 });
    expect(tracker.position.cueId).toBe("headline");

    tracker.pushTranscript({ text: "budget and headcount ask", final: true, at: 3_800 });
    tracker.pushTranscript({ text: "ask for budget approval", final: true, at: 4_700 });
    expect(tracker.position.cueId).toBe("ask");
  });

  it("embedding matcher improves paraphrase recall without false jumps", () => {
    setEmbeddingSimilarityOverrideForTesting(({ cueText, transcriptText }) => {
      const cue = cueText.toLowerCase();
      const transcript = transcriptText.toLowerCase();
      if (cue.includes("what we're asking for") && transcript.includes("resource request")) {
        return 0.95;
      }
      if (transcript.includes("off-topic anecdote")) {
        return 0.02;
      }
      return 0.05;
    });
    try {
      const tracker = new CueTracker(createScript(), {
        stickiness: 0.05,
        advanceMargin: 0.08,
        minDwellMs: 200,
        matchers: {
          keyword: { enabled: true, recencyHalfLifeMs: 6_000 },
          embedding: { enabled: true },
        },
      });

      tracker.pushTranscript({ text: "off-topic anecdote about travel", final: true, at: 1_000 });
      tracker.pushTranscript({ text: "another off-topic anecdote", final: true, at: 1_400 });
      expect(tracker.position.cueId).toBe("headline");

      tracker.pushTranscript({ text: "this is our resource request for next quarter", final: true, at: 2_000 });
      tracker.pushTranscript({ text: "resource request and hiring plan", final: true, at: 2_350 });
      expect(tracker.position.cueId).toBe("ask");
    } finally {
      setEmbeddingSimilarityOverrideForTesting(null);
    }
  });
});
