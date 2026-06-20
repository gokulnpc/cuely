# API & Interface Contracts — Cuely

This is the source of truth for the boundaries between modules. Implement to these
signatures; the cloud agent should treat changes here as contract changes (update tests
and all implementers together). All types are TypeScript unless noted.

**Contents**
1. Cue data model & script format
2. `TranscriptSource` interface
3. `CueTracker` engine API
4. Native sidecar WebSocket protocol
5. Electron IPC (main ↔ renderer)
6. Cloud ASR adapters
7. Versioning

---

## 1. Cue data model & script format

```ts
/** A single talking point. */
export interface Cue {
  id: string;              // stable unique id
  text: string;            // what is shown to the speaker
  keywords?: string[];     // optional explicit keywords/aliases used by the keyword matcher
  notes?: string;          // optional sub-bullets shown smaller; not used for matching
}

/** An ordered deck of cues plus matching configuration. */
export interface CueScript {
  version: 1;
  title?: string;
  cues: Cue[];             // order defines the "expected" path (non-monotonic moves allowed)
  config?: Partial<CueTrackerConfig>;  // optional per-script overrides
}
```

**Authoring format (recommended).** Humans author Markdown; a build step compiles it to a
`CueScript`. One cue per top-level bullet; an optional inline `{kw: ...}` tag supplies
keywords; indented bullets become `notes`.

```md
---
title: Q3 Review
---
- Open with the headline number {kw: revenue, 4.2 million, growth}
  - up 18% QoQ
- Why it moved: enterprise renewals {kw: enterprise, renewals, churn}
- What we're asking for {kw: ask, headcount, budget}
```

Keyword extraction: if a cue has no `keywords`, the compiler derives them (stopword
removal + simple TF weighting against the rest of the deck). Authored keywords always win.

---

## 2. `TranscriptSource` interface

The single seam between audio/ASR and the rest of the app. Everything downstream is
agnostic to which implementation is active.

```ts
export interface TranscriptChunk {
  text: string;            // recognized text for this chunk (cleaned text is fine)
  final: boolean;          // true once the recognizer considers the chunk stable
  at: number;              // ms epoch when emitted (for the rolling window)
  confidence?: number;     // 0..1 if the engine provides it
}

export type TranscriptListener = (chunk: TranscriptChunk) => void;

export interface TranscriptSource {
  /** Begin producing chunks. Idempotent. Rejects if the device/credential is unavailable. */
  start(): Promise<void>;
  /** Stop producing chunks and release resources. Idempotent. */
  stop(): Promise<void>;
  /** Subscribe to chunks. Returns an unsubscribe fn. */
  onChunk(listener: TranscriptListener): () => void;
  /** Subscribe to lifecycle/errors so the app can degrade to manual mode (NFR3). */
  onStatus(listener: (s: SourceStatus) => void): () => void;
  readonly kind: 'mock' | 'cloud' | 'native';
}

export type SourceStatus =
  | { state: 'idle' }
  | { state: 'listening' }
  | { state: 'error'; message: string; recoverable: boolean };
```

**Implementer notes.**
- `MockTranscriptSource(script: TranscriptChunk[], opts?)` — replays chunks on a fake or
  real clock; deterministic for tests. No I/O.
- `CloudStreamingSource(opts)` — §6.
- `NativeTranscriptSource(opts)` — §4 client; never importable from `src/core` (ADR-0007).

The matcher must treat chunks as *approximate*. Do not assume verbatim text, word
timings, or low latency (ADR-0001/0004).

---

## 3. `CueTracker` engine API

Pure TypeScript. Deterministic given the same chunks and config. No timers required for
tests — drive it by feeding chunks with explicit `at` timestamps.

```ts
export interface CueTrackerConfig {
  windowMs: number;        // rolling transcript window. default 15000
  advanceMargin: number;   // how much a rival cue must beat current, 0..1. default 0.15
  minDwellMs: number;      // rival must lead at least this long before moving. default 1200
  stickiness: number;      // bonus added to the current cue's score (hysteresis). default 0.1
  lookahead: number;       // cues searched ahead/behind current. default = all
  lowConfidenceMs: number; // hold this long w/ no clear leader -> emit 'unsure'. default 8000
  matchers: {
    keyword: { enabled: true; recencyHalfLifeMs: number }; // default 6000
    embedding?: { enabled: boolean };                       // additive; default off until M3
    llmJudge?: { enabled: boolean };                        // ambiguity fallback; default off
  };
}

export interface PositionState {
  cueId: string;
  index: number;
  confidence: number;      // 0..1
  source: 'voice' | 'manual';
}

export type TrackerEvent =
  | { type: 'position'; state: PositionState }   // current cue changed (or re-affirmed)
  | { type: 'unsure'; sinceMs: number }          // prolonged low confidence
  | { type: 'scores'; perCue: Record<string, number> }; // for debugging/visualization

export class CueTracker {
  constructor(script: CueScript, config?: Partial<CueTrackerConfig>);

  /** Feed transcript. Pure w.r.t. config; may emit a 'position' or 'unsure' event. */
  pushTranscript(chunk: TranscriptChunk): void;

  /** Manual override (FR15): set position and suppress auto-advance for the cool-off. */
  setPosition(index: number, opts?: { coolOffMs?: number }): void; // default coolOff = 4000

  /** Subscribe to tracker events. Returns unsubscribe. */
  on(listener: (e: TrackerEvent) => void): () => void;

  /** Current position snapshot. */
  get position(): PositionState;
}
```

