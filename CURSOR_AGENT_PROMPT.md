# Cursor cloud-agent prompts — Cuely

How to use this file: the cloud agent runs asynchronously in an Ubuntu VM, works on its
own branch, and opens a PR you review — it does **not** stop to ask mid-task. So scope each
task tightly, point it at the specs, and bake the acceptance criteria into the prompt.
Paste one task at a time. Start with the **bootstrap**, then **M1**, and proceed in order.

> Reminder for every task: the VM cannot build macOS/Swift code. Keep work in
> `src/core`, `src/renderer`, mock/cloud sources, and tests. See [AGENTS.md](../AGENTS.md).

---

## Task 0 — Bootstrap the project

```text
Set up the Cuely repo skeleton described in README.md and AGENTS.md. Create an Electron +
TypeScript + React project using Vite, with Vitest, ESLint, and `tsc --noEmit`. Add npm
scripts: `dev`, `typecheck`, `lint`, `test` exactly as documented in AGENTS.md. Create the
folder layout from README.md (src/core, src/sources, src/main, src/renderer, sidecar/macos
placeholder, tests). Add an ESLint `no-restricted-imports` rule that forbids `src/core`
from importing `electron`, `node:*`, `src/main/**`, and `src/sources/native-source.ts`
(ADR-0007). Do not implement features yet — just a green, empty skeleton where
`npm run typecheck && npm run lint && npm run test` all pass with a single trivial test.
Open a PR summarizing the setup.
```

## Task 1 — M1: the portable cue-tracking core (the heart of the product)

```text
Implement the pure-TypeScript cue-tracking engine per docs/API.md sections 1, 2, and 3,
and ADR-0001 and ADR-0005. Scope:

1. Types: Cue, CueScript, TranscriptChunk, TranscriptSource, CueTrackerConfig,
   PositionState, TrackerEvent — matching API.md exactly.
2. MockTranscriptSource (src/sources/mock-source.ts): deterministic replay of a
   TranscriptChunk[] on an injectable clock. No I/O.
3. Keyword matcher (src/core/matchers/keyword.ts): scores cues from the rolling window with
   recency weighting (recencyHalfLifeMs). Authored keywords win; otherwise derive simple
   keywords from cue text.
4. CueTracker (src/core/tracker.ts): rolling window (windowMs), keyword scoring, the
   confidence gate with stickiness + advanceMargin + minDwellMs, manual setPosition with
   cool-off, and the 'unsure' event after lowConfidenceMs.

Acceptance — add a Vitest suite that proves the full scoring contract in API.md §3 (all six
points), driving the tracker with explicit `at` timestamps (no real timers). Include a
realistic multi-cue fixture with paraphrase, one skip-ahead, and one stretch of off-topic
ad-lib that must NOT cause a jump. Keep the embedding and llmJudge matchers as
config-gated stubs (disabled by default). `typecheck && lint && test` green headless.
Update API.md only if you must deviate, and explain why in the PR.
```

## Task 2 — M2: prompter UI driven by the mock source

```text
Build the React prompter UI (src/renderer) and a thin Electron shell (src/main) per PRD
FR4–FR7 and FR14–FR15. Show the current cue prominently with the next 1–2 cues dimmed
ahead; controls for font size, line spacing, width, theme, and mirror/flip (CSS transform).
Register global hotkeys in main (next, prev, top, toggle-following, toggle-visible) and
surface them to the renderer via the CuelyBridge in docs/API.md §5. Wire the UI to a
CueTracker fed by MockTranscriptSource so auto-advance is visible end to end, and wire
manual hotkeys through setPosition (with cool-off). Keep src/main thin and flag it for Mac
verification. Add component/logic tests for the UI state machine (current/next rendering,
manual override suppressing auto-advance). Note in the PR that window invisibility and
real audio are NOT exercised here.
```

## Task 3 — M3: cloud streaming transcription + embedding matcher

```text
Implement CloudStreamingSource (src/sources/cloud-source.ts) per docs/API.md §6 for
Deepgram, behind the TranscriptSource interface. Read the key from the env var named in
CloudSourceOptions.apiKeyEnv; never hardcode. Provide a local fake WebSocket server in
tests that emits scripted partial/final frames, and test the adapter against it (no real
network, no real key). Then add the embedding-similarity matcher
(src/core/matchers/embedding.ts) as an additive component of the hybrid (ADR-0005),
gated by config and OFF by default; inject the embedding function as a dependency so tests
can supply a deterministic fake. Extend the scoring suite to show embeddings improve recall
on a paraphrase fixture without increasing false jumps. Green headless.
```

## Tasks for M4/M5 (local, on the Mac — not for the cloud agent)

These touch Swift, AppKit, ScreenCaptureKit, microphone capture, packaging. Do them in a
local Cursor/Claude Code session on the Mac. The cloud agent can still help by writing the
`NativeTranscriptSource` *client* against the WebSocket protocol (docs/API.md §4) and a
fake sidecar server — but it must not try to build `sidecar/macos`.

```text
(Local) Implement the Swift SpeechAnalyzer sidecar in sidecar/macos per ADR-0006 and the
WebSocket protocol in docs/API.md §4: mic capture, on-device transcription, partial/final
frames, contextualStrings biasing, status/error. Then implement window invisibility in
src/main per ADR-0002 (setContentProtection, always-on-top, listDisplays/moveToDisplay)
and verify against a real screen share in both a browser-based client and a native client.
```

---

## Scoping checklist (apply to any new task you write)

- Is it confined to cloud-buildable surfaces? If it needs Swift/AppKit/mic/screen-capture,
  mark it **local**.
- Does it name the exact files, the relevant API.md sections, and the acceptance tests?
- Does it state the definition of done (typecheck + lint + test green; API.md updated;
  Mac-verification flag)?
- Is it small enough to land as one reviewable PR? If not, split it.
