import type { CueScript } from "../core/cue-model";
import type { TranscriptChunk } from "../core/transcript-source";

export function createDemoScript(): CueScript {
  return {
    version: 1,
    title: "Q3 Review",
    config: {
      minDwellMs: 400,
      advanceMargin: 0.08,
      stickiness: 0.05,
    },
    cues: [
      {
        id: "headline",
        text: "Open with the headline number",
        keywords: ["revenue", "growth", "headline"],
        notes: "Revenue up 18% QoQ",
      },
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

export function createDemoTranscript(): TranscriptChunk[] {
  return [
    { text: "headline revenue growth this quarter", final: true, at: 0 },
    { text: "enterprise renewals held and churn dropped", final: true, at: 700 },
    { text: "enterprise renewals remain strong", final: true, at: 1_200 },
    { text: "our ask is budget and headcount", final: true, at: 2_000 },
    { text: "asking for headcount and budget approval", final: true, at: 2_600 },
  ];
}
