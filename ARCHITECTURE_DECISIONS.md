# Architecture Decision Records — Cuely

Each record is immutable once accepted; supersede rather than edit. Format: Context →
Decision → Consequences → Alternatives.

---

## ADR-0001 — Cue prompter, not a teleprompter

**Status:** Accepted

**Context.** The product gives the speaker *direction*, not a script to read. Words do
not need to match on-screen text. A verbatim teleprompter requires real-time forced
alignment of spoken words to an exact script — brittle, latency-sensitive, and hostile to
paraphrase and ad-libs.

**Decision.** The unit of progress is the **cue** (a talking point), not the word.
Matching is **semantic/approximate**, not string alignment. The engine answers "roughly,
which cue am I on?" and nothing finer.

**Consequences.**
- Matching becomes topic tracking over a rolling transcript window (see ADR-0005).
- Transcription requirements relax sharply (see ADR-0004): chunked, latency-tolerant, and
  a filler-cleaned transcript is acceptable.
- The UI shows discrete cue cards with look-ahead, not a scrolling ribbon of text.

**Alternatives considered.** Word-level forced alignment (rejected: brittle, wrong UX);
fixed time-based auto-scroll (rejected: ignores the speaker entirely).

---

## ADR-0002 — Screen-share invisibility: window/display isolation first, content protection as defense-in-depth

**Status:** Accepted

