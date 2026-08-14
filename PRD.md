# OCS — Organised Church Service

## Product Requirements Document (PRD)

**Author:** Are Oluwasegun Johnson
**Version:** 1.7
**Last Updated:** August 2026
**Status:** Active Development

---

## Changelog from v1.6 → v1.7 (Gap Analysis Pass)

This revision closes structural loopholes found on a full read-through of v1.6. Nothing in the Timer Controller (4.5) or Session Folders (4.5.1) was touched — confirmed intact.

**Contradictions resolved:**

- **FR-3.1–FR-3.34, FR-3.29–3.31 renamed from "Vosk Engine" to "Primary ASR Engine."** v1.6's own architecture note (Section 3.1) switched the _default_ engine to whisper.cpp with Vosk-small as fallback, but every Core Voice FR still described Vosk-specific behavior (continuous word-by-word partials, `vosk_recognizer_new_grm` grammar, FFI binding) as if it were the primary path. This was a real spec/implementation mismatch — whisper.cpp does not natively emit continuous word-level partials the way Vosk does; it re-transcribes VAD-bounded chunks. New **FR-3.65–3.68** define how partial-result semantics (probe firing, shape-complete early fire, live transcript cyan pulse) are approximated on a chunk-based engine, and which FRs apply only when the Vosk fallback is active.
- **Trailing document footer** still read "OCS PRD v1.4" at the bottom of a v1.6 document — fixed.

**Security loophole closed:**

- **FR-6.10 / NFR-26 pairing token was a single global token, fresh per app launch** — but FR-7.4 promises "revoke mobile pairings" _per device_, which a single shared token cannot support (revoking it kicks everyone). New **FR-6.11–6.13** introduce per-device session tokens issued at pairing time from the launch-scoped master token, a rate limit / lockout on the 6-digit fallback code (1,000,000 combinations is brute-forceable unthrottled on a LAN), and explicit transport-security language for the Socket.IO channel.

**Feature gap closed — voice control of Presentation Controller:**

- Section 4.4 (Presentation Controller) had **zero voice commands** — only keyboard, mouse, and mobile-app control. This directly contradicts the product's own positioning ("Requires zero manual clicks during a live message via AI voice commands") and is the exact "next slide" scenario the product should support. New **FR-4.8–4.12** add voice-driven slide/media navigation through the same command-router pattern used for Bible/timer commands.

**Feature gap closed — general teleprompter:**

- FR-3.62 only covers **scripture** read-along. There was no way to load an arbitrary script (sermon notes, announcements) for teleprompter-style auto-scroll — a capability explicitly wanted for this product. New **Section 5.5 (Script & Teleprompter Module)** generalizes the alignment engine behind FR-3.62 into a reusable primitive with its own reference-text source, shared by scripture read-along and free-text teleprompter.
- FR-3.62's monotonic "cursor MUST NOT jump backward" rule had no recovery path for a preacher legitimately re-reading a verse or backtracking in a script. **FR-5.34** adds a bounded backward-resync after a silence/mismatch window, instead of a hard one-way cursor.

**Structural ambiguity closed:**

- FR-3.58's shape gate ("book-like token followed by a number") doesn't disambiguate compound book names with leading ordinals — "First Corinthians thirteen" risks the shape-matcher treating "First" as the chapter number. **FR-3.69** adds an ordinal-prefix exception to the shape state machine.

**Scope gap closed — secondary input:**

- FR-3.36 restricted the phone's push-to-talk input to "worship leader's own voice commands" without saying which command _domains_ that covers. Given the new presentation/teleprompter commands, this was ambiguous. **FR-3.40** explicitly extends secondary input to presentation and teleprompter commands, not just scripture/timer.

**Platform/legal gaps flagged (added to Risk table, Section 8):**

- No FR covered macOS's mandatory `NSMicrophoneUsageDescription` entitlement and the OS-level implications of a continuously-listening background process — added as **NFR-37**.
- Auto-update (NFR-28) says updates won't install "during a live session" but never defined what "live" means programmatically. Now explicitly tied to the FR-5.9 timer lifecycle bus (**NFR-28 updated**).
- Session Archive (4.5.1) captures room audio, which may include congregation members who never consented, not just the preacher — this is a real-world legal exposure that varies by jurisdiction and wasn't called out. Added to Risk table.

Everything else from v1.6 (Session Folders, Timer Controller, Bible Controller, Mobile Companion core, Settings) is carried forward unchanged.

---

**Changelog from v1.5 → v1.6:**

- Session Folders (FR-5.9–5.28): timer-synced local archive (Opus/WebM + transcript PDF) with Sessions sidebar UI.
- Timer lifecycle bus; REC indicators; local-only consent notice (FR-5.17); session disk NFRs (NFR-33–36).
- Ambient scripture detection: ordered structural shape gate on partials; OCS/Media optional for shaped refs (FR-3.13/3.32/3.57–3.60).

