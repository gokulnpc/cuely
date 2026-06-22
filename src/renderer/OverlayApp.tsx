import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import "./app.css";
import { CueOverlayPanel } from "./CueOverlayPanel";
import { getCuelyShell } from "./cuely-shell";
import { defaultKeyBinds, matchesKeyBind } from "./cuely-keybinds";
import type { OverlayAction, OverlayPresentState } from "../shared/overlay-protocol";
import type { KeyBindMap } from "./cuely-types";

const EMPTY_STATE: OverlayPresentState = {
  cues: [],
  currentIndex: 0,
  overlayOpacity: 0.9,
  overlayCompact: false,
  overlayPos: "bottom",
  fontScale: 1,
  mirror: false,
  keybinds: defaultKeyBinds(),
};

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function OverlayApp(): ReactElement {
  const shell = getCuelyShell();
  const panelRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<OverlayPresentState>(EMPTY_STATE);

  useEffect(() => {
    if (!shell) return;
    return shell.onOverlayState((next) => setState(next));
  }, [shell]);

  const syncOverlaySize = useCallback((): void => {
    const panel = panelRef.current;
    if (!panel || !shell) return;
    const rect = panel.getBoundingClientRect();
    shell.setOverlaySize({
      width: Math.ceil(rect.width),
      height: Math.ceil(rect.height),
    });
  }, [shell]);

  useLayoutEffect(() => {
    syncOverlaySize();
  }, [syncOverlaySize, state]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel || !shell) return;

    const observer = new ResizeObserver(() => {
      syncOverlaySize();
    });
    observer.observe(panel);
    return () => observer.disconnect();
  }, [shell, syncOverlaySize]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const kb = state.keybinds as KeyBindMap;
      if (matchesKeyBind(event, kb.close)) {
        event.preventDefault();
        sendAction({ type: "close" });
        return;
      }
      if (matchesKeyBind(event, kb.next)) {
        event.preventDefault();
        sendAction({ type: "next" });
      } else if (matchesKeyBind(event, kb.prev)) {
        event.preventDefault();
        sendAction({ type: "prev" });
      } else if (matchesKeyBind(event, kb.compact)) {
        event.preventDefault();
        sendAction({ type: "toggle-compact" });
      } else if (matchesKeyBind(event, kb.opacityDown)) {
        event.preventDefault();
        sendAction({ type: "set-opacity", value: Math.max(0, +(state.overlayOpacity - 0.05).toFixed(2)) });
      } else if (matchesKeyBind(event, kb.opacityUp)) {
        event.preventDefault();
        sendAction({ type: "set-opacity", value: Math.min(1, +(state.overlayOpacity + 0.05).toFixed(2)) });
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state]);

  function sendAction(action: OverlayAction): void {
    shell?.sendOverlayAction(action);
  }

  const safeIndex = clampIndex(state.currentIndex, state.cues.length);

  return (
    <div className="cuely-overlay-window-root">
      <CueOverlayPanel
        state={{ ...state, currentIndex: safeIndex }}
        panelRef={panelRef}
        onClose={() => sendAction({ type: "close" })}
        onPrev={() => sendAction({ type: "prev" })}
        onNext={() => sendAction({ type: "next" })}
        onOpacityChange={(value) => sendAction({ type: "set-opacity", value })}
        onToggleCompact={() => sendAction({ type: "toggle-compact" })}
        onSnapVertical={() => sendAction({ type: "snap-vertical" })}
      />
    </div>
  );
}
