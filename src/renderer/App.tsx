import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import "./app.css";
import { CueOverlayPanel } from "./CueOverlayPanel";
import { KEYBIND_ROWS, defaultKeyBinds, keyBindFromEvent, matchesKeyBind } from "./cuely-keybinds";
import { getCuelyShell } from "./cuely-shell";
import { DEFAULT_CUES, PRESET_BUTTONS, PRESETS } from "./cuely-presets";
import { splitTranscriptIntoSentences } from "./transcript-utils";
import type { OverlayAction, OverlayPresentState } from "../shared/overlay-protocol";
import type {
  AppView,
  Cue,
  KeyBindAction,
  KeyBindMap,
  ReadingWidth,
  Theme,
  TranscriptionSource,
} from "./cuely-types";

let cueSequence = 100;
type ComposerMode = "add-cue" | "add-transcript" | "add-sentences";

function newCueId(): string {
  cueSequence += 1;
  return `c${cueSequence}`;
}

function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

function CuelyMark({ size = 17 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="24" height="6.2" rx="3.1" fill="var(--accent)" />
      <rect x="4" y="15.2" width="18" height="5" rx="2.5" fill="var(--text-2)" opacity="0.55" />
      <rect x="4" y="22.8" width="11.5" height="4" rx="2" fill="var(--text-2)" opacity="0.28" />
    </svg>
  );
}

