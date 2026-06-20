import { describe, expect, it } from "vitest";
import type { CueScript } from "../src/core/cue-model";
import { PrompterSession } from "../src/renderer/prompter-session";

function createScript(): CueScript {
  return {
    version: 1,
    config: {
      stickiness: 0,
      advanceMargin: 0.01,
      minDwellMs: 300,
      lowConfidenceMs: 3_000,
      windowMs: 15_000,
      lookahead: Number.POSITIVE_INFINITY,
      matchers: {
        keyword: { enabled: true, recencyHalfLifeMs: 4_000 },
        embedding: { enabled: false },
        llmJudge: { enabled: false },
      },
    },
    cues: [
      { id: "c1", text: "Headline number", keywords: ["headline", "revenue"] },
      { id: "c2", text: "Enterprise renewals", keywords: ["enterprise", "renewals"] },
      { id: "c3", text: "Ask for budget", keywords: ["ask", "budget"] },
      { id: "c4", text: "Close with recap", keywords: ["recap", "close"] },
    ],
  };
}

describe("PrompterSession", () => {
  it("projects current cue with the next two cues and progress", () => {
    const session = new PrompterSession(createScript());
    let model = session.getViewModel();

    expect(model.currentCue.id).toBe("c1");
    expect(model.nextCues.map((cue) => cue.id)).toEqual(["c2", "c3"]);
    expect(model.progressLabel).toBe("Cue 1 of 4");

    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_000 });
    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_350 });
    model = session.getViewModel();

    expect(model.currentCue.id).toBe("c2");
    expect(model.nextCues.map((cue) => cue.id)).toEqual(["c3", "c4"]);
    expect(model.progressLabel).toBe("Cue 2 of 4");
  });

  it("manual hotkey override temporarily suppresses voice moves", () => {
    const session = new PrompterSession(createScript());

    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_000 });
    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_400 });
    expect(session.getViewModel().currentCue.id).toBe("c2");

    session.applyHotkey("next");
    expect(session.getViewModel().currentCue.id).toBe("c3");

    session.pushTranscript({ text: "headline revenue", final: true, at: 1_700 });
    session.pushTranscript({ text: "headline revenue", final: true, at: 2_200 });
    expect(session.getViewModel().currentCue.id).toBe("c3");

    session.pushTranscript({ text: "headline revenue", final: true, at: 5_500 });
    session.pushTranscript({ text: "headline revenue", final: true, at: 5_900 });
    expect(session.getViewModel().currentCue.id).toBe("c1");
  });

  it("toggle-following blocks transcript-driven movement", () => {
    const session = new PrompterSession(createScript());

    session.applyHotkey("toggle-following");
    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_000 });
    session.pushTranscript({ text: "enterprise renewals", final: true, at: 1_500 });

    expect(session.getViewModel().following).toBe(false);
    expect(session.getViewModel().currentCue.id).toBe("c1");
  });

  it("degrades to manual mode when source reports error", () => {
    const session = new PrompterSession(createScript());

    session.setSourceStatus({
      state: "error",
      message: "microphone unavailable",
      recoverable: false,
    });

    expect(session.getViewModel().sourceStatus.state).toBe("error");
    expect(session.getViewModel().following).toBe(false);
  });

  it("does not re-enable following while source remains in error", () => {
    const session = new PrompterSession(createScript());

    session.setSourceStatus({
      state: "error",
      message: "network down",
      recoverable: true,
    });
    expect(session.getViewModel().following).toBe(false);

    session.applyHotkey("toggle-following");
    expect(session.getViewModel().following).toBe(false);

    session.setSourceStatus({ state: "listening" });
    session.applyHotkey("toggle-following");
    expect(session.getViewModel().following).toBe(true);
  });
});
