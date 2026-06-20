import type { CueTrackerConfig } from "./tracker";

/** A single talking point. */
export interface Cue {
  id: string;
  text: string;
  keywords?: string[];
  notes?: string;
}

/** An ordered deck of cues plus matching configuration. */
export interface CueScript {
  version: 1;
  title?: string;
  cues: Cue[];
  config?: Partial<CueTrackerConfig>;
}
