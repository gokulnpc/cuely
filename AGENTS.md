# AGENTS.md — operating rules for AI coding agents

You are working on **Cuely**, a voice-following cue prompter for macOS. Read this before
every task. Authoritative specs: [docs/PRD.md](docs/PRD.md),
[docs/ARCHITECTURE_DECISIONS.md](docs/ARCHITECTURE_DECISIONS.md),
[docs/API.md](docs/API.md). When in doubt, prefer those documents over assumptions, and
ask in the PR description rather than guessing on a load-bearing decision.

## Tech stack

- Electron + TypeScript + React, bundled with Vite.
- Tests: Vitest. Lint: ESLint. Types: `tsc --noEmit`.
- Pure engine in `src/core` (no platform deps). macOS-native speech in `sidecar/macos`
  (Swift, built locally only).

## Commands

```bash
npm ci            # install (used by the cloud environment's install step)
npm run typecheck # tsc --noEmit
npm run lint      # eslint .
npm run test      # vitest run  (headless; no audio device, no macOS APIs)
npm run dev       # Electron app with the MOCK transcript source
```

`test`, `lint`, and `typecheck` MUST pass headlessly in the Ubuntu cloud VM. Do not write
tests that need a microphone, a display server beyond what's provided, network access to a
real ASR provider, or macOS APIs.

## The cloud/local boundary — non-negotiable (ADR-0003, ADR-0007)

This repo is developed mostly by a **cloud agent in an Ubuntu VM that cannot build macOS
code**. Therefore:

- ✅ You MAY freely build and test: `src/core`, `src/renderer`, `src/sources/mock-source.ts`,
  `src/sources/cloud-source.ts`, and everything in `tests/`.
- ⚠️ You MAY write but CANNOT verify: `src/main` (Electron/macOS window behavior). Keep it
  thin; put logic in `src/core` where it can be tested. Flag in the PR that it needs Mac
  verification.
- ⛔ Do NOT attempt to build, run, or "fix the build of" `sidecar/macos` (Swift) or any
  AppKit/ScreenCaptureKit/microphone code. There is no Swift app toolchain here. Develop
  against the **mock** and the **WebSocket protocol** in [docs/API.md §4](docs/API.md)
  instead.

`src/core` MUST NOT import `electron`, `node:*` platform modules, or anything under
`src/main` / `src/sources/native-source.ts`. This is enforced by ESLint
`no-restricted-imports`; if you need platform data in the core, pass it in as plain data.

## Conventions

- Strict TypeScript; no `any` without a written reason. Prefer pure functions in `core`.
- Keep modules small and single-purpose; match the layout in [README.md](README.md).
- Every change to a contract type in [docs/API.md](docs/API.md) updates the doc, all
  implementers, and the tests in the **same** PR.
- New behavior ships with tests. The scoring contract in API.md §3 has a dedicated suite;
  keep it green and extend it when you touch the tracker.
- Conventional Commits for messages.

## Product constraints to respect (don't "improve" these away)

- This is a **cue prompter, not a teleprompter** — never add verbatim/word-level matching
  (ADR-0001).
- The confidence gate is **biased toward staying put**. If you tune it, do not make it
  jumpier than the API.md defaults without a test demonstrating fewer false jumps.
- **Never claim guaranteed invisibility.** Treat `setContentProtection` as defense-in-depth
  only; the primary strategy is window/display isolation (ADR-0002). UI copy must be honest.
- **Privacy:** never persist audio to disk. Cloud transcription is opt-in and labeled.
- A transcription failure degrades to **manual mode** — never crash, never lose position.

## Secrets

- No API keys in source, fixtures, or tests. Read keys from env vars named in
  `CloudSourceOptions.apiKeyEnv`. In the cloud agent, secrets come from Settings →
  Background Agents → Secrets. Tests use a local fake WebSocket server.

## Definition of done (per PR)

1. `npm run typecheck && npm run lint && npm run test` all green headlessly.
2. New/changed behavior covered by tests; scoring-contract suite still passes.
3. API.md updated if any contract changed.
4. PR description lists: what changed, which milestone (PRD §9), and **explicitly** whether
   any part needs **local macOS verification**.
5. No edits to files on the do-not-touch list without saying why.

## Do-not-touch without explicit instruction

- `sidecar/macos/**` build configuration (you can't verify it here).
- `.cursor/environment.json` (changing it can break the agent's own environment).
- Code-signing / notarization config.
- The ESLint import-boundary rule that protects `src/core`.
