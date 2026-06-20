# PRD — Cuely (voice-following cue prompter for macOS)

**Status:** Draft v1 · **Owner:** you · **Last updated:** 2026-06-20

---

## 1. Problem

When presenting on a call or recording a video, people want their talking points in
front of them without (a) reading robotically off a script, or (b) exposing the notes to
everyone on a shared screen. Existing teleprompters demand verbatim reading and tightly
couple the on-screen text to your exact words. Existing dictation apps (Wispr Flow,
Typeless, etc.) are closed products with no API and deliberately rewrite your words, so
they cannot drive a prompter.

Cuely fills the gap: a prompter that takes loose talking points, follows your voice
*approximately*, gives you direction without demanding word-for-word delivery, and stays
off the shared screen.

## 2. Goals

- **G1.** Show talking points and advance through them as the speaker moves between
  topics, tolerant of paraphrase, ad-libs, skips, and reordering.
- **G2.** Stay invisible to the audience during screen sharing and screen recording, to
  the maximum extent the platform allows.
- **G3.** Keep the speaker in control: manual override is always one keypress away;
  auto-advance never traps the speaker on the wrong cue.
- **G4.** Privacy-first: prefer on-device transcription; never persist audio by default.
- **G5.** Be buildable predominantly by the Cursor cloud agent (Ubuntu), with macOS-only
  work clearly isolated.

## 3. Non-goals

- **N1.** Verbatim teleprompting / word-level karaoke highlighting. (Explicitly rejected;
  see ADR-0001.)
- **N2.** Editing or "polishing" the speaker's words. Cuely reads the transcript to
  locate position; it never rewrites or displays the transcript as output.
- **N3.** Cross-platform parity at v1. Windows/Linux are out of scope; the core engine
  stays portable, but the shipped app targets macOS.
- **N4.** A guarantee of invisibility against every capture method. This is impossible on
  current macOS (see ADR-0002); we maximize it and document the limits.
- **N5.** Cloud accounts, multi-user, or team features.

## 4. Target user & primary use cases

A solo presenter or creator on a MacBook.

- **UC1 — Live meeting.** Sharing slides or an app in Zoom/Meet/Teams, wants private
  talking points visible to themselves only.
- **UC2 — Recording.** Recording a screen capture or talking-head video, wants notes that
  do not appear in the recording.
- **UC3 — Rehearsal.** Practicing a talk, wants the prompter to follow along and surface
  the next point at the right moment.

## 5. Functional requirements

### 5.1 Content model
- **FR1.** The user authors a **cue script**: an ordered list of **cues** (talking
  points). Each cue has display text and optional keywords/aliases. See `CueScript` in
  [API.md](API.md).
- **FR2.** The app loads a cue script from a local file (JSON/Markdown front-matter) and
  renders it.
- **FR3.** Keywords may be authored by hand or auto-extracted from the cue text.

### 5.2 Display
- **FR4.** Show the **current cue** prominently, with the **next one or two cues** dimmed
  beneath/ahead so the speaker always sees where they are going.
- **FR5.** Adjustable font size, line spacing, width, and color theme.
- **FR6.** Optional horizontal **mirror/flip** for use with physical teleprompter glass.
- **FR7.** A subtle progress indicator (cue *m* of *n*). No countdowns or pressure cues.

### 5.3 Voice following
- **FR8.** Capture microphone audio and obtain a rolling transcript (chunked is fine; see
  NFR latency).
- **FR9.** Maintain a **rolling transcript window** (default ~15 s) as the matching input.
- **FR10.** Estimate the current cue by scoring the window against cues using a hybrid
  **keyword + embedding** matcher (see ADR-0005, API.md `CueTracker`).
- **FR11.** Advance/jump **only past a confidence margin sustained over a minimum dwell**;
  otherwise hold position. Bias is toward *not moving*.
- **FR12.** Support **non-monotonic** moves (the speaker may jump ahead or back), gated by
  the same confidence rules, with hysteresis to prevent flicker.
- **FR13.** When confidence is low for an extended period, surface a faint "unsure"
  affordance rather than guessing.

### 5.4 Control & override
- **FR14.** Global hotkeys: next cue, previous cue, jump-to-top, pause/resume voice
  following, toggle window visibility.
- **FR15.** Manual moves take immediate priority and temporarily suppress auto-advance for
  a short cool-off so the engine does not fight the user.
- **FR16.** Optional support for a Bluetooth/USB foot pedal or media-key mapping (post-v1).

### 5.5 Invisibility (the headline requirement)
- **FR17.** The prompter runs as its **own window**, separate from any window the user
  shares, so the primary, robust strategy is *share-a-window / use-a-second-display*
  (see ADR-0002). The app guides the user toward this.