**Scoring contract (must hold; covered by unit tests):**
1. With only the keyword matcher, a cue whose authored keywords appear in the window
   outscores cues whose keywords do not.
2. More recent words contribute more (`recencyHalfLifeMs`).
3. The current cue receives `stickiness`; a move requires `rivalScore - currentScore >
   advanceMargin` continuously for `minDwellMs`.
4. A `manual` `setPosition` immediately wins and blocks `voice` moves for the cool-off.
5. No leader above threshold for `lowConfidenceMs` ⇒ exactly one `unsure` event (not a storm).
6. The tracker never throws on empty/garbled chunks; it holds position.

---

## 4. Native sidecar WebSocket protocol

Transport: WebSocket on `ws://127.0.0.1:<port>` (loopback only). The sidecar is launched
by Electron main, which picks a free port and passes it as `--port`. JSON text frames.
This protocol — not the Swift code — is the contract the cloud agent develops against
(via a fake server in tests).

**Handshake.** On connect the sidecar sends:
```json
{ "type": "hello", "protocol": 1, "engine": "speechanalyzer", "onDevice": true }
```

**Client → sidecar (control):**
```json
{ "type": "configure", "locale": "en-US", "contextualStrings": ["enterprise", "QoQ"] }
{ "type": "start" }
{ "type": "stop" }
```
`contextualStrings` biases recognition toward expected vocabulary (e.g., upcoming cue
keywords). Optional and best-effort.

**Sidecar → client (events):**
```json
{ "type": "partial", "text": "so the headline number", "at": 1718900000000 }
{ "type": "final",   "text": "so the headline number this quarter", "at": 1718900001000, "confidence": 0.92 }
{ "type": "status",  "state": "listening" }
{ "type": "error",   "message": "microphone permission denied", "recoverable": false }
```

`NativeTranscriptSource` maps `partial`/`final` → `TranscriptChunk` (`final` flag carried
through), and `status`/`error` → `SourceStatus`. Unknown message types are ignored
forward-compatibly. If the socket drops, the source emits a recoverable error and the app
falls back to manual mode (NFR3).

---

## 5. Electron IPC (main ↔ renderer)

Exposed via `contextBridge` in `preload.ts` as `window.cuely`. macOS-specific behavior
lives in main; the renderer calls these and never touches Electron directly.

```ts
export interface CuelyBridge {
  // window / invisibility (ADR-0002)
  setContentProtection(on: boolean): Promise<void>;     // BrowserWindow.setContentProtection
  setAlwaysOnTop(on: boolean): Promise<void>;
  listDisplays(): Promise<DisplayInfo[]>;
  moveToDisplay(displayId: number): Promise<void>;       // "move off the shared display"
  setMirror(on: boolean): Promise<void>;                 // CSS transform in renderer; flag persisted

  // cue script
  loadScript(path?: string): Promise<CueScript>;         // open dialog if no path

  // transcript source selection
  selectSource(kind: 'mock' | 'cloud' | 'native', opts?: Record<string, unknown>): Promise<void>;
  onSourceStatus(cb: (s: SourceStatus) => void): () => void;

  // tracker events surfaced to the UI
  onTrackerEvent(cb: (e: TrackerEvent) => void): () => void;

  // global hotkeys (FR14) are registered in main; renderer just listens
  onHotkey(cb: (action: HotkeyAction) => void): () => void;
}

export interface DisplayInfo { id: number; label: string; primary: boolean; bounds: Rect }
export type HotkeyAction =
  | 'next' | 'prev' | 'top' | 'toggle-following' | 'toggle-visible';
```

**Invariant:** the tracker runs in the main process (or a worker) so it survives renderer
reloads; the renderer is a thin view subscribing to `onTrackerEvent`.

---

## 6. Cloud ASR adapters

`CloudStreamingSource` adapts a streaming provider to `TranscriptSource`. Keep
provider-specifics behind a small internal adapter so adding a provider does not touch the
engine.

```ts
export interface CloudSourceOptions {
  provider: 'deepgram' | 'assemblyai';
  apiKeyEnv: string;       // name of env var (e.g. 'DEEPGRAM_API_KEY'); never hardcode keys
  locale?: string;         // default 'en-US'
  interim?: boolean;       // request interim results; default true
}
```

- Audio: 16 kHz mono PCM over the provider's realtime WebSocket.
- Map provider "is_final"/"final" → `TranscriptChunk.final`. Map provider word/segment
  confidence → `confidence` when present.
- Credentials come only from environment variables (Cursor Settings → Background Agents →
  Secrets, injected at runtime). Tests use a local fake WS server, never a real key.
- Reconnect with backoff; on terminal failure emit `{ state:'error', recoverable:false }`.

---

## 7. Versioning

- `CueScript.version` and the sidecar `protocol` integer gate breaking changes.
- This document is versioned with the repo; a contract change is a PR that updates the
  types here, the implementers, and the tests in the same change.