export function App(): ReactElement {
  const shell = getCuelyShell();
  const panelRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<AppView>("script");
  const [composerMode, setComposerMode] = useState<ComposerMode>("add-cue");
  const [theme, setTheme] = useState<Theme>("dark");
  const [title, setTitle] = useState("Q3 Board Review");
  const [session, setSession] = useState("Investor sync");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(0.9);
  const [overlayPos, setOverlayPos] = useState<"top" | "bottom">("bottom");
  const [overlayCompact, setOverlayCompact] = useState(false);
  const [dragX, setDragX] = useState<number | null>(null);
  const [dragY, setDragY] = useState<number | null>(null);
  const [recordingBind, setRecordingBind] = useState<KeyBindAction | null>(null);
  const [keybinds, setKeybinds] = useState<KeyBindMap>(defaultKeyBinds);
  const [fontScale, setFontScale] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [width, setWidth] = useState<ReadingWidth>("comfortable");
  const [source, setSource] = useState<TranscriptionSource>("native");
  const [draftText, setDraftText] = useState("");
  const [draftKeywords, setDraftKeywords] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [sentencesDraft, setSentencesDraft] = useState("");
  const [composerNotice, setComposerNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuffer, setEditBuffer] = useState("");
  const [cues, setCues] = useState<Cue[]>(DEFAULT_CUES);

  const cueCount = cues.length;
  const safeIndex = clampIndex(currentIndex, cueCount);

  const buildOverlayState = useCallback((): OverlayPresentState => {
    return {
      cues: cues.map((cue) => ({ id: cue.id, text: cue.text })),
      currentIndex: safeIndex,
      overlayOpacity,
      overlayCompact,
      overlayPos,
      fontScale,
      mirror,
      keybinds,
    };
  }, [cues, safeIndex, overlayOpacity, overlayCompact, overlayPos, fontScale, mirror, keybinds]);

  const startPresenting = useCallback(async (): Promise<void> => {
    if (cues.length === 0) {
      setView("script");
      return;
    }
    if (shell) {
      setPresenting(true);
      await shell.openOverlay(buildOverlayState());
      return;
    }
    const panelWidth = overlayCompact ? 500 : 720;
    const w = window.innerWidth;
    const h = window.innerHeight;
    setPresenting(true);
    setOverlayPos("bottom");
    setDragX(Math.max(20, Math.round((w - panelWidth) / 2)));
    setDragY(Math.max(20, h - 300));
  }, [buildOverlayState, cues.length, overlayCompact, shell]);

  const stopPresenting = useCallback(async (): Promise<void> => {
    setPresenting(false);
    if (shell) {
      await shell.closeOverlay();
    }
  }, [shell]);

  const nextCue = useCallback((): void => {
    setCurrentIndex((prev) => clampIndex(prev + 1, cues.length));
  }, [cues.length]);

  const prevCue = useCallback((): void => {
    setCurrentIndex((prev) => clampIndex(prev - 1, cues.length));
  }, [cues.length]);

  useEffect(() => {
    if (!shell || !presenting) return;
    shell.pushOverlayState(buildOverlayState());
  }, [buildOverlayState, presenting, shell]);

  useEffect(() => {
    if (!shell) return;
    return shell.onOverlayClosed(() => {
      setPresenting(false);
    });
  }, [shell]);

  useEffect(() => {
    if (!shell) return;
    return shell.onOverlayAction((action: OverlayAction) => {
      switch (action.type) {
        case "next":
          setCurrentIndex((prev) => clampIndex(prev + 1, cues.length));
          break;
        case "prev":
          setCurrentIndex((prev) => clampIndex(prev - 1, cues.length));
          break;
        case "close":
          void stopPresenting();
          break;
        case "set-opacity":
          setOverlayOpacity(action.value);
          break;
        case "toggle-compact":
          setOverlayCompact((prev) => !prev);
          break;
        case "snap-vertical":
          setOverlayPos((prev) => {
            const next = prev === "top" ? "bottom" : "top";
            shell.snapOverlay(next);
            return next;
          });
          break;
        default:
          break;
      }
    });
  }, [cues.length, shell, stopPresenting]);

  useEffect(() => {
    if (shell) return;
    document.documentElement.classList.toggle("cuely-presenting", presenting);
    return () => document.documentElement.classList.remove("cuely-presenting");
  }, [presenting, shell]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (recordingBind) {
        if (["Alt", "Control", "Shift", "Meta"].includes(event.key)) return;
        event.preventDefault();
        const bind = keyBindFromEvent(event);
        setKeybinds((prev) => ({ ...prev, [recordingBind]: bind }));
        setRecordingBind(null);
        return;
      }

      if (shell && presenting) {
        return;
      }

      const kb = keybinds;
      if (matchesKeyBind(event, kb.close)) {
        if (presenting && !shell) {
          event.preventDefault();
          void stopPresenting();
        }
        return;
      }
      if (matchesKeyBind(event, kb.next)) {
        event.preventDefault();
        nextCue();
      } else if (matchesKeyBind(event, kb.prev)) {
        event.preventDefault();
        prevCue();
      } else if (matchesKeyBind(event, kb.top)) {
        event.preventDefault();
        setCurrentIndex(0);
      } else if (matchesKeyBind(event, kb.compact)) {
        event.preventDefault();
        setOverlayCompact((prev) => !prev);
      } else if (matchesKeyBind(event, kb.opacityDown)) {
        event.preventDefault();
        setOverlayOpacity((prev) => Math.max(0, +(prev - 0.05).toFixed(2)));
      } else if (matchesKeyBind(event, kb.opacityUp)) {
        event.preventDefault();
        setOverlayOpacity((prev) => Math.min(1, +(prev + 0.05).toFixed(2)));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keybinds, nextCue, presenting, prevCue, recordingBind, shell, stopPresenting]);

  function appendCues(items: Omit<Cue, "id">[]): void {
    if (items.length === 0) {
      return;
    }
    setCues((prev) => [
      ...prev,
      ...items.map((item) => ({
        ...item,
        id: newCueId(),
      })),
    ]);
  }

  function addCue(): void {
    const text = draftText.trim();
    if (!text) {
      setComposerNotice("Type a cue before adding.");
      return;
    }
    appendCues([
      {
        text,
        keywords: parseKeywords(draftKeywords),
        notes: draftNotes.trim(),
      },
    ]);
    setDraftText("");
    setDraftKeywords("");
    setDraftNotes("");
    setComposerNotice("Added one cue.");
  }

  function addTranscriptAsCues(): void {
    const sentences = splitTranscriptIntoSentences(transcriptDraft);
    if (sentences.length === 0) {
      setComposerNotice("No sentence-sized cues found in transcript.");
      return;
    }
    appendCues(
      sentences.map((sentence) => ({
        text: sentence,
        keywords: [],
        notes: "",
      })),
    );
    setTranscriptDraft("");
    setComposerNotice(`Added ${sentences.length} cues from transcript.`);
  }

  function addSentenceBatch(): void {
    const entries = sentencesDraft
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (entries.length === 0) {
      setComposerNotice("Add at least one sentence.");
      return;
    }
    appendCues(
      entries.map((sentence) => ({
        text: sentence,
        keywords: [],
        notes: "",
      })),
    );
    setSentencesDraft("");
    setComposerNotice(`Added ${entries.length} sentence cue${entries.length === 1 ? "" : "s"}.`);
  }

  function deleteCue(id: string): void {
    setCues((prev) => {
      const idx = prev.findIndex((cue) => cue.id === id);
      const next = prev.filter((cue) => cue.id !== id);
      setCurrentIndex((ci) => {
        let updated = ci;
        if (idx <= ci) updated = Math.max(0, ci - 1);
        return clampIndex(updated, next.length);
      });
      return next;
    });
  }

  function moveCue(id: string, direction: -1 | 1): void {
    setCues((prev) => {
      const i = prev.findIndex((cue) => cue.id === id);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      const a = next[i];
      const b = next[j];
      if (!a || !b) return prev;
      next[i] = b;
      next[j] = a;
      setCurrentIndex((ci) => {
        if (ci === i) return j;
        if (ci === j) return i;
        return ci;
      });
      return next;
    });
  }

  function startEdit(id: string): void {
    const cue = cues.find((item) => item.id === id);
    setEditingId(id);
    setEditBuffer(cue?.text ?? "");
  }

  function saveEdit(id: string): void {
    const value = editBuffer.trim();
    setCues((prev) =>
      prev.map((cue) => (cue.id === id ? { ...cue, text: value || cue.text } : cue)),
    );
    setEditingId(null);
  }

  function loadPreset(key: string): void {
    const preset = PRESETS[key];
    if (!preset) return;
    let n = 0;
    const loaded = preset.cues.map((cue) => {
      n += 1;
      return {
        id: `p${key}${n}`,
        text: cue.text,
        keywords: cue.keywords ?? [],
        notes: cue.notes ?? "",
      };
    });
    setCues(loaded);
    setCurrentIndex(0);
    setTitle(preset.title);
    setSession(preset.session);
    setComposerNotice(`Loaded preset: ${preset.title}`);
    setView("script");
  }

  const statusLabel = presenting ? "Live" : "Idle";

  const useBrowserOverlay = presenting && !shell;

  return (
    <div className={useBrowserOverlay ? "cuely-shell cuely-shell-live" : "cuely-shell"} data-theme={theme}>
      <div className="cuely-window">
        <header className="cuely-titlebar">
          <div className="cuely-titlebar-brand">
            <CuelyMark />
            <span className="cuely-titlebar-name">Cuely</span>
          </div>
          <div className="cuely-titlebar-center">
            {title} · {session}
          </div>
          <span className={presenting ? "cuely-status-pill live" : "cuely-status-pill"}>
            <span className="dot" aria-hidden="true" />
            {statusLabel}
          </span>
        </header>

        <div className="cuely-body">
          <nav className="cuely-rail" aria-label="Main navigation">
            <button
              type="button"
              className={view === "script" ? "cuely-rail-btn active" : "cuely-rail-btn"}
              onClick={() => setView("script")}
              title="Script"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
                <path d="M8 9h7M8 13h7M8 17h4" />
              </svg>
              <span>Script</span>
            </button>
            <button
              type="button"
              className={view === "settings" ? "cuely-rail-btn active" : "cuely-rail-btn"}
              onClick={() => setView("settings")}
              title="Settings"
            >
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="8" cy="12" r="2" />
                <circle cx="13" cy="18" r="2" />
              </svg>
              <span>Settings</span>
            </button>
            <div className="cuely-rail-spacer" />
            <button type="button" className="cuely-rail-go" onClick={startPresenting} title="Go live (transparent overlay)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          </nav>

          {view === "script" ? (
            <section className="cuely-script">
              <header className="cuely-script-header">
                <div>
                  <p className="cuely-meta wide">Cue script</p>
                  <h1>{title}</h1>
                  <p className="cuely-script-sub">
                    {cueCount} cues · {session}
                  </p>
                </div>
                <div className="cuely-script-actions">
                  <button
                    type="button"
                    className="cuely-button ghost"
                    onClick={() => {
                      setCues([]);
                      setCurrentIndex(0);
                      setComposerNotice("Cleared all cues.");
                    }}
                  >
                    Clear all
                  </button>
                  <button type="button" className="cuely-button" onClick={startPresenting}>
                    <span className="cuely-go-dot" aria-hidden="true" />
                    Go live
                  </button>
                </div>
              </header>

              <div className="cuely-script-body">
                <aside className="cuely-composer">
                  <div className="cuely-card">
                    <p className="cuely-meta">Composer</p>
                    <div className="cuely-composer-tabs" role="tablist" aria-label="Cue composer mode">
                      <button
                        type="button"
                        role="tab"
                        className={composerMode === "add-cue" ? "active" : ""}
                        onClick={() => setComposerMode("add-cue")}
                        aria-selected={composerMode === "add-cue"}
                      >
                        Add Cue
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={composerMode === "add-transcript" ? "active" : ""}
                        onClick={() => setComposerMode("add-transcript")}
                        aria-selected={composerMode === "add-transcript"}
                      >
                        Add Transcript
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={composerMode === "add-sentences" ? "active" : ""}
                        onClick={() => setComposerMode("add-sentences")}
                        aria-selected={composerMode === "add-sentences"}
                      >
                        Add Sentences
                      </button>
                    </div>

                    {composerMode === "add-cue" ? (
                      <div className="cuely-composer-pane">
                        <textarea
                          value={draftText}
                          onChange={(e) => setDraftText(e.target.value)}
                          placeholder="A talking point — say it your own way."
                          rows={3}
                        />
                        <input
                          value={draftKeywords}
                          onChange={(e) => setDraftKeywords(e.target.value)}
                          placeholder="keywords, comma, separated"
                          className="cuely-input-mono"
                        />
                        <input
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          placeholder="sub-note (optional)"
                        />
                        <button type="button" className="cuely-button full" onClick={addCue}>
                          Add cue
                        </button>
                      </div>
                    ) : null}

                    {composerMode === "add-transcript" ? (
                      <div className="cuely-composer-pane">
                        <textarea
                          value={transcriptDraft}
                          onChange={(e) => setTranscriptDraft(e.target.value)}
                          placeholder="Paste a transcript. We'll split it into sentence cues."
                          rows={6}
                        />
                        <button type="button" className="cuely-button full" onClick={addTranscriptAsCues}>
                          Convert transcript to cues
                        </button>
                      </div>
                    ) : null}

                    {composerMode === "add-sentences" ? (
                      <div className="cuely-composer-pane">
                        <textarea
                          value={sentencesDraft}
                          onChange={(e) => setSentencesDraft(e.target.value)}
                          placeholder="One sentence per line."
                          rows={6}
                        />
                        <button type="button" className="cuely-button full" onClick={addSentenceBatch}>
                          Add sentence cues
                        </button>
                      </div>
                    ) : null}

                    {composerNotice ? <p className="cuely-composer-notice">{composerNotice}</p> : null}
                  </div>

                  <div className="cuely-card">
                    <p className="cuely-meta">Load a preset</p>
                    <div className="cuely-preset-list">
                      {PRESET_BUTTONS.map((preset) => (
                        <button key={preset.key} type="button" className="cuely-preset-btn" onClick={() => loadPreset(preset.key)}>
                          <span>{preset.label}</span>
                          <span className="cuely-preset-count">{preset.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="cuely-composer-hint">
                    Reorder with the arrows; the lit cue is where Present starts. Voice following advances these approximately — you stay the pilot.
                  </p>
                </aside>

                <div className="cuely-cue-list-panel">
                  <header className="cuely-cue-list-header">
                    <h2>Cue list</h2>
                    <span className="cuely-preset-count">{cueCount} cues</span>
                  </header>
                  <div className="cuely-cue-list-scroll">
                    {cueCount === 0 ? (
                      <div className="cuely-cue-empty">
                        <p className="cuely-cue-empty-title">No cues yet</p>
                        <p>Add a talking point or load a preset to begin.</p>
                      </div>
                    ) : (
                      cues.map((cue, index) => {
                        const isCurrent = index === safeIndex;
                        const isEditing = editingId === cue.id;
                        return (
                          <article key={cue.id} className={isCurrent ? "cuely-cue-row active" : "cuely-cue-row"}>
                            <div className="cuely-cue-row-main">
                              <button
                                type="button"
                                className={isCurrent ? "cuely-cue-num active" : "cuely-cue-num"}
                                onClick={() => setCurrentIndex(index)}
                                title="Set as current cue"
                              >
                                {index + 1}
                              </button>
                              <div className="cuely-cue-row-content">
                                {isEditing ? (
                                  <>
                                    <textarea
                                      value={editBuffer}
                                      onChange={(e) => setEditBuffer(e.target.value)}
                                      rows={2}
                                      className="cuely-edit-area"
                                    />
                                    <div className="cuely-edit-actions">
                                      <button type="button" className="cuely-button small" onClick={() => saveEdit(cue.id)}>
                                        Save
                                      </button>
                                      <button type="button" className="cuely-button ghost small" onClick={() => setEditingId(null)}>
                                        Cancel
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <p className="cuely-cue-row-text">{cue.text}</p>
                                    {cue.notes.trim() ? <p className="cuely-cue-row-notes">{cue.notes}</p> : null}
                                    {cue.keywords.length > 0 ? (
                                      <div className="cuely-keyword-row">
                                        {cue.keywords.map((keyword) => (
                                          <span key={keyword} className="cuely-keyword">
                                            {keyword}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              <div className="cuely-cue-row-tools">
                                <button type="button" className="cuely-icon-btn" onClick={() => startEdit(cue.id)} title="Edit" aria-label="Edit">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="m15 5 4 4L8 20H4v-4z" />
                                  </svg>
                                </button>
                                <button type="button" className="cuely-icon-btn" onClick={() => moveCue(cue.id, -1)} title="Move up" aria-label="Move up">
                                  ↑
                                </button>
                                <button type="button" className="cuely-icon-btn" onClick={() => moveCue(cue.id, 1)} title="Move down" aria-label="Move down">
                                  ↓
                                </button>
                                <button type="button" className="cuely-icon-btn muted" onClick={() => deleteCue(cue.id)} title="Delete" aria-label="Delete">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                                    <path d="M6 6 18 18M18 6 6 18" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {view === "settings" ? (
            <section className="cuely-settings">
              <p className="cuely-meta wide">Preferences</p>
              <h1>Settings</h1>

              <div className="cuely-settings-stack">
                <div className="cuely-card">
                  <p className="cuely-meta">Appearance</p>
                  <div className="cuely-setting-row">
                    <span>Theme</span>
                    <div className="cuely-segmented">
                      <button type="button" className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
                        Dark
                      </button>
                      <button type="button" className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
                        Light
                      </button>
                    </div>
                  </div>
                  <div className="cuely-setting-row">
                    <span>
                      Cue size <span className="cuely-mono-muted">{Math.round(fontScale * 100)}%</span>
                    </span>
                    <input
                      type="range"
                      min={0.7}
                      max={1.6}
                      step={0.05}
                      value={fontScale}
                      onChange={(e) => setFontScale(parseFloat(e.target.value))}
                      className="cuely-range"
                    />
                  </div>
                  <div className="cuely-setting-row">
                    <span>Reading width</span>
                    <div className="cuely-segmented">
                      <button type="button" className={width === "narrow" ? "active" : ""} onClick={() => setWidth("narrow")}>
                        Narrow
                      </button>
                      <button type="button" className={width === "comfortable" ? "active" : ""} onClick={() => setWidth("comfortable")}>
                        Comfortable
                      </button>
                      <button type="button" className={width === "wide" ? "active" : ""} onClick={() => setWidth("wide")}>
                        Wide
                      </button>
                    </div>
                  </div>
                  <button type="button" className="cuely-setting-row cuely-toggle-row" onClick={() => setMirror((prev) => !prev)}>
                    <span>
                      Mirror / flip
                      <span className="cuely-setting-hint">For use with physical teleprompter glass.</span>
                    </span>
                    <span className={mirror ? "cuely-toggle on" : "cuely-toggle"}>
                      <span className="cuely-toggle-knob" />
                    </span>
                  </button>
                </div>

                <div className="cuely-card">
                  <p className="cuely-meta">Transcription source</p>
                  <div className="cuely-source-list">
                    {(
                      [
                        { key: "native", label: "On device", desc: "Apple SpeechAnalyzer · private, default" },
                        { key: "cloud", label: "Cloud", desc: "Deepgram / AssemblyAI · opt-in, needs network" },
                        { key: "mock", label: "Mock", desc: "Scripted replay · for rehearsal & testing" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={source === item.key ? "cuely-source-btn active" : "cuely-source-btn"}
                        onClick={() => setSource(item.key)}
                      >
                        <span>
                          <strong>{item.label}</strong>
                          <span className="cuely-source-desc">{item.desc}</span>
                        </span>
                        <span className="cuely-source-tick">✓</span>
                      </button>
                    ))}
                  </div>
                  <div className="cuely-privacy-note">
                    <span aria-hidden="true">🔒</span>
                    <span>
                      On-device by default. Audio is never written to disk. Cloud transcription is opt-in and clearly labelled when active.
                    </span>
                  </div>
                </div>

                <div className="cuely-card">
                  <div className="cuely-shortcuts-header">
                    <p className="cuely-meta">Custom shortcuts</p>
                    <button
                      type="button"
                      className="cuely-button ghost small"
                      onClick={() => {
                        setKeybinds(defaultKeyBinds());
                        setRecordingBind(null);
                      }}
                    >
                      Reset to defaults
                    </button>
                  </div>
                  <div className="cuely-shortcut-list">
                    {KEYBIND_ROWS.map((row) => {
                      const recording = recordingBind === row.key;
                      return (
                        <div key={row.key} className="cuely-shortcut-row">
                          <span>
                            <strong>{row.label}</strong>
                            <span className="cuely-setting-hint">{row.hint}</span>
                          </span>
                          <button
                            type="button"
                            className={recording ? "cuely-bind-btn recording" : "cuely-bind-btn"}
                            onClick={() => setRecordingBind((prev) => (prev === row.key ? null : row.key))}
                          >
                            {recording ? "Press keys…" : keybinds[row.key].label}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="cuely-composer-hint">
                    Click a shortcut, then press the key combination you want. Use modifiers (⌘ ⌥ ⌃ ⇧) so it won&apos;t clash with typing.
                  </p>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {useBrowserOverlay ? (
        <div className="cuely-overlay-root">
          <div
            className="cuely-overlay-float"
            style={{
              width: overlayCompact ? 500 : 720,
              ...(dragX != null && dragY != null
                ? { left: dragX, top: dragY, bottom: "auto", transform: "none" }
                : {}),
            }}
          >
            <CueOverlayPanel
              state={buildOverlayState()}
              panelRef={panelRef}
              onClose={() => void stopPresenting()}
              onPrev={prevCue}
              onNext={nextCue}
              onOpacityChange={setOverlayOpacity}
              onToggleCompact={() => setOverlayCompact((prev) => !prev)}
              onSnapVertical={() => {
                setOverlayPos((prev) => (prev === "top" ? "bottom" : "top"));
                const panel = panelRef.current;
                const panelHeight = panel?.offsetHeight ?? 220;
                setDragY(
                  overlayPos === "top"
                    ? Math.max(30, window.innerHeight - panelHeight - 30)
                    : 30,
                );
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