**Changelog from v1.4 → v1.5:**

- Strict scripture gating (FR-3.57–3.60): Pass 3 never on ungated continuous sermon speech.
- Pass B grammar-constrained recognizer (FR-3.52–3.55) armed after OCS/Media trigger **or** a bookish hint (book + number/verse cue) so ambient refs survive free-vocab ASR garble.
- Always-on `PIPE` utterance trace (ASR→GATE→RESOLVE→CONF→SETTLE→IPC→RENDER) in Controller debug bar / console.
- Amended FR-3.14: scripture lookup requires trigger or Pass B in Strict mode (default).
- Utterance reconciliation (FR-3.8a–d, FR-3.17a, FR-3.26a): probe vs final race settles without double-display or blocking legitimate corrections.

**Changelog from v1.3 → v1.4:**

- Corrected all remaining "Whisper" references — the ASR engine is Vosk throughout; Whisper/WASM is now scoped strictly as a documented fallback path, not the primary description. _(Superseded by v1.6's architecture note and this revision's FR-3.65–3.68 — see above.)_
- Specified and landed the target AI architecture as a native Node.js Vosk binding via `vosk-koffi` (no bundled Python/venv for ASR) — Phase 0.
- Added dual mic-role architecture: primary wired/board input vs. secondary phone push-to-talk input (see 4.3.11).
- Added mobile pairing-token authentication to V1 (previously deferred to V2).
- Added ASR accent-robustness risk and mitigation.
- Renumbered duplicate FR-3.25; merged glossary tables.
- Re-baselined disk/RAM NFRs for the post-Python-sidecar target footprint.
- Fixed cross-references: architecture note → NFR-17 (Windows); FR-1.6 throttle target → NFR-23 (idle RAM).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Target Users & Personas](#2-target-users--personas)
3. [Platform & Technical Stack](#3-platform--technical-stack)
4. [Core Features](#4-core-features)
5. [New Feature Modules](#5-new-feature-modules)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Success Metrics](#7-success-metrics)
8. [Risks & Mitigations](#8-risks--mitigations)
9. [Roadmap](#9-roadmap)
10. [Out of Scope — V1](#10-out-of-scope--v1)
11. [Glossary](#11-glossary)

---

## 1. Product Overview

### 1.1 Vision

> OCS exists to eliminate every technical distraction between a congregation and their worship experience. When technology works invisibly, the Spirit moves freely.

### 1.2 Positioning

|            |                                                                                       |
| ---------- | ------------------------------------------------------------------------------------- |
| **For**    | Church media operators and worship leaders                                            |
| **Who**    | Struggle with fragmented, click-heavy AV tools during live service                    |
| **OCS is** | A unified, voice-first church service management platform                             |
| **That**   | Controls scripture, media, presentation, and timers from a single offline desktop app |
| **Unlike** | ProPresenter, EasyWorship, and MediaShout                                             |
| **OCS**    | Requires zero manual clicks during a live message via AI voice commands               |

### 1.3 Problem Statement

Most church AV setups are deeply fragmented: one tool for Bible projection, another for timers, another for slides — and nothing purpose-built for voice-driven, hands-free operation during a live service. Operators must manually click through verses and slides while simultaneously trying to follow a preacher who may jump to an unplanned scripture, or ask for the next slide, at any moment. This causes delays, missed verses, blank screens in front of congregations, and extreme cognitive load on volunteers who are often untrained.

### 1.4 Solution

OCS unifies all service display functions into a single Electron desktop application with:

- A **Controller Window** (operator's screen) for full, real-time control of all displays
- A **Speaker View** (stage monitor / secondary display) for the preacher — showing current verse, script/teleprompter text, upcoming content, and timer
- A **General View** (projector / audience display) showing scripture and media to the congregation
- A **Mobile Companion App** (React Native / Expo) for remote control by worship leaders from the stage
- An **AI-powered voice engine**, offline by default (whisper.cpp primary / Vosk fallback — see 3.1), running natively inside Node.js — fully offline, no cloud, no internet required, no bundled Python runtime
- A unified **voice command router** covering scripture, presentation/media, timers, and teleprompter/read-along — not scripture alone
- An **Order of Service planner** for pre-service setup and in-service flow management

---

## 2. Target Users & Personas

_(unchanged from v1.6 — see Section 2.1–2.4: The Overwhelmed Media Operator, The Worship Leader, The Senior Pastor, The Church Tech Lead)_

---

## 3. Platform & Technical Stack

### 3.1 Desktop Application (OCS Controller)

| Layer                   | Technology                                                                                                                                                           | Rationale                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Runtime                 | Electron 30                                                                                                                                                          | Cross-platform, Chromium renderer, Node.js access                                             |
| Frontend                | React 18 + Redux Toolkit                                                                                                                                             | Component model, predictable state                                                            |
| Styling                 | Tailwind CSS 3                                                                                                                                                       | Utility-first, fast iteration                                                                 |
| Bundler                 | Webpack 5 (dual-bundle)                                                                                                                                              | Controller + View windows bundled separately                                                  |
| Database                | SQLite3 (better-sqlite3)                                                                                                                                             | Local Bible DB, instant queries, no network                                                   |
| **Primary ASR Engine**  | **whisper.cpp** (distil-small.en ggml via `@kutalia/whisper-node-addon`), VAD-chunked, `initial_prompt` domain biasing, run in-process (main process or Node worker) | Fully offline, higher accuracy on accented speech than small Vosk models (see Risk table)     |
| **Fallback ASR Engine** | **Vosk-small** (`vosk-koffi`, native FFI, no Python/venv) — auto-selected on low-spec hardware or if the whisper.cpp addon fails to load                             | Lower resource footprint, true continuous word-level partials                                 |
| Noise Filter            | High-pass filter (100Hz) + 2× software pre-amp gain                                                                                                                  | Removes HVAC/room rumble before ASR processes audio                                           |
| Audio                   | Web Audio API + ScriptProcessorNode (16kHz PCM)                                                                                                                      | Raw PCM streamed in-process to the active ASR engine                                          |
| Communication           | Electron IPC                                                                                                                                                         | Main ↔ renderer, zero-latency                                                                 |
| Remote Server           | Express.js + Socket.IO (LAN, per-device token-paired — see FR-6.10–6.13)                                                                                             | Mobile companion communication                                                                |
| PPTX Support            | `pptx-glimpse`                                                                                                                                                       | Slide-to-PNG conversion for presentation                                                      |
| Auto Update             | electron-updater                                                                                                                                                     | Background download, operator-approved install, gated off the live-session state (see NFR-28) |
| Error Tracking          | Sentry (local-only mode)                                                                                                                                             | Crash reports without sending audio/content data                                              |

> **Architecture note (v1.7):** Section 4.3 below is written engine-agnostically wherever possible via the shared **ASR Adapter** contract (FR-3.65). FRs describing behavior that only one engine can produce (e.g. true continuous word-level partials) are explicitly marked **[Vosk-fallback only]**. Any FR not marked applies to whichever engine is active.

> **Architecture note (v1.6, carried forward):** Default offline ASR is **whisper.cpp** with VAD utterance chunking and `initial_prompt` domain biasing. **Vosk-small** remains the automatic low-spec / missing-model fallback. Phase 0's native-in-process (no Python) constraint is preserved.

> **Architecture note (v1.4, carried forward):** v1.3 used a Python WebSocket sidecar, replaced in Phase 0 by native in-process bindings for both engines — removes an entire bundled runtime from packaging (relevant to NFR-17, Windows in V2) and removes process-spawn/socket-bind latency from the critical path (NFR-5).

### 3.2 Mobile Companion App (OCS Mobile)

_(unchanged from v1.6 — React Native/Expo, TypeScript, NativeWind, Redux Toolkit, Socket.IO Client with per-device token — see FR-6.11, `expo-av` push-to-talk, `expo-haptics`)_

---

## 4. Core Features

### 4.1 Multi-Window Display System

_(unchanged from v1.6 — FR-1.1 through FR-1.6)_

---

### 4.2 Bible Controller

_(unchanged from v1.6 — FR-2.1 through FR-2.8)_

---

### 4.3 Voice Command Engine

The voice system is the flagship differentiator of OCS. It must be fast, accurate, and fully offline, and it must be able to drive **every** controllable surface in the app — scripture, presentation, timer, and teleprompter — through one unified router, not a scripture-only pipeline.

#### 4.3.1 Architecture

**FR-3.1** — Continuous background voice activation — no push-to-talk required during service, for the primary (desktop-connected) mic input.

**FR-3.2** — Audio capture via Web Audio API at 16kHz with hardware echo cancellation, noise suppression, auto-gain control, 2× software pre-amp gain boost, 100Hz high-pass filter.

**FR-3.3** — Audio captured via `ScriptProcessorNode` at 16kHz mono. Raw PCM samples are converted to `Int16Array` and passed in-process to the **active ASR engine's adapter** (FR-3.65) on every audio chunk (no socket hop for the primary input path).

**FR-3.4** — Transcription via the active ASR engine. Both engines return final results; **only the Vosk fallback returns true continuous word-level interim/partial results** (see FR-3.65–3.68 for the whisper.cpp approximation).

**FR-3.5** — The active ASR engine is loaded once at app launch via its native in-process binding (whisper.cpp addon or Vosk FFI), inside the Electron main process or a dedicated Node worker thread. No external process spawn, no venv resolution, no socket bind required for the primary pipeline.

#### 4.3.2 Trigger Words

**FR-3.6** — Two primary trigger keywords, both configurable in Settings: **"OCS"** (default) and **"Media"** (legacy). Broad phonetic mishearing alias lists apply per engine (Vosk and whisper.cpp mishear differently — see FR-3.66). Additional configurable trigger words per church preference (e.g. "Display", "Screen", "Activate").

#### 4.3.3 Speech Capture Pipeline

**FR-3.7** — A 500ms pre-roll buffer (5 audio chunks) shall be prepended to every captured utterance to prevent clipped word starts.

**FR-3.8 — Mid-speech keyword probe [Vosk-fallback only as originally specified; see FR-3.67 for whisper.cpp behavior]:** After 1.5s of continuous speech, run a lightweight `probe` pass against the buffered audio. If the trigger word is detected while the user is still speaking, full transcription fires immediately without waiting for silence.

**FR-3.8a — Utterance identity:** Each contiguous speech window is assigned a monotonic `utteranceId`. Every transcript event carries `utteranceId` and `role`: `partial` | `probe` | `final`.

**FR-3.8b — Probe/final reconciliation:** Scripture presentation is reconciled per `utteranceId` as in v1.6 (`PENDING` → `PROBE_FIRED` → `SETTLED_CONFIRMED` / `SETTLED_CORRECTED` / `SETTLED_DIRECT`). This reconciliation state machine now also governs presentation and teleprompter commands issued during the same utterance window (see FR-4.9).

**FR-3.8c — Probe promote timeout:** If a probe fires and no settling `final` arrives within 2.5s, promote to `SETTLED_DIRECT`.

**FR-3.8d — Commands vs probe:** Closed-phrase commands (next verse, next slide, screen, timer, highlight) execute on `final` / Pass B only — not on `probe` — to avoid double-fire. Scripture may use `probe` for low latency.

**FR-3.9 — Short utterance fast-fire:** ≤5 words → fires after 200ms of silence.

**FR-3.10 — Standard silence threshold:** Longer utterances fire after 900ms of silence.

**FR-3.11** — Emergency force-trigger fires after 15 seconds of unbroken speech.

**FR-3.12** — A 5-second watchdog timer cancels and resets any hanging transcription job.

#### 4.3.4 Confidence Gating

**FR-3.13 — Confidence gating (two-tier):** Tier A (structural ambient match, COMPLETE shape) accept ≥0.48; Tier B (unstructured) requires trigger/Pass B and ≥0.65. Debug bar logs low-confidence discards. Note: confidence calibration differs meaningfully between whisper.cpp and Vosk; the per-deployment calibration step (FR-12.1 Step 3) must re-run its threshold sweep whenever the active engine changes (see FR-3.68).

#### 4.3.5 Command Recognition

**FR-3.14** — Supported voice commands (Scripture, Book+chapter, Keyword quote, Verse/chapter jump, Next/Previous verse, Highlight, Black/Screen, Timer) — table unchanged from v1.6. **See FR-4.8–4.12 for the newly added Presentation/Media command set, and FR-5.30–5.34 for Teleprompter commands**, both of which plug into this same router.

**FR-3.15 — FR-3.17a** — Book alias fuzzy matching, word-number conversion, dedup guard, same-utterance exception — unchanged from v1.6.

#### 4.3.6 Command Feedback

**FR-3.18 — FR-3.19** — Success/unrecognised/duplicate/low-confidence audio+visual feedback, "Did you mean?" suggestions — unchanged from v1.6.

#### 4.3.7 Trigger Sensitivity

**FR-3.20** — Strict / Balanced / Loose sensitivity slider — unchanged from v1.6.

#### 4.3.8 Word Highlighting

**FR-3.21 — FR-3.25** — Unchanged from v1.6.

#### 4.3.9 Diagnostics & Recovery

**FR-3.26** — Debug bar — unchanged from v1.6, with one addition: it now also shows **Active ASR engine: `whisper.cpp` / `vosk-fallback`** so operators can tell which behavior profile (FR-3.65) is live.

**FR-3.26a — FR-3.28** — Unchanged from v1.6.

#### 4.3.10 ASR Engine Details

**FR-3.29 (revised) — Native In-Process ASR Binding:** The active engine loads via its native in-process binding — no Python interpreter, no venv, no separate WebSocket server for the primary input path. Audio is passed as raw `Int16Array` PCM at 16kHz directly to the active recognizer instance.

**FR-3.30 (revised) — Result Semantics by Engine:**

- **Vosk-fallback:** returns true **partial** (interim, word-by-word) and **final** results natively.
- **whisper.cpp (primary):** returns **final** results per VAD-bounded utterance chunk. Interim UI feedback is synthesized per FR-3.67 (re-inference on a growing buffer at a bounded interval), not a native partial stream.

**FR-3.31** — Self-contained `BroadcastEngine.js` command pipeline (`navigateRelative`, `executeCommand`, `pushHighlight`, `pushRangeHighlight`, `clearHighlights`) — unchanged, and now also hosts `presentationCommand()` and `teleprompterCommand()` handlers (FR-4.9, FR-5.31) behind the same dispatch table.

**FR-3.32** — Smart Bible Reference Resolution (4-pass, ambient-gated) — unchanged from v1.6, subject to the ordinal-prefix fix in FR-3.69.

**FR-3.33 — FR-3.34** — Extended book aliases, Live Transcript column — unchanged from v1.6.

**FR-3.52 — FR-3.55 [Vosk-fallback only]** — Dual-pass recognition (Pass A free / Pass B grammar-constrained) is a Vosk-specific optimization for garbled free-vocabulary output. When whisper.cpp is the active engine, its higher baseline accuracy and `initial_prompt` domain biasing serve the equivalent role; Pass B grammar recognizer is not instantiated. Debug bar reflects which strategy is active.

**FR-3.57 — FR-3.60** — Reference intent gating, structural pre-check, per-pass gates, sensitivity modes — unchanged from v1.6, engine-agnostic (they operate on the resolved token stream regardless of which engine produced it).

**FR-3.61** — Live Transcript dictionary correction (Tier 1, SymSpell-style) — unchanged from v1.6.

**FR-3.62** — Scripture read-along word-pop — unchanged from v1.6, **now implemented as one caller of the generalized alignment engine defined in Section 5.5**, and subject to the backward-resync fix in FR-5.34.

**FR-3.63** — Voice verse ranges as one passage — unchanged from v1.6.

**FR-3.64** — Language-gated transcription (interpreter filter) — unchanged from v1.6; already specified against whisper.cpp's `detect_language`, consistent with this revision's primary-engine designation.

**FR-3.65 (New) — ASR Adapter Contract:** All ASR-consuming code (probe logic, shape gate, command router, debug bar) shall talk to a single `AsrAdapter` interface exposing `onPartial`, `onFinal`, `engineName`, and `confidence`, regardless of which engine is active. Engine-specific code lives only inside the two adapter implementations (`WhisperAdapter`, `VoskAdapter`). This is what makes the rest of Section 4.3 engine-agnostic and prevents the v1.6-style spec drift this revision fixes.

**FR-3.66 (New) — Per-Engine Mishearing Alias Sets:** Trigger-word and book-name phonetic alias lists (FR-3.6, FR-3.33) shall be maintained as **two separate sets**, one tuned against whisper.cpp's error patterns and one against Vosk's, selected automatically based on `AsrAdapter.engineName`. A shared alias list tuned for one engine measurably under-performs on the other.

**FR-3.67 (New) — Synthesized Partials for whisper.cpp:** While whisper.cpp is active, the adapter shall re-run inference on the current growing utterance buffer at a bounded interval (target: every 400–600ms, tunable) to synthesize a `partial`-equivalent event for UI feedback (live transcript pulse) and for the FR-3.58 shape gate's early-fire check. This is strictly a UI/early-fire optimization — command execution still waits for a VAD-bounded `final`, per FR-3.8d.

**FR-3.68 (New) — Confidence Threshold Re-Calibration on Engine Switch:** Any event that changes the active engine (manual override, automatic fallback due to load failure, or low-spec auto-selection at first run) shall reset the FR-3.13 confidence thresholds to that engine's documented defaults and flag the debug bar until the operator re-runs the FR-12.1 Step 3 calibration. Carrying whisper.cpp-calibrated thresholds into a Vosk fallback session (or vice versa) produces silently wrong accept/reject behavior.

**FR-3.69 (New) — Ordinal Book-Prefix Exception in Shape Gate:** `matchReferenceShape` (FR-3.58) shall recognize leading ordinal tokens ("first", "second", "third", "1st", "2nd", "3rd", spoken or digit form) immediately preceding a book-name token as part of the **BOOK** state, not as a candidate **NUMBER** state. Without this, "First Corinthians thirteen" risks the shape matcher treating "First" as a premature chapter number and either mis-firing on "Corinthians" alone or rejecting the shape as malformed.

#### 4.3.11 Dual Mic-Role Architecture

**FR-3.35 — FR-3.39** — Primary/secondary input architecture — unchanged from v1.6.

**FR-3.40 (New) — Secondary Input Command Scope:** The Mobile Companion App's push-to-talk secondary input (FR-3.36) is authorized for **all** command domains available to the primary input — scripture, timer, presentation/media (FR-4.8–4.12), and teleprompter (FR-5.30–5.34) — not scripture and timer alone. The v1.6 wording ("worship leader's own voice commands") was ambiguous about scope; this revision makes it explicit so a worship leader can, for example, say "OCS next slide" from their phone during a music set without walking to the media desk.

---

### 4.4 Presentation Controller

**FR-4.1 — FR-4.7** — Media import, PPTX import/conversion, speaker notes, deletable library, black/logo shortcuts, annotations, media scheduling — unchanged from v1.6.

**FR-4.8 (New) — Voice-Driven Slide/Media Navigation:** The following voice commands shall be recognized as closed-phrase commands (final-only, per FR-3.8d) and routed to the Presentation Controller regardless of which Bible/timer state is currently active:

| Command Type         | Example Phrase                                              |
| -------------------- | ----------------------------------------------------------- |
| Next slide/media     | _"OCS next slide"_ / _"OCS next"_ (in presentation context) |
| Previous slide/media | _"OCS previous slide"_ / _"OCS go back"_                    |
| Jump to slide N      | _"OCS go to slide five"_                                    |
| First / last slide   | _"OCS first slide"_ / _"OCS last slide"_                    |
| Play current media   | _"OCS play"_                                                |
| Pause current media  | _"OCS pause"_                                               |
| Black screen         | _"OCS black screen"_ (shared with FR-3.14)                  |

**FR-4.9 (New) — Context Disambiguation:** Because "next" and "previous" are also valid in a scripture-navigation context (FR-3.14), the command router shall resolve bare "next"/"previous"/"go back" against the **currently active display context** (`scripture` | `presentation` | `teleprompter`, tracked centrally — see FR-5.32), using the same `utteranceId` reconciliation flow as FR-3.8b. Explicit phrasing ("next slide" vs. "next verse") always overrides context and is preferred in the alias/grammar tables to reduce ambiguity in practice.

**FR-4.10 (New) — Voice Command Feedback for Presentation:** Slide navigation via voice shall produce the same audio/visual feedback contract as scripture commands (FR-3.18) — success chime + green flash, unrecognised → amber flash with suggestion, duplicate/no-op → grey flash.

**FR-4.11 (New) — Slide Number Bible-Style Fuzzy Matching:** "Go to slide N" shall reuse the FR-3.16 word-number conversion (so "slide five" and "slide 5" resolve identically) rather than a separate parser.

**FR-4.12 (New) — Dedup Guard Parity:** The FR-3.17 10-second dedup guard applies per command type independently — repeating "next slide" twice within 10 seconds is a normal, expected double-advance and must **not** be blocked by the guard designed for accidental double-triggered scripture references. Only identical `(command, target)` pairs with `target` being a fixed reference (e.g., "go to slide 5" issued twice) are subject to dedup.

---

### 4.5 Timer Controller

_(No changes. Confirmed intact per this revision's brief — FR-5.1 through FR-5.8 carried forward exactly as in v1.6.)_

### 4.5.1 Session Folders

_(No changes. FR-5.9 through FR-5.29 carried forward exactly as in v1.6.)_

---

### 4.6 Mobile Companion App

**FR-6.1 — FR-6.9** — Unchanged from v1.6, except FR-6.3's remote action list now also implicitly includes presentation/teleprompter control surfaces added in 4.4/5.5 (no FR renumbering needed — those are exposed through the same UI panels).

**FR-6.10 (revised) — Launch-Scoped Master Token:** On app launch, the embedded Express/Socket.IO server generates a master pairing token, embedded in the Controller's QR code and shown as a 6-digit fallback code. This master token is used **only** for the initial pairing handshake.

**FR-6.11 (New) — Per-Device Session Tokens:** On successful pairing, the server issues a **distinct, per-device session token** (not the master token) that the mobile app stores and uses for all subsequent command traffic. This is what makes per-device revocation (FR-7.4) actually work — revoking a device invalidates only its session token, without disconnecting other paired devices or requiring an app restart.

**FR-6.12 (New) — Fallback Code Rate Limiting:** The 6-digit manual-entry fallback code (FR-6.2) shall be rate-limited server-side: after 5 failed attempts from a given IP within 60 seconds, that IP is locked out from pairing attempts for 5 minutes, and the event is logged in the debug bar. This closes the brute-force exposure of an unthrottled 1,000,000-combination code on a shared church Wi-Fi network.

**FR-6.13 (New) — Transport Note:** Socket.IO traffic (including tokens and command payloads) travels over plain WS/HTTP on the LAN by default. Settings shall expose an option to self-sign and use WSS for churches on networks they consider higher-risk (e.g. shared/guest Wi-Fi with many unknown devices); default remains plain WS for setup simplicity, with the trade-off documented in-app during the FR-12.1 Step 7 pairing step.

---

### 4.7 Settings & Styling

**FR-7.1 — FR-7.8** — Unchanged from v1.6. FR-7.4's "Paired device management (view/revoke mobile pairings)" now functions correctly against the per-device tokens introduced in FR-6.11.

---

### 4.8 Display Reset

**FR-8.1** — Unchanged from v1.6.

---

## 5. New Feature Modules

### 5.1 Order of Service Planner

_(Unchanged from v1.6 — FR-9.1 through FR-9.6.)_

### 5.2 Verse Setlist / Queue

_(Unchanged from v1.6 — FR-10.1 through FR-10.2.)_

### 5.3 Crash Recovery & Session Persistence

_(Unchanged from v1.6 — FR-11.1 through FR-11.4.)_

### 5.4 First-Run Setup Wizard

_(Unchanged from v1.6 — FR-12.1, Steps 1–8. Step 3's "Speak normally" calibration should be re-run whenever the active engine changes per new FR-3.68 — cross-referenced, no wizard step renumbering needed.)_

### 5.5 Script & Teleprompter Module (New in v1.7)

This module generalizes the alignment engine already required for scripture read-along (FR-3.62) into a reusable primitive, and adds free-text teleprompter support — loading arbitrary sermon notes or scripts, not just Bible passages.

**FR-5.30 — Reference Text Sources:** A teleprompter/read-along session may be bound to one of: (a) a resolved scripture passage (existing FR-3.62 path), (b) a pasted or imported plain-text script, or (c) an Order of Service item's attached notes (FR-9.1). All three feed the same alignment engine.

**FR-5.31 — Shared Alignment Engine:** A single module (`referenceAligner.js`) accepts a reference text and a stream of ASR final (and, when available per FR-3.67, synthesized-partial) results, and emits `{ referenceId, wordIndex, confidence }` position updates via a dedicated `alignment:update` IPC channel — decoupled from the discrete command channel (`command:executed`) used by FR-3.14/FR-4.8. Fuzzy matching tolerance: edit distance ≤2, skip ≤2 tokens, matching FR-3.62's existing tolerance.

**FR-5.32 — Active Display Context:** A single source of truth, `activeDisplayContext: 'idle' | 'scripture' | 'presentation' | 'teleprompter'`, is maintained centrally and consumed by FR-4.9's disambiguation logic and by the Speaker View renderer to decide whether to show highlight-style (scripture) or scroll-style (teleprompter/script) rendering.

**FR-5.33 — Teleprompter Rendering:** When `activeDisplayContext = 'teleprompter'`, Speaker View auto-scrolls so the current aligned line stays in a fixed viewport band, with scroll interpolation (no hard jump-per-word) and a pace fallback — no scroll movement during a speaker pause, rapid catch-up scroll if the speaker jumps ahead. General View never renders teleprompter scroll state (same isolation rule as FR-3.62 for scripture).

**FR-5.34 (New) — Bounded Backward Resync:** Unlike FR-3.62's original one-way-only cursor, the shared aligner shall allow the cursor to move backward when: (a) no forward match is found for the current utterance against the next ~15 tokens ahead, AND (b) a strong match (edit distance ≤1) is found within the previous ~30 tokens. This lets a preacher who re-reads a verse or backtracks in a script resync correctly instead of the cursor drifting permanently out of sync. A resync event is logged to the debug bar and never occurs more than once per 3 seconds (prevents oscillation).

**FR-5.35 — Teleprompter Voice Commands:** _"OCS start teleprompter"_ (loads the currently selected Order of Service note or last-pasted script), _"OCS stop teleprompter"_, _"OCS restart teleprompter"_ (resets cursor to position 0). Subject to FR-3.40 (available from secondary input too).

---

## 6. Non-Functional Requirements

### 6.1 Performance

_(Unchanged from v1.6 — NFR-1 through NFR-8. NFR-1's <3s target applies regardless of active engine; whisper.cpp's chunk-based finals must still land within this budget — flagged as a soak-test item in the Roadmap.)_

### 6.2 Reliability

_(Unchanged from v1.6 — NFR-9 through NFR-15.)_

### 6.3 Compatibility

_(Unchanged from v1.6 — NFR-16 through NFR-19.)_

**NFR-37 (New) — macOS Microphone Entitlement:** The app shall declare `NSMicrophoneUsageDescription` in its Info.plist with church-context-appropriate copy, and shall handle the OS-level "mic access revoked" state gracefully (debug bar shows `error: mic-permission-denied` with a direct link to System Settings) rather than silently failing to transcribe. Continuous background listening while the app is not the focused window is a macOS behavior that should be explicitly tested, not assumed, during Phase 6 beta.

### 6.4 Disk & Memory

_(Unchanged from v1.6 — NFR-20 through NFR-24, still flagged "re-baseline" pending bench harness results.)_

### 6.5 Security & Privacy

_(NFR-25, NFR-27 unchanged from v1.6.)_

**NFR-26 (revised)** — Local server binds to `0.0.0.0:4000`; unpaired devices can connect to the socket but cannot execute commands without a valid **per-device session token** (FR-6.11), issued after a successful pairing handshake authenticated by the launch-scoped master token (FR-6.10) and rate-limited fallback code (FR-6.12).

**NFR-28 (revised)** — Auto-updates download silently but install only with operator approval, and never while `timer:started` has fired without a matching `timer:completed`/`timer:stopped`/`timer:cancelled` event on the FR-5.9 lifecycle bus — i.e. "live session" is now a concretely defined state, not an assumed one.

### 6.6 Accessibility

_(Unchanged from v1.6 — NFR-29 through NFR-32.)_

### 6.7 Session Archive

_(Unchanged from v1.6 — NFR-33 through NFR-36. Timer Controller and Session Folders confirmed untouched in this revision.)_

---

## 7. Success Metrics

_(Unchanged from v1.6 — Sections 7.1–7.4, with one addition below.)_

**New metric (7.2 Reliability):** Voice-driven presentation command success rate — target ≥ 90%, tracked separately from scripture command success rate so the new FR-4.8 command set can be evaluated independently during beta.

---

## 8. Risks & Mitigations

_(All v1.6 rows carried forward unchanged. New rows below.)_

| Risk                                                                                                       | Likelihood                   | Impact                                       | Mitigation                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spec/implementation drift between "Vosk" FRs and whisper.cpp-as-default architecture note (v1.6 issue)** | High (already occurred once) | High                                         | FR-3.65 ASR Adapter contract + explicit `[Vosk-fallback only]` FR tagging going forward; any new voice FR must state which engine(s) it applies to                                                                                                    |
| **Global pairing token can't support per-device revocation as promised by FR-7.4**                         | Medium                       | Medium                                       | FR-6.11 per-device session tokens issued at pairing time                                                                                                                                                                                              |
| **6-digit fallback pairing code brute-forceable on shared Wi-Fi**                                          | Low–Medium                   | High                                         | FR-6.12 rate limit + lockout                                                                                                                                                                                                                          |
| **"Next"/"previous" ambiguous between scripture and presentation voice commands**                          | Medium                       | Medium                                       | FR-5.32 central `activeDisplayContext` + FR-4.9 explicit-phrasing preference in grammar/alias tables                                                                                                                                                  |
| **Compound book names with ordinal prefixes ("First Corinthians") mis-parsed by structural shape gate**    | Medium                       | Medium                                       | FR-3.69 ordinal-prefix exception in `matchReferenceShape`                                                                                                                                                                                             |
| **Teleprompter/read-along cursor gets permanently stuck after a legitimate backtrack**                     | Medium                       | Medium                                       | FR-5.34 bounded backward resync                                                                                                                                                                                                                       |
| **Session archive records congregation members' voices without their individual consent**                  | Medium                       | High (legal exposure varies by jurisdiction) | FR-5.17 notice covers operator/church-level consent only; church leadership should be advised this is a policy/legal decision, not something OCS can fully solve technically — recommend visible signage as a complementary, non-technical mitigation |
| **macOS revokes mic permission mid-service (OS update, user action) with no graceful in-app recovery**     | Low                          | Critical                                     | NFR-37 explicit permission-denied state + guided recovery in debug bar                                                                                                                                                                                |
| **Auto-update installs mid-service because "live" was previously undefined**                               | Low                          | Critical                                     | NFR-28 now ties directly to the FR-5.9 timer lifecycle bus state                                                                                                                                                                                      |

---

## 9. Roadmap

**See companion file `OCS_Project_Phases.md` for the full phased breakdown**, which incorporates this revision's new work (ASR adapter unification, voice-driven presentation control, teleprompter module, per-device token security) into the existing Phase 0–6 structure without disturbing the Timer Controller / Session Folder phases, which remain as-shipped.

---

## 10. Out of Scope — V1

_(Unchanged from v1.6.)_

---

## 11. Glossary

_(All v1.6 terms carried forward. New terms below.)_

| Term                   | Definition                                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ASR Adapter            | The `AsrAdapter` interface (FR-3.65) that abstracts whisper.cpp and Vosk behind a single `onPartial`/`onFinal` contract                                            |
| Synthesized partial    | A UI-feedback-only interim transcript produced by re-inferring whisper.cpp on a growing buffer (FR-3.67), distinct from Vosk's native partials                     |
| Active display context | The single source of truth (`scripture` \| `presentation` \| `teleprompter` \| `idle`) used to disambiguate context-dependent voice commands like "next" (FR-5.32) |
| Master pairing token   | The launch-scoped token used only for the initial mobile pairing handshake (FR-6.10)                                                                               |
| Session token (device) | A per-device token issued after pairing, used for all subsequent command traffic and independently revocable (FR-6.11)                                             |
| Reference aligner      | The shared module (`referenceAligner.js`) that powers both scripture read-along and free-text teleprompter (FR-5.31)                                               |
| Backward resync        | A bounded, rate-limited correction that lets the reference aligner's cursor move backward when the speaker legitimately backtracks (FR-5.34)                       |

---

_OCS PRD v1.7 — August 2026_