- **FR18.** Enable macOS content protection (`setContentProtection(true)`) as a
  defense-in-depth layer that hides the window from screenshots, legacy capture, and
  browser-based screen sharing.
- **FR19.** Provide a one-click "place on second display" / "move off shared display"
  action when multiple displays are present.
- **FR20.** Clearly communicate in-app what *is* and *is not* protected, so the user is
  never surprised. (Native clients using ScreenCaptureKit on macOS 15.4+ can capture the
  window; the app must say so honestly.)

## 6. Non-functional requirements

- **NFR1 — Latency.** A cue advance should land within ~1–2 s of the speaker clearly
  entering a new topic. Sub-second word-level latency is *not* required (this is a cue
  prompter, not a teleprompter).
- **NFR2 — Privacy.** Default transcription path is on-device. Audio is never written to
  disk. Cloud transcription, if selected, is opt-in and clearly labeled.
- **NFR3 — Reliability.** A transcription failure must degrade gracefully to manual mode,
  never crash the prompter or lose the user's place.
- **NFR4 — Footprint.** Idle CPU should be modest; the app must not interfere with the
  meeting/recording tool's own audio or capture.
- **NFR5 — Testability.** The matching engine must be deterministic and unit-testable in
  a headless Linux CI/agent environment with no audio device.

## 7. UX principles

- **Under-react.** Staying on the right cue beats chasing every sentence. Tune defaults
  conservative.
- **Always show the road ahead.** The next cue must be visible even when auto-advance lags.
- **The user is the pilot.** Voice assists; the hotkeys are the controls. Never lock the
  user out of moving.
- **Honest about privacy and invisibility.** No dark patterns, no overclaiming protection.

## 8. Success metrics

- **M-Accuracy.** In rehearsal with a real talk, the prompter is on the correct cue ≥90%
  of speaking time, measured against a hand-labeled timeline.
- **M-Intrusion.** False jumps (advancing while the speaker is still on a cue) < 1 per 5
  minutes at default settings.
- **M-Recovery.** After a manual override, the engine re-syncs without fighting the user
  within one cool-off window.
- **M-Invisible.** Verified hidden in: screenshots, browser-based screen share, and at
  least one native meeting client's window-share mode. Limits documented for the rest.

## 9. Milestones (build order)

| # | Milestone | Surface | Where built |
|---|-----------|---------|-------------|
| **M1** | Portable core: cue model, rolling window, keyword matcher, confidence gate + hysteresis, full unit tests, `MockTranscriptSource` | `src/core`, `src/sources/mock-source.ts`, `tests/` | ☁️ Cloud agent |
| **M2** | Prompter UI: render cues, current+next, font/mirror controls, hotkeys, manual override wired to the engine, driven by the mock source | `src/renderer`, `src/main` (shell) | ☁️ Cloud agent |
| **M3** | Real transcription: `CloudStreamingSource` (Deepgram/AssemblyAI) behind the interface; embedding matcher added to the hybrid; tuning | `src/sources/cloud-source.ts`, `src/core/matchers` | ☁️ Cloud agent (mock server fixtures) |
| **M4** | macOS native: Swift SpeechAnalyzer sidecar + `NativeTranscriptSource`; window control, `setContentProtection`, multi-display placement | `sidecar/macos`, `src/main`, `src/sources/native-source.ts` | 🍎 Local on Mac |
| **M5** | Polish & package: permissions flow, settings persistence, code-sign + notarize | app-wide | 🍎 Local on Mac |

Each milestone should be decomposed into small, independently testable tasks for the
cloud agent. See [CURSOR_AGENT_PROMPT.md](CURSOR_AGENT_PROMPT.md).

## 10. Risks & open questions

- **R1 (highest).** Invisibility depends on the *audience's* capture path, which we do not
  control. Mitigation: lead with window-share/second-display; validate against the user's
  actual tools early in M2, before investing in M4.
- **R2.** Embedding matching latency/quality on-device. Mitigation: keyword matcher is the
  fast path and works alone; embeddings are additive (ADR-0005).
- **R3.** SpeechAnalyzer requires a recent macOS. Mitigation: cloud + mock sources keep the
  app fully functional without it; native is an enhancement, not a dependency.
- **Q1.** Cue authoring format: JSON only, or Markdown with front-matter for human editing?
  (Leaning Markdown-authored, compiled to the JSON `CueScript`.)
- **Q2.** Should the embedding model be bundled (Apple NaturalLanguage / a small
  sentence-transformer) or optional? Decide during M3.
