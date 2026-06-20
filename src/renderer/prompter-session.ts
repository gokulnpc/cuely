import type { Cue, CueScript } from "../core/cue-model";
import type { SourceStatus, TranscriptChunk } from "../core/transcript-source";
import { CueTracker, type PositionState, type TrackerEvent } from "../core/tracker";
import type { HotkeyAction } from "../shared/bridge";

export interface PrompterControls {
  fontSizePx: number;
  lineHeight: number;
  widthPercent: number;
  theme: "dark" | "light";
  mirrored: boolean;
}

export interface PrompterViewModel {
  title: string;
  currentCue: Cue;
  nextCues: Cue[];
  progressLabel: string;
  unsure: boolean;
  following: boolean;
  visible: boolean;
  controls: PrompterControls;
  sourceStatus: SourceStatus;
}

interface SessionState {
  position: PositionState;
  unsure: boolean;
  following: boolean;
  visible: boolean;
  controls: PrompterControls;
  sourceStatus: SourceStatus;
}

export class PrompterSession {
  private readonly script: CueScript;
  private readonly tracker: CueTracker;
  private readonly listeners = new Set<(model: PrompterViewModel) => void>();
  private state: SessionState;
  private readonly firstCue: Cue;

  constructor(script: CueScript) {
    const firstCue = script.cues.at(0);
    if (!firstCue) {
      throw new Error("PrompterSession requires at least one cue.");
    }
    this.script = script;
    this.firstCue = firstCue;
    this.tracker = new CueTracker(script, script.config);
    this.state = {
      position: this.tracker.position,
      unsure: false,
      following: true,
      visible: true,
      controls: {
        fontSizePx: 44,
        lineHeight: 1.3,
        widthPercent: 72,
        theme: "dark",
        mirrored: false,
      },
      sourceStatus: { state: "idle" },
    };
    this.tracker.on((event) => this.applyTrackerEvent(event));
  }

  onChange(listener: (model: PrompterViewModel) => void): () => void {
    this.listeners.add(listener);
    listener(this.getViewModel());
    return () => this.listeners.delete(listener);
  }

  pushTranscript(chunk: TranscriptChunk): void {
    if (!this.state.following) {
      return;
    }
    this.tracker.pushTranscript(chunk);
  }

  applyHotkey(action: HotkeyAction): void {
    if (action === "toggle-following") {
      this.state = { ...this.state, following: !this.state.following };
      this.emit();
      return;
    }
    if (action === "toggle-visible") {
      this.state = { ...this.state, visible: !this.state.visible };
      this.emit();
      return;
    }

    const current = this.state.position.index;
    if (action === "top") {
      this.tracker.setPosition(0);
      return;
    }
    if (action === "next") {
      this.tracker.setPosition(current + 1);
      return;
    }
    if (action === "prev") {
      this.tracker.setPosition(current - 1);
    }
  }

  setControls(updates: Partial<PrompterControls>): void {
    this.state = { ...this.state, controls: { ...this.state.controls, ...updates } };
    this.emit();
  }

  setSourceStatus(status: SourceStatus): void {
    this.state = { ...this.state, sourceStatus: status };
    this.emit();
  }

  consumeTrackerEvent(event: TrackerEvent): void {
    this.applyTrackerEvent(event);
  }

  getViewModel(): PrompterViewModel {
    const currentCue = this.script.cues[this.state.position.index] ?? this.firstCue;
    const nextCues = this.script.cues.slice(this.state.position.index + 1, this.state.position.index + 3);
    const cueCount = this.script.cues.length;
    const position = this.state.position.index + 1;
    return {
      title: this.script.title ?? "Cue Script",
      currentCue,
      nextCues,
      progressLabel: `Cue ${position} of ${cueCount}`,
      unsure: this.state.unsure,
      following: this.state.following,
      visible: this.state.visible,
      controls: this.state.controls,
      sourceStatus: this.state.sourceStatus,
    };
  }

  private applyTrackerEvent(event: TrackerEvent): void {
    if (event.type === "position") {
      this.state = { ...this.state, position: event.state, unsure: false };
      this.emit();
      return;
    }
    if (event.type === "unsure") {
      this.state = { ...this.state, unsure: true };
      this.emit();
    }
  }

  private emit(): void {
    const model = this.getViewModel();
    for (const listener of this.listeners) {
      listener(model);
    }
  }
}