**Context.** On current macOS, hiding a *visible* window from capture is not reliable.
`NSWindow.sharingType = .none` (Electron's `setContentProtection(true)`) still blocks the
legacy CoreGraphics capture path and browser-based screen sharing (Chrome uses the old
APIs). But on macOS 15.4+, windows marked "sharing none" are still captured by
**ScreenCaptureKit**, which is what recent native clients, QuickTime, OBS, and the OS
recorder use — and Apple has stated there is currently no public API to prevent capture.
So a software "hide the window" flag cannot be the primary guarantee.

**Decision.** The robust mechanism is to **never put the prompter in the captured region**:
1. Run the prompter as its own window and guide the user to **share a single
   window/application** (not the whole screen), or
2. Place the prompter on a **second display / iPad (Sidecar)** and share only the primary.
3. Apply `setContentProtection(true)` as a **defense-in-depth layer** (kills screenshots,
   legacy capture, and browser-based sharing).
The app must **state plainly** what is and isn't protected (FR20).

**Consequences.**
- The app needs multi-display awareness and a "move off the shared display" action.
- Onboarding teaches window-share. We validate against the user's real meeting tool early.
- We never market or assume guaranteed invisibility against ScreenCaptureKit.

**Alternatives considered.** Relying solely on content protection (rejected: fails on
modern capture paths); a virtual display (rejected for v1: heavy, fragile).

---

## ADR-0003 — Stack: Electron + TypeScript + React, with a portable pure-TS core

**Status:** Accepted

**Context.** Development is driven primarily by the Cursor cloud agent, which runs in an
**Ubuntu VM and cannot build macOS-native code**. We need most of the system to be
buildable and testable on Linux, while the unavoidable macOS bits stay isolated.

**Decision.** Build the app in **Electron + TypeScript + React** (Vite, Vitest, ESLint).
Factor the system so the brains live in a **pure-TypeScript `src/core`** package with
**zero platform imports** — fully unit-testable headless. Electron's main process owns the
macOS-specific window behavior; the renderer owns the UI.

**Consequences.**
- The cloud agent can develop and hard-test the core, the matchers, the UI logic, and the
  mock/cloud transcript sources without a Mac.
- An ESLint boundary rule forbids `src/core` from importing Electron or Node platform
  modules, keeping it portable and testable.
- Heavier binary than a native app; acceptable for v1.

**Alternatives considered.** Fully native Swift/SwiftUI (best speech + smallest footprint,
but the cloud agent cannot build or test *any* of it — rejected as the primary stack for
this workflow); Tauri (lighter, but content-protection support is less proven and Rust+
Swift raises the cloud/local split cost).

---

## ADR-0004 — Transcription behind a `TranscriptSource` interface; on-device default, mock + cloud alternatives

**Status:** Accepted

**Context.** We need verbatim-ish, low-friction transcription to feed matching, but ASR is
the least portable, most environment-bound part. Consumer dictation apps (Wispr Flow,
Typeless) are ruled out: no developer API, and they rewrite words. Because matching is
approximate (ADR-0001), we do **not** need word timings or sub-second interim results.

**Decision.** Define a single **`TranscriptSource`** interface that emits transcript
chunks. Provide three implementations:
- **`MockTranscriptSource`** — deterministic, replays scripted chunks; the default for
  tests and cloud-agent dev.
- **`CloudStreamingSource`** — Deepgram / AssemblyAI streaming over WebSocket; opt-in,
  labeled, key via secrets.
- **`NativeTranscriptSource`** — talks to the macOS Swift sidecar (ADR-0006) running
  Apple **SpeechAnalyzer** on-device; the privacy-preferred default on a real Mac.

**Consequences.**
- The whole pipeline is testable with the mock; the rest of the system never knows which
  source is active.
- Source selection is config; failures degrade to manual mode (NFR3).

**Alternatives considered.** Hard-wiring one ASR (rejected: untestable in cloud, no
fallback); Web Speech API in Electron (rejected: unreliable, privacy-opaque).

---

## ADR-0005 — Matching: keyword + embedding hybrid over a rolling window, gated by a stay-biased confidence gate

**Status:** Accepted

**Context.** We must estimate the current cue from messy, paraphrased speech, and the
dominant failure mode to avoid is jumping the speaker off a cue they are still developing.

**Decision.** Maintain a **rolling transcript window** (~15 s). Score each cue with a
**hybrid matcher**: a fast **keyword/alias** matcher (precision, recent words weighted) and
an additive **embedding-similarity** matcher (recall over paraphrase). Feed scores to a
**confidence gate** that:
- adds **stickiness/hysteresis** to the current cue,
- advances or jumps only when another cue beats the current by a **margin** sustained over
  a **minimum dwell**,
- otherwise **holds**, and after prolonged low confidence surfaces an "unsure" affordance.
An optional **LLM-as-judge** fallback resolves ambiguity only when keyword and embedding
disagree.

**Consequences.**
- Defaults are conservative; tuning knobs are explicit config (see API.md `CueTrackerConfig`).
- The keyword path works standalone, so embeddings/LLM are progressive enhancements.
- Deterministic and unit-testable via the mock source (NFR5).

**Alternatives considered.** Pure embeddings (rejected: flickers without keyword anchors);
pure LLM loop (rejected as primary: latency/cost, overkill).

---

## ADR-0006 — macOS Swift sidecar for SpeechAnalyzer, isolated behind a local WebSocket protocol

**Status:** Accepted

**Context.** Apple SpeechAnalyzer is the best on-device option but is Swift-only and
unbuildable in the cloud agent. It must not contaminate the portable core or block
cloud development.

**Decision.** Implement on-device transcription as a **standalone Swift sidecar process**
that captures the mic, runs SpeechAnalyzer, and emits transcript chunks over a **local
WebSocket** using the documented JSON protocol (API.md §5). `NativeTranscriptSource` is a
thin client of that protocol. The sidecar is built **locally on the Mac**; the cloud agent
targets the protocol via the mock and never compiles Swift.

**Consequences.**
- Clean process boundary; the sidecar can be replaced or mocked freely.
- The protocol is the contract under test, not the Swift code.
- Requires shipping/launching a helper process and handling its lifecycle from Electron main.

**Alternatives considered.** A native Node addon (rejected: cross-compilation pain, couples
build to macOS); embedding Whisper in-process (kept as a possible alternative sidecar
implementation, but SpeechAnalyzer is the default on supported macOS).

---

## ADR-0007 — Enforce the cloud/local build boundary in tooling

**Status:** Accepted

**Context.** The cloud/local split (ADR-0003, ADR-0006) only helps if it is enforced, not
just documented; otherwise platform imports leak into the core and break headless tests.

**Decision.**
- ESLint `no-restricted-imports` forbids `electron`, `node:*` platform modules, and any
  `src/main`/`src/sources/native-source` import from inside `src/core`.
- CI/agent runs `npm run typecheck && npm run lint && npm run test` headlessly; these must
  pass with **no audio device and no macOS APIs present**.
- macOS-only tests/targets are tagged and excluded from the headless suite.

**Consequences.** The cloud agent always works against a green, portable target; macOS
regressions are caught locally. Definition of done in [AGENTS.md](../AGENTS.md) encodes this.

**Alternatives considered.** Convention-only (rejected: drifts immediately under agent edits).
