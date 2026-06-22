import { useEffect, useMemo, useState, type ReactElement } from "react";
import "./app.css";

type SidebarTab = "add-cue" | "add-transcript" | "add-sentences";

interface CueLine {
  id: string;
  text: string;
}

let cueSequence = 0;

function makeCue(text: string): CueLine {
  cueSequence += 1;
  return { id: `cue-${cueSequence}`, text };
}

function splitTranscriptIntoSentences(rawTranscript: string): string[] {
  const cleaned = rawTranscript.replace(/\r\n/g, "\n").trim();
  if (!cleaned) {
    return [];
  }
  const lines = cleaned.split("\n");
  const sentences: string[] = [];
  for (const line of lines) {
    const fragments = line.match(/[^.!?]+[.!?]?/g) ?? [];
    for (const fragment of fragments) {
      const sentence = fragment.trim();
      if (sentence.length > 0) {
        sentences.push(sentence);
      }
    }
  }
  return sentences;
}

export function App(): ReactElement {
  const [activeTab, setActiveTab] = useState<SidebarTab>("add-cue");
  const [title, setTitle] = useState("Q3 Review");
  const [sessionName, setSessionName] = useState("Demo Session");
  const [transcriptInput, setTranscriptInput] = useState("");
  const [newSentence, setNewSentence] = useState("");
  const [statusMessage, setStatusMessage] = useState("Configure your cue flow, then press Play.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cues, setCues] = useState<CueLine[]>(() => [
    makeCue("Open with the headline number."),
    makeCue("Revenue up 18% QoQ."),
    makeCue("Why it moved: enterprise renewals."),
    makeCue("What we're asking for."),
  ]);

  const currentCue = cues[currentIndex] ?? null;
  const nextCues = useMemo(() => cues.slice(currentIndex + 1, currentIndex + 4), [cues, currentIndex]);

  function moveToNextCue(): void {
    setCurrentIndex((prev) => {
      if (cues.length === 0) {
        return 0;
      }
      return Math.min(prev + 1, cues.length - 1);
    });
  }

  function moveToPreviousCue(): void {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.altKey) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCurrentIndex((prev) => {
          if (cues.length === 0) {
            return 0;
          }
          return Math.min(prev + 1, cues.length - 1);
        });
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCurrentIndex((prev) => Math.max(prev - 1, 0));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cues.length]);

  function appendSentences(sentences: string[]): void {
    if (sentences.length === 0) {
      setStatusMessage("No sentences found. Add content first.");
      return;
    }
    const next = [...cues, ...sentences.map((sentence) => makeCue(sentence))];
    setCues(next);
    setStatusMessage(`Added ${sentences.length} sentence${sentences.length === 1 ? "" : "s"} to the cue list.`);
  }

  function onUseTranscript(): void {
    appendSentences(splitTranscriptIntoSentences(transcriptInput));
    setTranscriptInput("");
  }

  function onAddSentence(): void {
    const value = newSentence.trim();
    if (!value) {
      setStatusMessage("Type a sentence before adding.");
      return;
    }
    appendSentences([value]);
    setNewSentence("");
  }

  function onDeleteCue(index: number): void {
    const next = cues.filter((_, cueIndex) => cueIndex !== index);
    setCues(next);
    setCurrentIndex((prev) => {
      if (next.length === 0) {
        return 0;
      }
      return Math.min(prev, next.length - 1);
    });
    setStatusMessage("Removed cue.");
  }

  function onMoveCue(index: number, direction: -1 | 1): void {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= cues.length) {
      return;
    }
    const next = [...cues];
    const currentCueLine = next[index];
    const swapCueLine = next[swapIndex];
    if (!currentCueLine || !swapCueLine) {
      return;
    }
    next[index] = swapCueLine;
    next[swapIndex] = currentCueLine;
    setCues(next);
    if (currentIndex === index) {
      setCurrentIndex(swapIndex);
    } else if (currentIndex === swapIndex) {
      setCurrentIndex(index);
    }
  }

  function onClearQueue(): void {
    setCues([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    setStatusMessage("Started a fresh cue list.");
  }

  function onStartOrPause(): void {
    if (cues.length === 0) {
      setStatusMessage("Add at least one sentence before pressing Play.");
      return;
    }
    setIsPlaying((prev) => !prev);
    setStatusMessage(
      isPlaying
        ? "Playback paused. You can continue with Play."
        : "Playback started. Use Option + Arrow keys for manual cue control.",
    );
  }

  const progressLabel =
    cues.length === 0 ? "No cues yet" : `Cue ${Math.min(currentIndex + 1, cues.length)} of ${cues.length}`;

  return (
    <div className="mockup-app">
      <aside className="mockup-sidebar">
        <header className="mockup-branding">
          <p className="mockup-branding-tag">Cuely</p>
          <h1>Cue Builder</h1>
          <p>Manual-first workflow for your first functional app mockup.</p>
        </header>

        <nav className="mockup-tabs" aria-label="Cue setup tabs">
          <button
            type="button"
            className={activeTab === "add-cue" ? "mockup-tab active" : "mockup-tab"}
            onClick={() => setActiveTab("add-cue")}
          >
            Add Cue
          </button>
          <button
            type="button"
            className={activeTab === "add-transcript" ? "mockup-tab active" : "mockup-tab"}
            onClick={() => setActiveTab("add-transcript")}
          >
            Add Transcript
          </button>
          <button
            type="button"
            className={activeTab === "add-sentences" ? "mockup-tab active" : "mockup-tab"}
            onClick={() => setActiveTab("add-sentences")}
          >
            Add Sentences
          </button>
        </nav>

        <section className="mockup-side-panel">
          {activeTab === "add-cue" ? (
            <div className="mockup-panel-stack">
              <label className="mockup-field">
                Cue title
                <input value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="mockup-field">
                Session
                <input
                  value={sessionName}
                  onChange={(event) => setSessionName(event.target.value)}
                  placeholder="Morning rehearsal"
                />
              </label>
              <button className="mockup-button ghost" type="button" onClick={onClearQueue}>
                Start Fresh Cue List
              </button>
            </div>
          ) : null}

          {activeTab === "add-transcript" ? (
            <div className="mockup-panel-stack">
              <label className="mockup-field">
                Paste transcript
                <textarea
                  value={transcriptInput}
                  onChange={(event) => setTranscriptInput(event.target.value)}
                  placeholder="Paste paragraphs here. We split them into sentence cues."
                  rows={8}
                />
              </label>
              <button className="mockup-button" type="button" onClick={onUseTranscript}>
                Convert Transcript to Sentences
              </button>
            </div>
          ) : null}

          {activeTab === "add-sentences" ? (
            <div className="mockup-panel-stack">
              <label className="mockup-field">
                Sentence
                <textarea
                  value={newSentence}
                  onChange={(event) => setNewSentence(event.target.value)}
                  placeholder="Type one sentence cue."
                  rows={3}
                />
              </label>
              <button className="mockup-button" type="button" onClick={onAddSentence}>
                Add Sentence
              </button>
            </div>
          ) : null}
        </section>

        <footer className="mockup-sidebar-footer">
          <p>Manual navigation: Option + Right / Option + Left</p>
        </footer>
      </aside>

      <main className="mockup-main">
        <header className="mockup-main-header">
          <div>
            <p className="mockup-kicker">Cue session</p>
            <h2>{title || "Untitled Cue Session"}</h2>
            <p className="mockup-subline">
              {sessionName || "Untitled Session"} · {progressLabel}
            </p>
          </div>
          <div className="mockup-actions">
            <button className="mockup-button ghost" type="button" onClick={moveToPreviousCue}>
              Previous
            </button>
            <button className="mockup-button ghost" type="button" onClick={moveToNextCue}>
              Next
            </button>
            <button className="mockup-button" type="button" onClick={onStartOrPause}>
              {isPlaying ? "Pause" : "Play"}
            </button>
          </div>
        </header>

        <p className="mockup-status">{statusMessage}</p>

        <section className="mockup-stage">
          <p className="mockup-stage-kicker">Current cue</p>
          {isPlaying && currentCue ? (
            <h3>{currentCue.text}</h3>
          ) : (
            <h3 className="muted">Press Play to start cue tracking.</h3>
          )}
        </section>

        <section className="mockup-next">
          <p className="mockup-next-title">Next sentences</p>
          {nextCues.length > 0 ? (
            <ol>
              {nextCues.map((cue) => (
                <li key={cue.id}>{cue.text}</li>
              ))}
            </ol>
          ) : (
            <p className="muted">No upcoming sentences yet.</p>
          )}
        </section>

        <section className="mockup-queue">
          <div className="mockup-queue-header">
            <h4>Cue queue</h4>
            <p>{cues.length} sentence(s)</p>
          </div>
          <ol>
            {cues.map((cue, index) => (
              <li key={cue.id} className={index === currentIndex ? "active" : ""}>
                <button type="button" className="mockup-cue-text" onClick={() => setCurrentIndex(index)}>
                  {cue.text}
                </button>
                <div className="mockup-cue-controls">
                  <button type="button" onClick={() => onMoveCue(index, -1)} aria-label="Move cue up">
                    ↑
                  </button>
                  <button type="button" onClick={() => onMoveCue(index, 1)} aria-label="Move cue down">
                    ↓
                  </button>
                  <button type="button" onClick={() => onDeleteCue(index)} aria-label="Delete cue">
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
