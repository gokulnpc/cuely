# Cuely — a voice-following cue prompter for macOS

> **The name:** *cue* + a friendly *-ly* — your cues kept close, quietly, only for you.
> **What it is:** a speaker-notes prompter that follows your voice *loosely* and stays
> invisible while you share your screen.
> **What it is not:** a teleprompter. You do not read it word for word. It shows your
> talking points and advances as you move through them.

---

## In one paragraph

Cuely shows your talking points as cards — the current cue prominent, the next one or
two visible ahead. It listens to your microphone, figures out *approximately* which cue
you are on, and advances when you move to the next topic. It is deliberately
under-reactive: when it is unsure, it stays put and keeps listening, because the worst
thing a cue prompter can do is yank you off a point you are still making. It is designed
to stay out of a shared screen, and you can always nudge the position by hotkey — voice
is an assist, never a dependency.

## Documentation map

| Doc | What it covers |
|-----|----------------|
| [docs/PRD.md](docs/PRD.md) | Product requirements: scope, goals, requirements, milestones |
| [docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md) | Why the system is built this way — the load-bearing decisions |
| [docs/API.md](docs/API.md) | Interface contracts: cue model, transcript source, sidecar protocol, engine API |
| [docs/CURSOR_AGENT_PROMPT.md](docs/CURSOR_AGENT_PROMPT.md) | Ready-to-paste kickoff prompts for the Cursor cloud agent |
| [AGENTS.md](AGENTS.md) | Persistent rules the agent reads on every task |
| [.cursor/environment.json](.cursor/environment.json) | Cloud-agent VM setup (the one non-markdown file) |

## Read this before writing a line of code: cloud vs. local

The Cursor cloud agent runs in an isolated **Ubuntu VM**. It clones the repo, works on a
branch, and opens a PR. That means it **cannot build or run macOS-native code** — no
Xcode, no Swift toolchain for app targets, no AppKit, no `NSWindow`, no ScreenCaptureKit,
no microphone device. The architecture is shaped around this hard boundary.

| Layer | Built & tested where | Why |
|-------|----------------------|-----|
| `src/core` — cue-tracking engine (pure TypeScript) | ☁️ **Cloud agent** | No platform deps. Fully unit-testable. This is the agent's main workshop. |
| `src/renderer` — React prompter UI | ☁️ Cloud agent (logic + render) | Renders in a Linux desktop; visual + interaction logic testable. |
| Transcript sources: `MockTranscriptSource`, `CloudStreamingSource` | ☁️ Cloud agent | Mock is deterministic; cloud source is testable against a fixture server. |
| `src/main` — Electron main, window control, `setContentProtection` | ☁️ Code / 🍎 **Verify on Mac** | Code is writable in cloud; behavior (invisibility, displays) only verifiable on macOS. |
| `sidecar/macos` — Swift SpeechAnalyzer sidecar | 🍎 **Mac only** | Requires the Swift/macOS toolchain. Cloud uses the mock instead. |

**Implication for task scoping:** give the cloud agent work that lands in `core`,
`renderer`, and the mock/cloud transcript sources. Treat anything touching AppKit,
ScreenCaptureKit, microphone capture, or the Swift sidecar as *local* work that you
build and verify yourself. See [AGENTS.md](AGENTS.md) for the enforced version of this.

## Repo layout

```
cuely/
├─ AGENTS.md                      # agent steering rules (auto-read by Cursor)
├─ README.md                      # this file
├─ .cursor/
│  └─ environment.json            # cloud-agent VM lifecycle (install/start)
├─ docs/
│  ├─ PRD.md
│  ├─ ARCHITECTURE_DECISIONS.md
│  ├─ API.md
│  └─ CURSOR_AGENT_PROMPT.md
├─ src/
│  ├─ core/                       # PURE TypeScript. No Electron, no platform imports.
│  │  ├─ cue-model.ts             #   cue + script types
│  │  ├─ tracker.ts               #   CueTracker engine (scoring, gate, hysteresis)
│  │  ├─ matchers/                #   keyword + embedding matchers
│  │  └─ transcript-source.ts     #   TranscriptSource interface + types
│  ├─ sources/                    # TranscriptSource implementations
│  │  ├─ mock-source.ts           #   deterministic, for tests + cloud dev
│  │  ├─ cloud-source.ts          #   Deepgram / AssemblyAI streaming adapter
│  │  └─ native-source.ts         #   talks to the macOS sidecar over WebSocket
│  ├─ main/                       # Electron main process (macOS behavior lives here)
│  └─ renderer/                   # React prompter UI
├─ sidecar/
│  └─ macos/                      # Swift SpeechAnalyzer sidecar (built locally)
└─ tests/                         # vitest unit + integration tests
```

## Quick start (local, on the Mac)

> Prerequisites: Node 20+, npm. For the native speech path: macOS 26+ and Xcode.

```bash
npm ci
npm run test          # runs the pure-core test suite (no platform deps)
npm run dev           # launches the Electron app with the MOCK transcript source
npm run dev:native    # launches with the Swift sidecar (macOS only; builds sidecar)
```

The app boots with `MockTranscriptSource` by default so it runs anywhere, including in
the cloud agent's headless mode. Swap to the cloud or native source via config — see
[docs/API.md](docs/API.md).

## Status

Greenfield. Build order follows the milestones in [docs/PRD.md](docs/PRD.md): start with
the portable core and its tests (M1), then the UI (M2), then real transcription (M3),
then macOS window/invisibility work (M4).
