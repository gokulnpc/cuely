import { useEffect, useMemo, useState, type ChangeEvent, type ReactElement } from "react";
import { MockTranscriptSource } from "../sources/mock-source";
import { createDemoScript, createDemoTranscript } from "../shared/demo-script";
import { PrompterSession, type PrompterViewModel } from "./prompter-session";

function ThemeContainer({ model }: { model: PrompterViewModel }): ReactElement {
  if (!model.visible) {
    return (
      <main>
        <h1>Cuely</h1>
        <p>Prompter hidden. Use the visibility hotkey to re-open.</p>
      </main>
    );
  }

  const current = model.currentCue;
  const mirrorTransform = model.controls.mirrored ? "scaleX(-1)" : "none";
  const background = model.controls.theme === "dark" ? "#0e1117" : "#ffffff";
  const foreground = model.controls.theme === "dark" ? "#f5f7fa" : "#111827";
  const muted = model.controls.theme === "dark" ? "#9ca3af" : "#6b7280";

  return (
    <main
      style={{
        background,
        color: foreground,
        minHeight: "100vh",
        padding: "2rem",
        transform: mirrorTransform,
      }}
    >
      <header style={{ marginBottom: "1rem" }}>
        <h1 style={{ margin: 0 }}>Cuely — {model.title}</h1>
        <p style={{ color: muted, margin: "0.5rem 0" }}>
          {model.progressLabel} · Following: {model.following ? "On" : "Off"} · Source:{" "}
          {model.sourceStatus.state}
        </p>
        {model.unsure ? (
          <p style={{ color: "#f59e0b", margin: "0.4rem 0" }}>Unsure — holding current cue.</p>
        ) : null}
      </header>
      <section
        style={{
          width: `${model.controls.widthPercent}%`,
          fontSize: `${model.controls.fontSizePx}px`,
          lineHeight: model.controls.lineHeight,
          border: `1px solid ${muted}`,
          borderRadius: "12px",
          padding: "1.2rem",
          marginBottom: "1rem",
        }}
      >
        <strong>Current cue</strong>
        <p>{current.text}</p>
        {current.notes ? <p style={{ color: muted }}>{current.notes}</p> : null}
      </section>
      <section style={{ width: `${model.controls.widthPercent}%` }}>
        <strong>Next cues</strong>
        <ol style={{ color: muted }}>
          {model.nextCues.map((cue) => (
            <li key={cue.id}>{cue.text}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}

export function App(): ReactElement {
  const session = useMemo(() => new PrompterSession(createDemoScript()), []);
  const [model, setModel] = useState<PrompterViewModel>(session.getViewModel());

  useEffect(() => {
    const unsubscribe = session.onChange(setModel);
    return () => unsubscribe();
  }, [session]);

  useEffect(() => {
    const source = new MockTranscriptSource(createDemoTranscript(), { timeScale: 1.5 });
    const stopChunk = source.onChunk((chunk) => session.pushTranscript(chunk));
    const stopStatus = source.onStatus((status) => session.setSourceStatus(status));
    void source.start();

    return () => {
      void source.stop();
      stopChunk();
      stopStatus();
    };
  }, [session]);

  function onFontSizeChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ fontSizePx: Number(event.target.value) });
  }

  function onLineHeightChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ lineHeight: Number(event.target.value) });
  }

  function onWidthChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ widthPercent: Number(event.target.value) });
  }

  return (
    <>
      <div style={{ padding: "0.75rem", display: "flex", gap: "1rem", alignItems: "center" }}>
        <label>
          Font
          <input type="range" min={24} max={72} value={model.controls.fontSizePx} onChange={onFontSizeChange} />
        </label>
        <label>
          Line
          <input type="range" min={1} max={2} step={0.05} value={model.controls.lineHeight} onChange={onLineHeightChange} />
        </label>
        <label>
          Width
          <input type="range" min={45} max={95} value={model.controls.widthPercent} onChange={onWidthChange} />
        </label>
        <button type="button" onClick={() => session.setControls({ theme: model.controls.theme === "dark" ? "light" : "dark" })}>
          Theme
        </button>
        <button type="button" onClick={() => session.setControls({ mirrored: !model.controls.mirrored })}>
          Mirror
        </button>
        <button type="button" onClick={() => session.applyHotkey("prev")}>
          Prev
        </button>
        <button type="button" onClick={() => session.applyHotkey("next")}>
          Next
        </button>
        <button type="button" onClick={() => session.applyHotkey("toggle-following")}>
          Toggle Following
        </button>
      </div>
      <ThemeContainer model={model} />
    </>
  );
}
