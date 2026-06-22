import type { Cue, Preset } from "./cuely-types";

export const PRESETS: Record<string, Preset> = {
  board: {
    title: "Q3 Board Review",
    session: "Investor sync",
    cues: [
      { text: "Open with the headline number.", keywords: ["revenue", "$4.2M"], notes: "Lead with the win." },
      { text: "Revenue up 18% quarter over quarter.", keywords: ["revenue", "QoQ"] },
      { text: "Why it moved: enterprise renewals.", keywords: ["enterprise", "renewals"] },
      { text: "Net retention held at 124%.", keywords: ["retention", "NRR"] },
      { text: "The ask: two senior AEs and an SE.", keywords: ["hiring", "the ask"] },
      { text: "Close: timeline and owners.", keywords: ["timeline"] },
    ],
  },
  talk: {
    title: "Conference Talk",
    session: "Rehearsal",
    cues: [
      { text: "Hook: the problem everyone pretends is solved.", keywords: ["hook"] },
      { text: "A story from the trenches.", keywords: ["story"] },
      { text: "The counterintuitive insight.", keywords: ["insight"] },
      { text: "Show, don't tell — the live demo.", keywords: ["demo"] },
      { text: "What this means for you tomorrow.", keywords: ["takeaway"] },
      { text: "Call to action and where to find me.", keywords: ["CTA"] },
    ],
  },
  demo: {
    title: "Product Demo",
    session: "Sales call",
    cues: [
      { text: "Confirm their goal in one sentence.", keywords: ["goal"] },
      { text: "Start where they feel the pain.", keywords: ["pain"] },
      { text: "The one feature that lands every time.", keywords: ["feature"] },
      { text: "Handle the integration question early.", keywords: ["integration"] },
      { text: "Pricing: anchor, then the plan that fits.", keywords: ["pricing"] },
      { text: "Agree the next step before hanging up.", keywords: ["next step"] },
    ],
  },
};

export const DEFAULT_CUES: Cue[] = [
  {
    id: "c1",
    text: "Open with the headline number.",
    keywords: ["revenue", "$4.2M"],
    notes: "Lead with the win, then the context.",
  },
  {
    id: "c2",
    text: "Revenue up 18% quarter over quarter.",
    keywords: ["revenue", "growth", "QoQ"],
    notes: "",
  },
  {
    id: "c3",
    text: "Why it moved: enterprise renewals.",
    keywords: ["enterprise", "renewals", "churn"],
    notes: "",
  },
  {
    id: "c4",
    text: "Net retention held at 124%.",
    keywords: ["retention", "NRR"],
    notes: "",
  },
  {
    id: "c5",
    text: "Where we under-delivered: mid-market.",
    keywords: ["mid-market", "pipeline"],
    notes: "Own it before they ask.",
  },
  {
    id: "c6",
    text: "The ask: two senior AEs and a solutions engineer.",
    keywords: ["hiring", "the ask"],
    notes: "Tie to pipeline coverage.",
  },
  {
    id: "c7",
    text: "Q4 focus: land-and-expand in healthcare.",
    keywords: ["Q4", "healthcare"],
    notes: "",
  },
  {
    id: "c8",
    text: "Close: timeline and owners.",
    keywords: ["timeline", "owners"],
    notes: "",
  },
];

export const PRESET_BUTTONS = [
  { key: "board", label: "Q3 Board Review", count: "6 cues" },
  { key: "talk", label: "Conference Talk", count: "6 cues" },
  { key: "demo", label: "Product Demo", count: "6 cues" },
] as const;
