import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { MockTranscriptSource } from "../sources/mock-source";
import { createDemoScript, createDemoTranscript } from "../shared/demo-script";
import type { CuelyBridge, HotkeyAction, ScriptPreset } from "../shared/bridge";
import { getCuelyBridge } from "./bridge-client";
import { PrompterSession, type PrompterViewModel } from "./prompter-session";
import { loadScriptIntoSession } from "./script-loader";

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
        {model.sourceStatus.state === "error" ? (
          <p style={{ color: "#ef4444", margin: "0.4rem 0" }}>
            Source error: {model.sourceStatus.message}. Voice following is unavailable; use manual controls.
          </p>
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
  const bridge = useMemo(() => getCuelyBridge(), []);
  if (bridge) {
    return <BridgeDrivenApp bridge={bridge} />;
  }

  return <LocalDemoApp />;
}

function LocalDemoApp(): ReactElement {
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
      <Controls
        model={model}
        onFontSizeChange={onFontSizeChange}
        onLineHeightChange={onLineHeightChange}
        onWidthChange={onWidthChange}
        onToggleTheme={() => session.setControls({ theme: model.controls.theme === "dark" ? "light" : "dark" })}
        onToggleMirror={() => session.setControls({ mirrored: !model.controls.mirrored })}
        onPrev={() => session.applyHotkey("prev")}
        onNext={() => session.applyHotkey("next")}
        onToggleFollowing={() => session.applyHotkey("toggle-following")}
      />
      <ThemeContainer model={model} />
    </>
  );
}

