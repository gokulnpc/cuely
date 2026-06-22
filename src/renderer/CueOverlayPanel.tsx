import type { CSSProperties, ReactElement, RefObject } from "react";
import type { OverlayPresentState } from "../shared/overlay-protocol";

interface CueOverlayPanelProps {
  state: OverlayPresentState;
  panelRef?: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpacityChange: (value: number) => void;
  onToggleCompact: () => void;
  onSnapVertical: () => void;
}

function clampIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(index, length - 1));
}

export function CueOverlayPanel({
  state,
  panelRef,
  onClose,
  onPrev,
  onNext,
  onOpacityChange,
  onToggleCompact,
  onSnapVertical,
}: CueOverlayPanelProps): ReactElement {
  const { cues, currentIndex, overlayOpacity, overlayCompact, fontScale, mirror } = state;
  const safeIndex = clampIndex(currentIndex, cues.length);
  const currentCue = cues[safeIndex] ?? null;
  const overlayNext = cues[safeIndex + 1]?.text ?? null;
  const progressLabel = cues.length === 0 ? "No cues" : `Cue ${safeIndex + 1} of ${cues.length}`;

  const blurPx = Math.round(overlayOpacity * 22);
  const panelStyle: CSSProperties = {
    width: overlayCompact ? 500 : 720,
    boxSizing: "border-box",
    background: `rgba(15,17,21,${overlayOpacity})`,
    backdropFilter: `blur(${blurPx}px) saturate(${1 + overlayOpacity * 0.5})`,
    WebkitBackdropFilter: `blur(${blurPx}px) saturate(${1 + overlayOpacity * 0.5})`,
    border: `1px solid rgba(255,255,255,${(0.14 * overlayOpacity + 0.015).toFixed(3)})`,
    borderRadius: 18,
    boxShadow: `0 26px 80px rgba(0,0,0,${(0.55 * overlayOpacity).toFixed(2)})`,
    color: "#EEF1F5",
    padding: overlayCompact ? "15px 20px" : "22px 26px",
  };

  const overlayCueStyle: CSSProperties = {
    fontFamily: "var(--display)",
    fontWeight: 600,
    letterSpacing: "-0.015em",
    lineHeight: 1.12,
    fontSize: Math.round((overlayCompact ? 23 : 31) * fontScale),
    color: "#F4F6F8",
    textShadow: "0 1px 14px rgba(0,0,0,.55), 0 0 2px rgba(0,0,0,.4)",
    transform: mirror ? "scaleX(-1)" : undefined,
  };

  return (
    <div ref={panelRef} className="cuely-overlay-panel cuely-overlay-panel-windowed" style={panelStyle}>
      <header className="cuely-overlay-panel-header">
        <span className="cuely-overlay-drag" title="Drag to move anywhere">
          <svg width="13" height="14" viewBox="0 0 24 24" aria-hidden="true">
            <g fill="rgba(238,241,245,.5)">
              <circle cx="9" cy="5" r="1.7" />
              <circle cx="15" cy="5" r="1.7" />
              <circle cx="9" cy="12" r="1.7" />
              <circle cx="15" cy="12" r="1.7" />
              <circle cx="9" cy="19" r="1.7" />
              <circle cx="15" cy="19" r="1.7" />
            </g>
          </svg>
          <span className="cuely-overlay-live-dot" aria-hidden="true" />
          <span className="cuely-overlay-brand">Cuely</span>
          <span className="cuely-overlay-private">· only you can see this</span>
        </span>
        <span className="cuely-overlay-progress">{progressLabel}</span>
        <button type="button" className="cuely-overlay-close" onClick={onClose} title="Exit (Esc)" aria-label="Exit live overlay">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>
      </header>

      <div style={overlayCueStyle}>{currentCue?.text ?? ""}</div>

      {!overlayCompact ? (
        <div>
          {overlayNext ? (
            <p className="cuely-overlay-next">
              <span className="cuely-overlay-next-label">Next</span>
              <span>{overlayNext}</span>
            </p>
          ) : null}
          <div className="cuely-overlay-controls">
            <button type="button" className="cuely-overlay-ghost" onClick={onPrev}>
              ← Prev
            </button>
            <button type="button" className="cuely-overlay-primary" onClick={onNext}>
              Next →
            </button>
            <span className="cuely-overlay-hotkeys">
              <kbd>⌥</kbd>
              <kbd>→ ←</kbd>
            </span>
            <span className="cuely-overlay-spacer" />
            <label className="cuely-overlay-opacity">
              <span>Opacity</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={overlayOpacity}
                onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
              />
              <span>{Math.round(overlayOpacity * 100)}%</span>
            </label>
            <button type="button" className="cuely-overlay-ghost sm" onClick={onSnapVertical}>
              {state.overlayPos === "top" ? "Snap bottom" : "Snap top"}
            </button>
            <button type="button" className="cuely-overlay-ghost sm" onClick={onToggleCompact}>
              Compact
            </button>
          </div>
        </div>
      ) : (
        <div className="cuely-overlay-controls compact">
          <button type="button" className="cuely-overlay-ghost" onClick={onPrev}>
            ←
          </button>
          <button type="button" className="cuely-overlay-primary" onClick={onNext}>
            Next →
          </button>
          <span className="cuely-overlay-spacer" />
          <button type="button" className="cuely-overlay-ghost sm" onClick={onToggleCompact}>
            Expand
          </button>
        </div>
      )}
    </div>
  );
}