function BridgeDrivenApp({ bridge }: { bridge: CuelyBridge }): ReactElement {
  const [session, setSession] = useState<PrompterSession>(() => new PrompterSession(createDemoScript()));
  const [model, setModel] = useState<PrompterViewModel>(session.getViewModel());
  const [scriptPath, setScriptPath] = useState("scripts/q3-review.md");
  const [scriptPresets, setScriptPresets] = useState<ScriptPreset[]>([]);
  const [scriptStatus, setScriptStatus] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"mock" | "cloud" | "native">("mock");
  const [sourceActionStatus, setSourceActionStatus] = useState<string | null>(null);
  const sessionRef = useRef(session);

  useEffect(() => {
    sessionRef.current = session;
    const unsubscribe = session.onChange(setModel);
    return () => unsubscribe();
  }, [session]);

  useEffect(() => {
    let active = true;
    let stopTrackerEvents: (() => void) | null = null;
    let stopSourceStatus: (() => void) | null = null;
    let stopHotkeys: (() => void) | null = null;

    void (async () => {
      try {
        const presets = await bridge.listScriptPresets();
        if (active) {
          setScriptPresets(presets);
          if (presets.length > 0) {
            const firstPreset = presets[0];
            if (firstPreset) {
              setScriptPath(firstPreset.path);
            }
          }
        }
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to list script presets.";
          setScriptStatus(message);
        }
      }

      let script = createDemoScript();
      try {
        script = await bridge.loadScript();
      } catch (error) {
        if (active) {
          const message = error instanceof Error ? error.message : "Failed to load initial script.";
          setScriptStatus(message);
        }
      }
      if (!active) {
        return;
      }

      const initialSession = new PrompterSession(script);
      sessionRef.current = initialSession;
      setSession(initialSession);

      stopTrackerEvents = bridge.onTrackerEvent((event) => {
        sessionRef.current.consumeTrackerEvent(event);
      });
      stopSourceStatus = bridge.onSourceStatus((status) => {
        sessionRef.current.setSourceStatus(status);
      });
      stopHotkeys = bridge.onHotkey((action) => {
        if (action === "toggle-following" || action === "toggle-visible") {
          sessionRef.current.applyHotkey(action);
        }
      });

      await selectSourceKind("mock");
    })();

    return () => {
      active = false;
      stopTrackerEvents?.();
      stopSourceStatus?.();
      stopHotkeys?.();
    };
  }, [bridge]);

  function onFontSizeChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ fontSizePx: Number(event.target.value) });
  }

  function onLineHeightChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ lineHeight: Number(event.target.value) });
  }

  function onWidthChange(event: ChangeEvent<HTMLInputElement>): void {
    session.setControls({ widthPercent: Number(event.target.value) });
  }

  function trigger(action: HotkeyAction): void {
    void bridge.triggerHotkey(action);
  }

  async function loadScriptFromPath(): Promise<void> {
    const result = await loadScriptIntoSession({
      bridge,
      path: scriptPath.trim(),
      sourceKind,
      currentSession: sessionRef.current,
      demoChunks: createDemoTranscript(),
    });
    setScriptStatus(result.status);
    if (result.success) {
      sessionRef.current = result.session;
      setSession(result.session);
      if (!result.sourceReady) {
        setSourceActionStatus("Script loaded, but source start failed. Manual mode is active.");
      }
    }
  }

  async function selectSourceKind(kind: "mock" | "cloud" | "native"): Promise<void> {
    setSourceKind(kind);
    try {
      if (kind === "mock") {
        await bridge.selectSource("mock", { chunks: createDemoTranscript() });
      } else {
        await bridge.selectSource(kind);
      }
      setSourceActionStatus(`Source selected: ${kind}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to switch source.";
      setSourceActionStatus(message);
    }
  }

  return (
    <>
      <Controls
        model={model}
        onFontSizeChange={onFontSizeChange}
        onLineHeightChange={onLineHeightChange}
        onWidthChange={onWidthChange}
        onToggleTheme={() => session.setControls({ theme: model.controls.theme === "dark" ? "light" : "dark" })}
        onToggleMirror={() => session.setControls({ mirrored: !model.controls.mirrored })}
        onPrev={() => trigger("prev")}
        onNext={() => trigger("next")}
        onToggleFollowing={() => trigger("toggle-following")}
      />
      <div style={{ padding: "0 0.75rem 0.75rem 0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        {scriptPresets.length > 0 ? (
          <select
            value={scriptPath}
            onChange={(event) => setScriptPath(event.target.value)}
            style={{ minWidth: "220px" }}
          >
            {scriptPresets.map((preset) => (
              <option key={preset.path} value={preset.path}>
                {preset.label}
              </option>
            ))}
          </select>
        ) : null}
        <input
          type="text"
          value={scriptPath}
          onChange={(event) => setScriptPath(event.target.value)}
          placeholder="Path to cue script (.md or .json)"
          style={{ minWidth: "320px" }}
        />
        <button type="button" onClick={() => void loadScriptFromPath()}>
          Load Script
        </button>
        {scriptStatus ? <span>{scriptStatus}</span> : null}
      </div>
      <div style={{ padding: "0 0.75rem 0.75rem 0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label>
          Source
          <select value={sourceKind} onChange={(event) => setSourceKind(event.target.value as "mock" | "cloud" | "native")}>
            <option value="mock">mock</option>
            <option value="cloud">cloud</option>
            <option value="native">native</option>
          </select>
        </label>
        <button type="button" onClick={() => void selectSourceKind(sourceKind)}>
          Apply Source
        </button>
        {sourceActionStatus ? <span>{sourceActionStatus}</span> : null}
      </div>
      <ThemeContainer model={model} />
    </>
  );
}

interface ControlsProps {
  model: PrompterViewModel;
  onFontSizeChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onLineHeightChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onWidthChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onToggleTheme: () => void;
  onToggleMirror: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleFollowing: () => void;
}

function Controls(props: ControlsProps): ReactElement {
  const {
    model,
    onFontSizeChange,
    onLineHeightChange,
    onWidthChange,
    onToggleTheme,
    onToggleMirror,
    onPrev,
    onNext,
    onToggleFollowing,
  } = props;

  return (
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
      <button type="button" onClick={onToggleTheme}>
        Theme
      </button>
      <button type="button" onClick={onToggleMirror}>
        Mirror
      </button>
      <button type="button" onClick={onPrev}>
        Prev
      </button>
      <button type="button" onClick={onNext}>
        Next
      </button>
      <button type="button" onClick={onToggleFollowing}>
        Toggle Following
      </button>
    </div>
  );
}
