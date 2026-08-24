# OCS — Organised Church Service

## Product Requirements Document (PRD)

**Author:** Are Oluwasegun Johnson
**Version:** 1.14
**Last Updated:** August 2026
**Status:** Active Development

---

## Changelog from v1.13 → v1.14 (Web Real-Time Notifications & Downloads + Desktop Tier 2 Gating & Agenda Planner)

**Section 4.14 (Web Platform Real-Time Dashboard, WebSocket Notification Feed & Downloads API):**
- **WebSocket Broadcast Feed (Socket.IO):** Added bidirectional real-time push notification bus broadcasting `admin:notification` and `admin:metrics` on ticket submissions, suggestions, testimonials, and application downloads.
- **Admin Real-Time Notification Dropdown & Toasts:** Admin panel live notification bell with badge counts, deep-link navigation, and instant popup toasts.
- **Live Dashboard & Download Analytics:** Converted Admin Dashboard to consume live API aggregations for KPIs (Total Downloads, Active Accounts, Open Tickets, Active Trials), dynamic 6-tier subscription breakdowns, platform percentage distributions, and monthly download timeline charts. Added `POST /api/downloads` client logging and `GET /api/admin/downloads` audit view.
- **Web Interface Streamlining:** Removed deprecated web settings navigation route.
- **Commercial Pricing Matrix Update:** Formally gated Sessions Archive and Automated Multi-Track Audio Recording to Tier 2+ (`standard`, `large`, `premium`) in web pricing and tier matrix.

**Section 4.15 (Desktop Tier 2 Session & Bumper Gating, and Agenda Planner):**
- **Tier 2 Gating for Sessions & Bumpers:** Added `session.recording` and `session.bumper` permission keys; gated `SessionsController.js` and the Bumpers tab in `SettingsController.js` with `DisabledContainer` for Tier 1 users (`free`, `mini`, `trial`, `guest`).
- **Tier 1 Audio Recording Bypass:** When running a service on a Tier 1 plan or for muted sessions, `sessionArchive.js` skips audio chunk buffering and FFmpeg compression entirely, creating lightweight session records without audio capture.
- **Agenda Planner:** Introduced `AgendaPlannerModal.jsx` integrated into `TimerController.js` allowing operators to select which agenda sessions to record, and configure automated Start Media Cues (solid colors, intro bumpers, intro chimes), Mid-Run Warning Cues (half-time flash, warning chimes), and Completion Cues (auto-blackout, outro bumpers).
- **Add/Update Dual-Mode Timer Editing:** Enhanced timer editing with distinct "Add" and "Update" actions while continuously preserving label and anchor/speaker metadata.

---

## Changelog from v1.12 → v1.13 (Transactional Email & Password Reset)

**Terminology correction to FR-13.15:** Production data confirms the customer account role is `church_admin` (the account owner, one per customer), not a generic `user` role as previously assumed — corrected below. This remains a label only; it carries no elevated backend permissions and does not constitute the per-church RBAC concept FR-13.15 already correctly states doesn't exist.

**New Section 4.13 (Transactional Email & Password Reset):** Specified before implementation, per the same up-front spec-checkpoint discipline as Section 4.12. Covers the email provider decision and closes a real, previously-undiscovered gap: no password reset flow has existed anywhere in the auth system until now.

---

## Changelog from v1.11 → v1.12 (Auto-Update & Platform-Staff Role Clarification)

**FR-13.15 added:** Clarifies `admin`/`super_admin` are both platform-staff roles, not per-church roles — see Section 4.10.

**New Section 4.12 (Desktop Auto-Update):** Specified before implementation, not retroactively — this is the first new capability in this project's history to get a spec checkpoint up front rather than after discovery. The central design constraint is unique to OCS's context: this app runs live church services, so an update mechanism that could force a mid-service restart or steal focus during an active broadcast would be a genuine operational hazard, not just an annoyance. The FRs below treat live-session safety as the primary constraint the whole feature is designed around, not an afterthought.

---

## Changelog from v1.10 → v1.11 (Free/Guest Mode, Subscription Tiers & Permissions)

Two directly-authorized product decisions retroactively formalized here, per the standing rule that a formal FR reversal requires a PRD update, not just a note in an audit report.

**FR-13.1 revised (Free/Guest Mode replaces Hard Login Gate):** The app no longer blocks all use until login. It opens directly to the main Controller in a Free/Guest mode; login is available but optional, accessed via the sidebar. See revised FR-13.1 below.

**New Section 4.11 (Subscription Tiers, Permissions & Commercial Model):** A tier/pricing/permissions system was built without a prior spec. This section formalizes what was actually built, based on the implementation audit — **some details below (full permission list, per-tier seat counts beyond the Trial tier, exact entitlement mapping) are marked as needing confirmation from the actual codebase**, since this document is being written from an audit summary, not the source of truth itself. Treat those specific items as provisional until verified directly against `ocs-backend`'s actual models.

**Note on terminology:** This revision distinguishes two previously-adjacent concepts that share the word "grace" but are not the same thing — FR-13.5's **Offline Session Cache Grace Period** (72 hours, a technical tolerance for connectivity gaps) and the new FR-13.9's **Subscription Trial Period** (2 months, a business/billing concept). Future audits should not conflate these.

---

## Changelog from v1.9 → v1.10 (Authentication, Licensing & Splash Screens)

Introduces the first mandatory network dependency in OCS's architecture — a login gate required before the app can be used at all. This is a deliberate product decision (church/organization licensing), not an accidental deviation from the offline-first principle (NFR-9, NFR-25) that governs everything else in this document — but because it's the one place where OCS now _requires_ connectivity, it gets its own explicit risk mitigation (FR-13.5's cached grace period) rather than silently inheriting the offline-first assumption the rest of the app makes.

**Scope of this revision:**

- New Section 13 (Authentication & Licensing): desktop-primary web-redirect login flow, per-platform deep-link handling, secure token storage, cached grace period, splash screens for both platforms.
- Mobile does NOT get a separate login — it continues to pair to an already-authenticated desktop exactly as it does today (FR-6.1–6.13 unchanged). Desktop's license/session state is what mobile pairing depends on.

---

## Changelog from v1.8 → v1.9 (Continuous Secondary Voice Mode + NDI/Broadcast Streaming)

Two features were built as deliberate scope decisions during recent development, outside the original v1.8 plan — this revision formally documents them rather than leaving them as undocumented deviations. Both need hardening before being considered release-ready; see the companion hardening task for implementation status.

**FR-3.36 revised (Continuous Secondary Voice Mode):** Secondary input was originally push-to-talk-only. It now also supports an operator-selectable **Continuous Mode** — the mobile device streams audio continuously (not gated by hold-to-talk) for hands-free scripture detection. This is a deliberate product decision, not a spec violation, but it reopens the exact risks push-to-talk was originally chosen to avoid (iOS background-mic restrictions, bandwidth, false-trigger exposure) — new FR-3.41–FR-3.45 below address these directly. Push-to-talk remains available and is still the recommended default; Continuous Mode is opt-in.

**New Section 4.9 (NDI & Broadcast Streaming):** A new capability allowing OCS's Program and Stage outputs to be discovered and consumed by external broadcast tools (OBS Studio, vMix, hardware switchers) via mDNS-advertised HTTP/MJPEG streams. This introduces a new network-exposed service on the church's LAN that did not exist in any prior version — new FR-4.41–FR-4.48 below establish the security posture (off by default, explicit enable, plain-language exposure notice) this needs before it can be treated as consistent with the rest of the app's offline-first, pairing-gated security model (NFR-25, NFR-26).

**Integrity note:** Recent implementation-audit reports have cited FR numbers (e.g. "FR-6.20–FR-6.27", "FR-6.30–FR-6.39") that were never defined in any PRD revision through v1.8 — these were generated by the auditing agent during self-verification against work that had no real spec to check against, not genuine citations. This revision retroactively documents the actual built behavior under real FR numbers (FR-6.14–FR-6.25, FR-4.7a, FR-4.41–FR-4.45 below), which supersede any such fabricated citations in prior reports. Future audits should be run against this document specifically, and should flag rather than invent an FR number if a described behavior has no corresponding requirement.

**Also newly documented in this revision (built without prior spec, now retroactively formalized):**

- FR-6.14–FR-6.17: device naming, live presence, multi-device support, mic-live indicator
- FR-6.18–FR-6.22: mobile→desktop asset transfer with mandatory accept/reject gate
- FR-6.23–FR-6.25: Mobile Scene Creator
- FR-4.7a: PDF presentation import

---

## Changelog from v1.7 → v1.8 (Media / Scene / Text / Presentation Suite)

This revision replaces Section 4.4 ("Presentation Controller") with a unified **Media, Scene, Text & Presentation Suite (MSTP)** — a single compositor-based architecture covering all four requested capabilities, added to **Phase 2** of the roadmap per direct request. Architecture is modeled on the Scene/Source layer-stack pattern used by OBS Studio (the closest proven prior art for "persistent overlays across switchable content"), adapted to OCS's existing IPC/window model rather than bolted on separately.

**Core architectural decision:** Media, Scene, Text, and Presentation are not four independent renderers. They resolve to **two layer types** (`background`, `pinned`) and **two content-slot types** (`scene`, `presentation`) sitting on one shared **Display Canvas** compositor, rendered identically across Controller preview, Speaker View, and General View. This is what makes "a pinned image survives a Bible-to-Timer switch" fall out of the architecture for free instead of being a special case bolted onto each feature.

**New/changed FRs:** FR-4.13–FR-4.40 (Display Canvas + Media layers), FR-5.36–FR-5.39 (Scene pages + read-along auto-advance, extending the existing Section 5.5 reference aligner rather than duplicating it). Existing FR-4.1–FR-4.12 (media library, PPTX import, voice slide navigation) are retained and now describe the `presentation` content-slot type specifically.

**New NFRs:** NFR-38–NFR-41 covering cross-platform video/image normalization, GPU compositing consistency, and mic/video-audio feedback isolation — flagged as risks during the deep-dive research pass, not originally covered anywhere in the doc.

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

#### 4.3.11.1 Continuous Secondary Voice Mode (New in v1.9)

**FR-3.41 (New) — Mode Selection:** Secondary input supports two operator-selectable modes: **Push-to-Talk** (FR-3.36's original design, remains the default) and **Continuous Mode** (new — the mobile device streams audio continuously without hold-to-talk gating, for hands-free scripture detection). The mode is a deliberate, visible choice made per-device from the mobile app, not a silent/automatic behavior.

**FR-3.42 (New) — Continuous Mode Visible "LIVE" State:** While a device is in Continuous Mode and actively streaming, the mobile app SHALL display a persistent, unmissable "LIVE" indicator, and the desktop's connected-device list (FR-6.5) SHALL show the same device's live-streaming state clearly — this is not a background/invisible behavior on either end.

**FR-3.43 (New) — Continuous Mode Applies Full Ambient Gating:** Continuous Mode audio is subject to the exact same false-positive protections as primary ambient scripture detection — the two-tier confidence gate (FR-3.13), the structural shape gate requiring a COMPLETE ordered reference (FR-3.58), and Pass 3/keyword-quote restrictions (FR-3.59) all apply identically. Continuous Mode does not get a looser gate just because it's a secondary source — an open mic picking up ambient conversation is exactly the scenario these gates exist to protect against, and that risk is higher for a continuously-streaming phone than for a deliberate push-to-talk action.

**FR-3.44 (New) — Background/Foreground and Platform Behavior:** If Continuous Mode is expected to keep streaming while the phone is locked or backgrounded, the mobile app SHALL declare the appropriate platform background-audio capability (e.g. iOS `UIBackgroundModes: audio`) and this SHALL be explicitly tested — silently stopping when the screen locks (a common default without this capability declared) would be a confusing, hard-to-diagnose failure mode for an operator who believes hands-free mode is still active. If reliable background operation cannot be guaranteed on a given platform, the app SHALL clearly state this limitation in the mode-selection UI rather than implying always-on behavior it can't deliver.

**FR-3.45 (New) — Auto-Stop Safeguard:** Continuous Mode SHALL automatically stop cleanly (not crash or silently hang) on connection loss, matching the existing FR-3.38 reconnection behavior, and SHALL provide an always-visible, one-tap manual stop control — an operator must always be able to immediately end continuous streaming from their device without navigating menus.

---

### 4.4 Media, Scene, Text & Presentation Suite (MSTP)

This section (v1.8) replaces the narrower "Presentation Controller" with a unified architecture covering four user-facing capabilities — **Media**, **Scene**, **Text**, and **Presentation** — built on one shared compositor rather than four separate renderers. See the v1.8 changelog for the architectural rationale.

#### 4.4.1 Architecture — The Display Canvas

**FR-4.13 (New) — Display Canvas Compositor:** All General View, Speaker View, and Controller-preview rendering shall be produced by a single compositor (`DisplayCanvas.js`) that renders four ordered bands, back to front:

1. **Background Layer** — at most one active image or video, fills the canvas
2. **Content Slot** — exactly one active content type at a time: `bible` | `scene` | `presentation` | `timer` (audience mode) | `none`
3. **Pinned Layers** — zero or more persistent image/video/text layers, ordered by z-index
4. **Chrome** — blackout, logo, OCS branding (existing FR-1.x, always topmost)

**FR-4.14 (New) — Independence of Background/Pinned from Content Slot:** The existing `activate_set_content` IPC event (FR-1.3) shall be scoped to update **only** the Content Slot. It shall never clear, hide, or otherwise mutate the Background Layer or any Pinned Layer. This is the mechanism — not a special case — by which a background stays visible under an active Bible verse, and a pinned image/text survives a switch from Scene to Presentation to Timer.

**FR-4.15 (New) — Canvas State Sync:** The full Display Canvas state (background descriptor, pinned layer array, active content-slot descriptor) is the single source of truth broadcast via IPC to Speaker View and General View, and mirrored (read-only, non-blackout) into the Controller preview panes. Mobile Companion (FR-6.3) receives a lightweight summary (active content-slot type + pinned layer count) rather than full canvas state, since it does not render the canvas itself.

#### 4.4.2 Media (Background & Pinned Layers)

**FR-4.16 (New) — Import & Placement Choice:** On importing an image or video into the media library (existing FR-4.1 import mechanics retained), the operator shall explicitly choose placement: **Background** or **Layer (Pinned)**. This choice determines behavior per FR-4.17–FR-4.22 and can be changed later from the library without re-importing.

**FR-4.17 (New) — Background Fit Behavior:** A Background media item shall always fill the canvas edge-to-edge (CSS `cover`-equivalent scaling — crop to fill, preserve aspect ratio, no letterboxing). Only one Background may be active at a time; activating a new one replaces the prior one in the Background band only, per FR-4.14.

**FR-4.18 (New) — Background Panning via Keyboard:** While a Background is active and canvas-panning focus is engaged (see FR-4.27 for focus model), the Up/Down/Left/Right arrow keys shall nudge the crop offset in that direction by a configurable increment (default 2% of canvas dimension per press; held key repeats at OS key-repeat rate). Offset is clamped so the crop can never reveal empty space at any edge — the background always fully fills the canvas regardless of pan position. Offset is stored per-background-item so returning to a previously used background restores its last pan position.

**FR-4.19 (New) — Background Video Behavior:** A video used as Background loops by default (configurable), autoplays on activation, and is **muted by default** (see NFR-40 for the rationale). Pan controls (FR-4.18) apply identically to video backgrounds as to image backgrounds.

**FR-4.20 (New) — Pinned Layer Placement & Adjusting Nodes:** A Pinned media item (image, video, or Text — see 4.4.3) does **not** auto-fill the canvas. It renders at an operator-defined position/size, adjustable via **adjusting nodes** — corner and edge drag handles shown in an Edit Mode toggle in the Controller preview, matching the direct-manipulation pattern used by comparable compositing tools (e.g. OBS's source transform handles). Position and size are stored as canvas-relative normalized coordinates (0.0–1.0 on each axis), not absolute pixels, so layout is preserved correctly across the 1/2/3-monitor configurations and differing resolutions covered by FR-1.2.

**FR-4.21 (New) — Pinned Layer Persistence:** A Pinned layer, once placed, remains visible on General View and Speaker View regardless of Content Slot changes (Bible verse changes, Timer activation, Scene page turns, Presentation slide changes) — this is the direct architectural expression of the requirement that imported layer media "remain on the screen even if timer or bible is showing." A Pinned layer is only removed when the operator explicitly hides or deletes it, or triggers Blackout (FR-1.5 `B` shortcut, which still hides everything including Chrome-adjacent bands).

**FR-4.22 (New) — Pinned Video Playback Controls:** A Pinned video layer supports independent play/pause/loop state from the Content Slot and Background — e.g. a looping logo animation pinned in a corner keeps looping through verse changes without needing to be re-triggered.

**FR-4.23 (New) — Z-Order Management:** Multiple Pinned layers are orderable (drag-to-reorder in a layer list in the Controller, mirroring the mental model already used for Order of Service drag-reordering per FR-9.1) with a "bring to front / send to back" quick action.

**FR-4.24 (New) — Layer Library Persistence:** Background and Pinned layer configurations (which media, placement, transform, z-order) are saved as part of the session auto-save (extending FR-11.1) so a crash mid-service restores the full canvas state, not just Bible/timer/queue state.

#### 4.4.3 Text as a Layer

**FR-4.25 (New) — Text Layer:** A Text layer is a Pinned-layer variant (FR-4.20–FR-4.23 apply identically) whose content is operator-typed or pasted plain text rather than an imported file, with its own font/size/color style override (falling back to the global FR-7.1 style if unset). Text layers persist across Content Slot changes exactly as image/video Pinned layers do, per FR-4.21 — this is not a separate feature, it is the Text type of `LayerSource`.

**FR-4.26 (New) — Text Layer Voice/Quick Entry:** A Text layer can be added via the Controller's quick-add panel or a voice command (_"OCS add text layer"_ opens a text-entry prompt in the Controller — text content itself is typed, not spoken, since free-form dictation-to-display is out of scope for accuracy reasons).

#### 4.4.4 Selection & Keyboard Focus Model

**FR-4.27 (New) — Single Selection Focus:** At any moment, at most one canvas element (the Background, or one specific Pinned layer) holds "keyboard focus" for arrow-key manipulation, set by clicking it in the Controller's live preview or cycling via `Tab`/`Shift+Tab`. Arrow keys affect only the focused element: panning if it's the Background (FR-4.18), nudged repositioning if it's a Pinned layer. This reuses the FR-1.5 global-shortcut infrastructure and does not conflict with it, since arrow-key canvas manipulation is only active while a canvas element has explicit focus (not during normal operation).

#### 4.4.5 Scene (Paged Text / Lyrics)

**FR-4.28 (New) — Scene Entity:** A Scene is a named, ordered set of Pages, where each Page holds either plain text or song lyrics. Scenes are created/edited in a dedicated Scene editor panel, similarly structured to the existing Bible verse tree (FR-2.2) for UI consistency.

**FR-4.29 (New) — Scene Navigation Modes:** Each Scene is set (at creation, changeable later) to one of two page-advance modes:

- **Read-Along** — pages advance automatically, driven by speech (see FR-5.36–FR-5.38, extending the existing Section 5.5 reference aligner)
- **Manual/Mobile-Controlled** — pages advance only via keyboard (`Space`, matching the existing Order of Service advance key per FR-9.3), Controller click, or Mobile Companion next/previous (extending FR-6.3)

**FR-4.30 (New) — Scene as Content Slot:** Activating a Scene occupies the Content Slot (`scene` type, per FR-4.13), exactly like activating a Bible verse or Presentation slide — subject to the same FR-4.14 independence from Background/Pinned layers.

**FR-4.31 (New) — Scene Voice Commands:** _"OCS start scene [name]"_, _"OCS next page"_, _"OCS previous page"_ — routed through the same command router as FR-4.8's presentation commands and FR-3.14's scripture commands, disambiguated via the FR-4.9 `activeDisplayContext` mechanism (extended to include `scene` as a context value, alongside `scripture` | `presentation` | `teleprompter`).

#### 4.4.6 Presentation (PPTX)

**FR-4.1 — FR-4.7** — Media import, PPTX import/conversion, speaker notes, deletable library, black/logo shortcuts, annotations, media scheduling — retained from v1.6/v1.7. These now describe the Presentation content-slot type specifically; the underlying media _library_ mechanics (FR-4.1) are shared infrastructure also used for Media Background/Pinned import (FR-4.16).

**FR-4.7a (New) — PDF Presentation Import:** In addition to .pptx, OCS accepts .pdf files as a Presentation deck source. Each PDF page is rendered to a high-resolution PNG (1080p minimum) and treated identically to a converted PPTX slide thereafter — same Content Slot integration (FR-4.13), same voice navigation (FR-4.8), same deck-list presentation in the Presentation screen. PDF decks do not carry speaker notes (FR-4.3 does not apply) since the format has no equivalent construct.

**FR-4.8 (Retained from v1.7) — Voice-Driven Slide/Media Navigation:**

| Command Type         | Example Phrase                                              |
| -------------------- | ----------------------------------------------------------- |
| Next slide/media     | _"OCS next slide"_ / _"OCS next"_ (in presentation context) |
| Previous slide/media | _"OCS previous slide"_ / _"OCS go back"_                    |
| Jump to slide N      | _"OCS go to slide five"_                                    |
| First / last slide   | _"OCS first slide"_ / _"OCS last slide"_                    |
| Play current media   | _"OCS play"_                                                |
| Pause current media  | _"OCS pause"_                                               |
| Black screen         | _"OCS black screen"_ (shared with FR-3.14)                  |

**FR-4.9 (Retained, extended) — Context Disambiguation:** The command router resolves bare "next"/"previous"/"go back" against the **currently active display context** (`scripture` | `presentation` | `scene` | `teleprompter` — extended in v1.8 to include `scene`), tracked centrally per FR-5.32, using the FR-3.8b `utteranceId` reconciliation flow. Explicit phrasing always overrides context.

**FR-4.10 — FR-4.12** — Voice command feedback parity, slide-number fuzzy matching, dedup guard parity — retained from v1.7, unchanged.

#### 4.4.7 Cross-Platform Media Pipeline

**FR-4.32 (New) — Video Normalization on Import:** Every imported video file shall be transcoded on import (via a bundled, prebuilt-per-platform ffmpeg binary — no system-level ffmpeg install required) into a canonical VP9-in-WebM format at a bounded max resolution/bitrate. The **original file is retained** in the media library folder alongside the normalized copy; the normalized copy is what actually plays on canvas. Rationale: Chromium's native H.264 decode support in Electron depends on how a given platform's build was compiled and is not guaranteed consistent between the Windows and macOS builds (see NFR-38); VP9/WebM is royalty-free and decodes consistently across both without relying on build-time codec flags.

**FR-4.33 (New) — Image Normalization on Import:** Every imported image is normalized (format + orientation-tag correction) on import via a bundled image-processing library (e.g. `sharp`, which ships prebuilt binaries per platform/arch) rather than relying solely on Chromium's native decode for less common formats (e.g. certain TIFF/HEIC variants exported by some phone cameras).

**FR-4.34 (New) — Import Progress & Failure Surfacing:** Normalization runs as a background job with a visible progress indicator in the media library (extends the FR-4.2/NFR-13 per-item error-surfacing pattern already established for PPTX conversion failures) — a failed transcode surfaces a specific, actionable error rather than a silently missing thumbnail.

**FR-4.35 (New) — GPU Compositing Consistency:** All canvas layer transforms (position, scale, pan offset) shall be implemented via CSS `transform`/`opacity` properties, which Chromium GPU-accelerates identically on both the ANGLE/Direct3D backend (Windows) and the native GL/Metal-backed compositor (macOS), rather than via Canvas2D/WebGL custom rendering — avoiding a second, platform-variable rendering path for what is otherwise a straightforward layered-DOM composition.

#### 4.4.8 Windows/macOS Cross-Platform Notes

**FR-4.36 (New) — Path Handling:** All media library file paths are stored and resolved via Node's `path` module (`path.join`/`path.resolve`), never string-concatenated, to avoid Windows backslash/POSIX separator bugs — relevant now that NFR-17's Windows V2 target has concrete file-heavy features (Media library, Scene assets) to validate against, ahead of the actual V2 Windows port.

**FR-4.37 (New) — Font Rendering Parity:** Text layers (FR-4.25) and Scene pages (FR-4.28) shall use web-safe/bundled fonts (shipped inside the app package) rather than relying on fonts being present on the host OS, since default font availability differs meaningfully between Windows and macOS.

**FR-4.38 (New) — File Dialog Behavior:** Media import file pickers use Electron's native `dialog` module, which already abstracts the Windows/macOS native file-picker difference — explicitly called out here so this isn't accidentally reimplemented with a custom (platform-inconsistent) picker when this module is built.

**FR-4.39 (New) — Keyboard Modifier Parity:** Where the FR-1.5 shortcut table uses `Cmd/Ctrl`, the same convention extends to any new MSTP shortcuts (Edit Mode toggle, layer cycling) — no macOS-only or Windows-only-bound shortcut should exist without an equivalent on the other platform.

**FR-4.40 (New) — Build/Test Matrix:** Every MSTP layer type × transform operation (background pan, pinned drag-resize, video play/pause/loop) shall be included in the Phase 6 cross-platform manual test pass (extends the existing Roadmap Phase 6/7 QA scope) once the Windows build target becomes active, rather than being assumed to "just work" because it worked on macOS.

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

#### 4.6.1 Device Naming, Live Presence & Multi-Device Support (New in v1.9)

**FR-6.14 (New) — Device Naming:** On first pairing, the mobile app prompts for a display name, persisted locally and sent to the desktop on every connection. The desktop's connected-device list (FR-6.5) SHALL show this name, not just IP/device-model, and the operator SHALL be able to rename any connected device from the desktop side as well (bidirectional rename).

**FR-6.15 (New) — Live Presence Updates:** The desktop connected-device list SHALL update in real time (via Socket.IO event, not polling) on connect, disconnect, and rename — an operator should never need to manually refresh to see current connection state.

**FR-6.16 (New) — Concurrent Multi-Device Support:** The desktop SHALL support multiple simultaneously paired devices, each independently named, listed, and controllable, per FR-6.11's per-device session token architecture.

**FR-6.17 (New) — Mic-Live Presence Indicator:** The connected-device list SHALL indicate, per device, whether that device is currently actively streaming secondary voice input (push-to-talk held, or Continuous Mode per FR-3.41 active), so an operator can see at a glance which device (if any) is "hot."

#### 4.6.2 Asset Transfer: Mobile → Desktop (New in v1.9)

**FR-6.18 (New) — Supported Asset Types:** A paired mobile device may send an image, video, audio file, or presentation file (.pptx or .pdf, per FR-4.1's PDF extension below) to the desktop over the existing paired connection.

**FR-6.19 (New) — Mandatory Operator Accept/Reject Gate:** A transferred asset SHALL NEVER be automatically applied to any display, media library, presentation set, or bumper slot. The desktop SHALL show an explicit accept/reject prompt (sender device name, file name/type, preview thumbnail where feasible) and take no action on the file until the operator explicitly accepts. This is a hard requirement, not a preference — an accepted-but-unreviewed asset reaching General View live would be a real service-disruption risk even from a legitimately paired device.

**FR-6.20 (New) — Size Limit:** Transferred assets are capped at 50MB; an oversized file is rejected with a clear message to the sending device before transfer completes, not after.

**FR-6.21 (New) — Type-Based Routing on Accept:**

- **Audio** → operator is prompted to assign the file as **Intro Bumper**, **Outro Bumper**, or save as general media (no forced assignment); accepted intro/outro assignments write into the existing bumper system (Session Folders' audio merge pipeline).
- **Presentation (.pptx/.pdf)** → routed through the standard import/conversion pipeline (FR-4.1–FR-4.7) and appears in the Presentation screen exactly as a locally-imported deck would, including the same font-advisory and placeholder-resolution handling.
- **Image/Video** → saved to the Media library (FR-4.16's Background/Pinned import flow); video is subject to the same normalization pipeline (FR-4.32) as a local import.

**FR-6.22 (New) — Desktop Notification:** On receipt of a pending asset transfer, the desktop SHALL surface a native OS-level notification in addition to the in-app accept/reject prompt, so an operator working in another window doesn't miss an incoming transfer.

#### 4.6.3 Mobile Scene Creator (New in v1.9)

**FR-6.23 (New) — Mobile Song/Text Authoring:** The mobile app provides a Scene creation/editing screen allowing a worship leader to author a Scene (song or text type, per FR-4.28) directly from their phone, with the same section-type model (song sections with repeat counts, plain text pages) as the desktop Scene editor.

**FR-6.24 (New) — Lyric Auto-Split on Paste:** Pasting multi-paragraph lyric text into the mobile Scene editor SHALL automatically split it into individual section/page boundaries at paragraph breaks, rather than requiring manual page-by-page entry.

**FR-6.25 (New) — Desktop Sync:** A Scene authored or edited on mobile SHALL sync to the desktop's Scene library via the paired connection, subject to the same FR-6.19 accept/reject gate as other asset transfers before it becomes usable/presentable on desktop.

---

### 4.7 Settings & Styling

**FR-7.1 — FR-7.8** — Unchanged from v1.6. FR-7.4's "Paired device management (view/revoke mobile pairings)" now functions correctly against the per-device tokens introduced in FR-6.11.

---

### 4.8 Display Reset

**FR-8.1** — Unchanged from v1.6.

---

### 4.9 NDI & Broadcast Streaming (New in v1.9)

Allows OCS's Program (General View) and Stage (Speaker View) outputs to be discovered and consumed by external broadcast tools (OBS Studio, vMix, hardware video switchers) over the church's LAN via mDNS-advertised HTTP/MJPEG streams. This is a new network-exposed service with no precedent elsewhere in OCS's architecture, which has otherwise been offline-first and pairing-gated throughout (NFR-25, NFR-26) — the FRs below establish the security posture required before this is consistent with that model. **As of this revision, FR-4.42–FR-4.44 below are specified but not yet confirmed implemented** — see the companion hardening task.

**FR-4.41 (New) — Stream Content:** OCS exposes two independent streams — Program Output (General View content) and Stage Display (Speaker View content) — discoverable via mDNS (`_ndi._tcp.local`) and consumable as MJPEG over HTTP by any standard broadcast tool on the same network.

**FR-4.42 (New) — Off By Default:** NDI/broadcast streaming SHALL be disabled by default on every launch. It is an explicit, per-session or persistent-until-disabled opt-in from Settings, never an automatic background service.

**FR-4.43 (New) — Plain-Language Exposure Notice:** Before a user can enable streaming, Settings SHALL display a clear, non-technical notice of what this exposes — e.g. "Anyone connected to this network will be able to view your display feed without a password. Only enable this on a trusted production network, not a public or guest Wi-Fi." This mirrors the existing consent-notice pattern used elsewhere in OCS (e.g. session recording consent).

**FR-4.44 (New) — Access Control Decision:** Given NDI/MJPEG-consuming tools (OBS, vMix) are LAN-trust-oriented by industry convention and don't typically support pairing-token auth, OCS SHALL NOT attempt to bolt on a custom auth scheme these tools can't use — instead, the mitigation is FR-4.42 (off by default) and FR-4.43 (explicit, informed enable) rather than in-stream authentication. This trade-off shall be documented plainly in Settings, not silently assumed safe.

**FR-4.45 (New) — Resource Isolation:** The streaming server shall not compete for the same real-time processing budget as the ASR/voice pipeline (NFR-1) — multiple simultaneous stream consumers must not degrade voice command latency.

---

## 4.10 Authentication & Licensing (New in v1.10)

The only mandatory network dependency in OCS's architecture. Every other feature in this document degrades gracefully offline by design; this section is the deliberate exception, and its risk mitigations (FR-13.5, FR-13.6) exist specifically because it's an exception, not because the offline-first principle (NFR-9, NFR-25) was abandoned.

**FR-13.1 (Revised in v1.11) — Free/Guest Mode:** The Desktop Controller SHALL be usable without authentication — Bible display, Presentation, Scene, and Session all function in an unauthenticated "Free/Guest" mode. Login is optional, accessed via a "Log In via Browser" action in the sidebar (not a blocking gate on startup). What login unlocks — additional entitlements, seat management, paid-tier features — is defined in Section 4.11. This supersedes the v1.10 requirement that the app be entirely unusable without authentication; that requirement is retired, not merely unenforced.

**FR-13.2 (New) — Splash Screen (Both Platforms):** On launch, both Desktop and Mobile SHALL show a branded splash screen while: (a) checking for a valid cached session (FR-13.5), (b) initializing local resources that don't depend on auth (Bible SQLite, ASR model presence check). The splash screen transitions to either the main app (valid session found) or the Login screen (no valid session) — never to a blank/frozen state while this resolves.

**FR-13.3 (New) — Web-Redirect Login Flow (Desktop):** Login is performed via the system default browser, not an embedded webview (embedded webviews are a known phishing-risk anti-pattern and don't support the user's existing saved passwords/password manager autofill). Flow:

1. Desktop shows a "Log In" screen with a single action that opens the system browser to a hosted login page, passing a state parameter for CSRF protection.
2. The user authenticates on that web page (mechanism — email/password, OAuth providers, magic link — is a web-app implementation detail outside this desktop app's scope).
3. On success, the web page redirects to a custom URL scheme (e.g. `ocs://auth-callback?token=...&state=...`) that the OS hands to the already-running (or newly launched) Desktop app.
4. Desktop validates the returned `state` matches what it sent (FR-13.3 step 1) before accepting the token, to prevent a malicious redirect from injecting a session.

**FR-13.4 (New) — Secure Token Storage:** The session token SHALL be stored using the OS-native credential store (macOS Keychain, Windows Credential Manager, or equivalent) — never as plaintext in a config file or in `localStorage`-equivalent storage, given this token gates access to the entire app.

**FR-13.5 (New) — Cached Grace Period:** Once a valid session has been established, the Desktop app SHALL cache it and allow launch without a live connectivity check for a bounded grace period (default: 72 hours, configurable) before requiring re-validation. This exists specifically so a momentary or extended internet outage on a service day does not lock an operator out of a live church service after they've already successfully authenticated once. Re-validation SHALL happen silently in the background when connectivity is available, without interrupting an active session.

**FR-13.6 (New) — Explicit Logout & Re-Auth:** An operator can explicitly log out (clearing the cached token and requiring fresh authentication), and the app SHALL clearly distinguish "logged out" from "grace-period offline" states in its UI — an operator should never be confused about whether they're truly unauthenticated versus running on a cached grace-period session.

**FR-13.7 (New) — Mobile Companion Unaffected:** Mobile Companion does NOT get its own login. It continues to pair to the Desktop Controller exactly as specified in FR-6.1–FR-6.13, unchanged. Desktop's authenticated/licensed state gates whether pairing is available at all (an unauthenticated Desktop should not accept mobile pairing), but mobile itself has no separate credential to manage.

**FR-13.8 (New) — Deep-Link Registration Both Platforms:** Desktop (Electron) SHALL register a custom protocol handler (e.g. `ocs://`) via the OS at install time. If a mobile-side login is ever added in a future revision, the equivalent Expo mechanism is `expo-auth-session`'s standard redirect handling rather than a hand-rolled deep-link listener — noted here for forward compatibility, not required by this revision since FR-13.7 means mobile has no login to redirect back to yet.

**FR-13.8a (Resolved in this revision) — Canonical Callback URL Scheme:** The desktop app accepts exactly one callback URL format: **`ocs://auth/callback`** (slash, not hyphen). This was chosen because standard RFC 3986 URI parsers treat this as a proper hierarchical URI (`scheme: ocs`, `host: auth`, `path: /callback`), whereas the legacy hyphenated form (`ocs://auth-callback`) parses as a non-standard host with an empty path, causing inconsistent behavior across different URL parsers. `authService.js`'s `validateAuthCallback()` now strictly rejects any non-canonical format, including the legacy one. `AUTH_CONTRACT.md`, the web frontend's redirect construction, and the desktop test suite have all been updated to match.

---

## 4.11 Subscription Tiers, Permissions & Commercial Model (New in v1.11)

Documented directly from `ocs-backend` source (`User.js`, `PlanPermission.js`, `permissions.js`, `auth.js`) as of this revision — no longer provisional.

**FR-13.9 (New) — Subscription Trial Period:** A newly-registered account receives a **Trial** tier valid for **2 months (60 days)** from registration (`trialEndsAt`) — a business/billing concept, distinct from FR-13.5's 72-hour Offline Session Cache Grace Period (a technical connectivity tolerance). These two "grace" concepts must not be conflated in implementation or documentation.

**FR-13.10 (New) — Tier Structure and Quotas:** Six tiers exist, defined in `User.js`'s `PLAN_QUOTAS`:

| Tier     | Price                  | Billing       | Desktop Seats              | Mobile Seats               | Notes                                                                                                            |
| -------- | ---------------------- | ------------- | -------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Trial    | Free                   | 2 months      | 1                          | 3                          | Defaults to Mini-equivalent feature set; 60-day validity from `trialEndsAt`                                      |
| Free     | Free                   | Continuous    | 1                          | 1                          | Automatic downgrade destination on any expiry (FR-13.11); restricted to `timer.basic` and `broadcast.basic` only |
| Mini     | $2                     | 6 months      | 1                          | 3                          |                                                                                                                  |
| Standard | $3                     | 6 months      | 1                          | 5                          | Marked "Most Popular" in pricing UI                                                                              |
| Large    | $5                     | 6 months      | 2                          | 5                          |                                                                                                                  |
| Premium  | Custom ("Let's chat!") | Annual/custom | 99 (effectively unlimited) | 99 (effectively unlimited) | Includes `premium.full_access`, an unconstrained bypass unlocking all current and future permissions             |

**FR-13.11 (New) — Trial/Subscription Expiration Behavior:** When the Trial period (FR-13.9) or a paid tier's billing period elapses without renewal, the account's effective tier becomes **Free** (a downgrade, not a block) — the user is not locked out, consistent with FR-13.1's Free/Guest Mode principle.

**FR-13.12 (New) — Permission Taxonomy:** 22 permissions across 6 categories (`timer`, `session`, `broadcast`, `presentation`, `documents`, `worship`, `system`), each mapped to the tiers that include it:

| Key                   | Name                                | Category     | Tiers                                 |
| --------------------- | ----------------------------------- | ------------ | ------------------------------------- |
| `timer.basic`         | Basic Countdown & Service Timer     | timer        | all tiers                             |
| `broadcast.basic`     | Live Broadcast Output               | broadcast    | all tiers                             |
| `timer.start_time`    | Scheduled Start Timer               | timer        | large, premium                        |
| `timer.interval`      | Interval & Multi-Segment Timers     | timer        | standard, large, premium              |
| `timer.change_view`   | Custom Timer View & Skins           | timer        | standard, large, premium              |
| `session.recording`   | Automated Session Audio Recording   | session      | standard, large, premium              |
| `session.bumper`      | Broadcast Bumpers & Auto-Stitching  | session      | standard, large, premium              |
| `presentation.intro`  | Service Intro Video Bumpers         | presentation | large, premium                        |
| `presentation.outro`  | Service Outro & Benediction Wraps   | presentation | large, premium                        |
| `presentation.basic`  | General Presentation Engine         | presentation | trial, mini, standard, large, premium |
| `pdf.view`            | PDF Viewer & Sermon Notes           | documents    | trial, mini, standard, large, premium |
| `pdf.edit`            | PDF In-App Editor & Annotator       | documents    | standard, large, premium              |
| `slides.use`          | Custom Slide Designer               | presentation | standard, large, premium              |
| `scene.basic`         | Standard Scene Management           | presentation | trial, mini, standard, large, premium |
| `scene.animations`    | Dynamic Scene Animations            | presentation | large, premium                        |
| `scene.transitions`   | Cinematic Transitions               | presentation | large, premium                        |
| `song.basic`          | Hymn & Song Lyrics Projection       | worship      | trial, mini, standard, large, premium |
| `song.chorus_flow`    | Interactive Chorus Flow Loop        | worship      | large, premium                        |
| `song.repeat`         | Custom Song Section Repeat          | worship      | large, premium                        |
| `sing_along`          | Karaoke-Style Sing Along Guide      | worship      | large, premium                        |
| `read_along`          | Scripture Teleprompter & Read Along | worship      | large, premium                        |
| `premium.full_access` | Enterprise Unrestricted Full Access | system       | premium only                          |

Editable at runtime by `super_admin` via a dedicated admin console (FR-13.14).

**FR-13.13 (New) — Customer Type Classification:** Signup collects a customer type — `church` (default), `streamer`, or `podcast` — stored on the user record. Confirmed: this field has **zero functional branching anywhere in app core logic** (Desktop Controller, ASR, Presentation, Permissions, Mobile). Its only current effect is at signup, where `streamer`/`podcast` types map a provided `channelLink`/`podcastLink` to `churchName` if no name was otherwise given. It is registration metadata only, not a feature-gating mechanism, as of this revision.

**FR-13.14 (New) — Admin Tier & Permission Management, Restricted to Super Admin:** `PUT /auth/users/:id/tier`, `PUT /permissions/user/:id/tier`, and `PUT /permissions/toggle` allow overriding a user's tier or toggling tier-wide permissions. **These endpoints control real paid entitlements and SHALL be restricted to the `super_admin` role specifically** — a regular `admin` role must not be able to grant tier upgrades or alter permission definitions. _(Security note: an audit of the initial implementation found these three endpoints with no authentication or authorization enforcement at all — any unauthenticated request could modify any user's tier. This was flagged as a critical finding and corrected; this FR documents the intended, corrected access boundary, not the initial defective state.)_

**FR-13.15 (Corrected in v1.13) — Role Model Clarification: Both Admin Roles Are Platform Staff:** `admin` and `super_admin` are both internal platform-staff roles, not church-level roles. Customer accounts carry role `church_admin` (the account owner — one per customer, confirmed via production data) or `user`; neither carries any elevated backend permission — `church_admin` is a label distinguishing the account owner, not a permissions tier, and there is currently no per-church RBAC or scoped-admin concept anywhere in the codebase. `admin` (platform staff) is a support tier (customer table visibility, testimonial/ticket moderation); `super_admin` (platform staff) is the senior/ops tier with billing and entitlement authority (tier changes, permission toggles, account deletion — per FR-13.14). A future feature allowing a `church_admin` to grant a teammate limited access to their own church's account is explicitly out of scope for this revision and would require its own FRs if built later.

---

## 4.12 Desktop Auto-Update (New in v1.12)

**FR-14.1 (New) — Update Mechanism:** Desktop uses `electron-updater` against GitHub Releases as the update feed (consistent with GitHub Releases already being the recommended distribution host for installers per the web platform architecture). No separate update server is required.

**FR-14.2 (New) — Check Timing:** The app checks for updates on launch, and periodically thereafter (default: every 6 hours) while running. Checking never blocks app startup or usage — it happens in the background.

**FR-14.3 (New) — Silent Background Download:** Once an update is detected, it downloads silently in the background. The user is not interrupted during download, and clicking "Update Now" (FR-14.5) should feel instant, not trigger a fresh download at that moment.

**FR-14.4 (New) — Non-Blocking Notification:** When a downloaded update is ready, the app shows a small, dismissible notification (not a modal that steals focus or blocks interaction) — e.g. a subtle banner or badge, consistent with how other non-urgent state is surfaced elsewhere in the app (the grace-period-offline indicator, FR-13.6, is a reasonable pattern to match). The user can dismiss it and keep working without being nagged repeatedly in the same session.

**FR-14.5 (New) — Two Install Paths:**

- **"Update Now"** — an explicit user action that quits and relaunches the app immediately at the new version.
- **Defer to natural restart** — if the user takes no action, the update is NOT force-installed. It applies automatically the next time the user closes and reopens the app on their own, per `electron-updater`'s standard `autoInstallOnAppQuit` behavior.
  There is no third path where the app auto-restarts itself unprompted — see FR-14.6.

**FR-14.6 (New) — Live-Session Safety, the Primary Constraint:** The app SHALL NEVER auto-restart itself or force an update to apply while a live session is active — defined as: a Scene, Presentation, or Bible passage is currently being broadcast to General/Speaker View, a Session recording is in progress, or the primary/secondary voice pipeline is actively listening. Specifically:

- If "Update Now" is clicked while a live session is active, show a clear warning ("A service appears to be live — updating now will interrupt it. Update anyway, or wait until after the service?") rather than proceeding silently.
- The periodic background check (FR-14.2) and silent download (FR-14.3) are always safe to run regardless of session state, since they don't affect the running app. Only the actual restart-to-install step is session-state-sensitive.
- This requirement exists because the consequence of getting it wrong is not a crashed app the user can just reopen — it's a live church service losing its display output mid-sermon or mid-worship, with a room full of people watching it happen.

**FR-14.7 (New) — Code Signing Dependency:** Auto-update via `electron-updater` requires the app be code-signed (macOS Developer ID + notarization, Windows Authenticode) — unsigned or ad-hoc-signed builds have unreliable or blocked self-update behavior, particularly on macOS. This ties directly to the code-signing prerequisite already identified as a production-build blocker.

**FR-14.8 (New) — Update Failure Handling:** If a download or install fails, the app SHALL fail gracefully — continue running the current version without disruption, log the failure, and retry on the next periodic check rather than repeatedly interrupting the user or entering a broken state.

---

## 4.13 Transactional Email & Password Reset (New in v1.13)

**FR-15.1 (New) — Email Provider:** The backend uses Resend as its transactional email provider (free tier: 100/day, 3,000/month — sufficient at current and near-term expected volume). Chosen over SMTP-based free options (e.g. Gmail SMTP via Nodemailer) specifically because those carry real deliverability and account-suspension risk for automated sending; Resend's HTTP API is also a natural fit for the serverless Netlify Functions architecture (no persistent SMTP connection to manage per invocation).

**FR-15.2 (New) — Email Triggers:** The following events send an email:

- New ticket submitted → notification to platform staff.
- Ticket status changed → notification to the original submitter.
- Password reset requested (FR-15.3) → reset link to the requesting user.
- New account signup → welcome/confirmation email.

**FR-15.3 (New) — Password Reset Flow (closes a previously-existing gap):** Prior to this revision, no self-service password recovery existed anywhere in the auth system — a locked-out user had no path back into their account short of manual database intervention by a super_admin, which is not an acceptable ongoing support model.

- `POST /auth/forgot-password` (email only, public) — generates a single-use, time-limited (default: 1 hour) reset token, stores its hash (never the raw token) in the database, and emails a reset link containing the raw token. Always returns a generic success response regardless of whether the email exists in the system, to avoid leaking which emails are registered.
- `POST /auth/reset-password` (token + new password, public) — validates the token against its stored hash and expiry, and if valid, updates the password (bcrypt-hashed, per the existing standard) and invalidates the token so it cannot be reused.
- Rate-limit `POST /auth/forgot-password` per email/IP, consistent with the rate-limiting already applied to login (FR-13.x's existing pattern) — this endpoint is a realistic target for enumeration/abuse otherwise.

---

## 4.14 Web Platform Real-Time Dashboard, WebSocket Notification Feed & Downloads API (New in v1.14)

**FR-16.1 (New) — WebSocket Real-Time Notification Bus:** `ocs-backend` initializes Socket.IO supporting bidirectional events across connected administrative clients. When platform events occur (e.g., ticket submissions, user suggestions, testimonials, app downloads), the server emits `admin:notification` and `admin:metrics` payloads to the authenticated `admin-room` channel.

**FR-16.2 (New) — Admin Live Notification Dropdown & Toast Feeds:** The web portal (`ocs-web` in `AdminLayout.tsx`) subscribes to real-time WebSocket events to:
- Instantly increment the notification badge counter without polling.
- Render dismissible toast alerts with deep-link navigation to the appropriate admin section (`/admin/tickets`, `/admin/downloads`, `/admin/suggestions`).
- Provide an interactive notification dropdown with time-ago formatting, category badges, and direct navigation.

**FR-16.3 (New) — Live Dynamic Dashboard Analytics:** `AdminDashboard.tsx` consumes live API endpoints (`GET /api/admin/downloads`, `GET /api/admin/users`, `GET /api/tickets`) to compute:
- Real-time KPI summaries: Total Downloads, Active Registered Accounts, Open Support Tickets, Active 60-Day Trials.
- Dynamic 6-tier subscription plan distribution breakdown.
- Client platform split (macOS, Windows, Android, iOS) with visual progress bars.
- 6-month monthly download trend timeline charts.

**FR-16.4 (New) — App Download Logging & Audit Analytics:**
- Client download buttons (`DownloadPage.tsx`) trigger `POST /api/downloads` recording client OS platform (`mac`, `windows`, `android`, `ios`) and application version.
- Administrative downloads page (`AdminDownloads.tsx`) queries `GET /api/admin/downloads` to display an audited timeline table of all installations with church name, country, version tag, and platform pie charts.

**FR-16.5 (New) — Web Navigation Streamlining:** Deprecated settings navigation links are removed from web management layouts to maintain an uncluttered operational portal.

---

## 4.15 Desktop Tier 2 Session & Bumper Gating, and Agenda Planner (New in v1.14)

**FR-17.1 (New) — Tier 2+ Feature Gating for Sessions & Bumpers:** Access to the Sessions Archive controller and broadcast Bumpers (intro/outro stitching) requires `session.recording` and `session.bumper` permissions, which are included exclusively in Tier 2+ (`standard`, `large`, `premium`) plans.

**FR-17.2 (New) — DisabledContainer Upgrade Interface:** When a Tier 1 user (`free`, `mini`, `trial`, `guest`) visits Sessions or Bumpers, the UI renders `DisabledContainer` stating:
> *"Sessions Archive, automated sermon audio recording, and sermon PDF generation are available exclusively on Tier 2 (Standard, Large, or Premium) plans. Upgrade your subscription to unlock automatic recording."*

**FR-17.3 (New) — Tier 1 Audio Capture Bypass:** When a timer countdown or agenda item starts on a Tier 1 account (or when audio recording is disabled for that session), `sessionArchive.js` and `sessionAudio.js` skip audio chunk buffering and FFmpeg encoding entirely, creating lightweight metadata-only logs without consuming disk space or audio resources.

**FR-17.4 (New) — Agenda Planner Modal Interface:** In `TimerController.js`, Tier 2+ operators can open the **Agenda Planner** (`AgendaPlannerModal.jsx`) to:
- Selectively enable or disable audio recording on a per-session basis or bulk toggle ("Record All" / "None").
- Configure automated media cues across the lifecycle of each agenda session.

**FR-17.5 (New) — Start Media Cues:** Operators can configure actions triggered when an agenda session starts:
- Set solid background color on display canvas.
- Trigger intro video bumper playback.
- Play intro audio chime or announcement.

**FR-17.6 (New) — Mid-Run Warning Cues:** Operators can configure cues for the middle/warning phase of a running session:
- Flash amber warning background color at 10s or half-time threshold.
- Play audible warning chime.
- Display intermediate prompt image.

**FR-17.7 (New) — Completion Cues:** Operators can configure actions executed when a session timer completes (`00:00:00`):
- Automatic blackout of presentation display.
- Trigger outro video bumper playback.
- Play closing audio chime / benediction wrap.

**FR-17.8 (New) — Dual-Action Timer Editing:** In `TimerController.js`, the timer editor provides distinct **"Add"** (accumulates entered minutes to current remaining time) and **"Update"** (replaces set duration with entered time) actions, while continuously updating label and speaker metadata across both actions.

---

## 4.16 Mobile Authentication, 1-Hour Offline Guest Evaluation & Companion Sign-In (New in v1.14)

**FR-18.1 (New) — 1-Hour Offline Guest Evaluation Session:**
- When an operator launches the OCS Mobile Companion (`ocs-mobile`) without logging in, a 1-hour (3600 seconds) unauthenticated evaluation window begins.
- The evaluation timer is persisted locally (via JSON storage on native devices and `localStorage` on web), ensuring app restarts or backgrounding do not reset the 1-hour quota.
- Wall-clock synchronization enforces expiration even when the mobile device is completely offline or not connected to the internet.

**FR-18.2 (New) — Full-Screen Guest Expiration Gate (`GuestExpiredGate.tsx`):**
- When the 1-hour unauthenticated window expires (`guestExpired === true` and `!isAuthenticated`), the app presents a blocking full-screen modal lock gate.
- The lock gate informs the user:
  > *"Your 1-hour unauthenticated guest evaluation window has concluded. Sign in with your OCS account to unlock stage controls, lyric projection, teleprompter, and your full 60-Day Free Trial."*
- Provides direct navigation to the Mobile Sign-In screen (`/login`) or workstation QR pairing.

**FR-18.3 (New) — Mobile Companion Login Screen (`/login` in `app/login.tsx`):**
- A dedicated, high-performance mobile authentication screen connecting directly to the OCS API (`POST /api/auth/login`).
- Includes Email and Password inputs with visibility toggles, client-side validation, haptic feedback, and error handling.
- Optional expandable Advanced Server configuration for testing against custom backend endpoints.
- Provides deep links to account registration (60-Day Free Trial) and password reset flows.

**FR-18.4 (New) — Dashboard Auth & Session Status Indicator:**
- The mobile dashboard header displays a real-time session badge:
  - When unauthenticated: Displays `Guest: XXm` remaining time pill in amber. Tapping opens the `/login` screen.
  - When authenticated: Displays the user's name, church affiliation, and plan badge.
- The connection menu modal provides quick account management and 1-tap Sign Out capabilities.

---

## 4.17 Standardized 60-Day Free Trial & Automatic Desktop Workstation Registration (New in v1.14)

**FR-19.1 (New) — Strict 60-Day (2-Month) Trial Calculation:**
- All trial subscriptions across `ocs-backend` (`User.js`, `auth.js`) and `ocs-web` (`AdminUsers.tsx`) strictly enforce a **60-day (2-Month)** evaluation duration (`Math.min(60, Math.max(0, trialRemainingDays))`).
- Prevents legacy 3-month (90-day) computation drift in grace period handlers.
- Both customer dashboards and in-house administrative user tables reflect the accurate remaining day count without exceeding the 60-day cap.

**FR-19.2 (New) — Automatic Desktop Device Registration & Quota Tracking:**
- When an operator authenticates on a desktop workstation (via browser callback, login portal, or direct token validation in `authService.js`), the desktop client automatically transmits hardware platform and machine identifiers (`x-ocs-platform: desktop`, `deviceId`).
- `ocs-backend` updates the church's license quotas (`licenseQuotas.activeDesktops`), registering the station if new or updating its `lastActiveAt` timestamp.
- Web administrative portals (`AdminUsers.tsx`) accurately reflect current workstation usage (e.g., `1 / 1` or `1 / 2` desktops active).

---

## 4.18 Cross-Platform Project Documentation & Ecosystem Branding (New in v1.14)

**FR-20.1 (New) — Platform-Specific Project READMEs:**
- Dedicated, product-focused documentation across all four project repositories (`ocs-web`, `ocs-mobile`, `OCS` desktop, and `ocs-backend`) emphasizing the mission, worship presentation capabilities, customer experience, and ministry value proposition.
- All documentation prominently credits **CEO & Founder: Are Oluwasegun Johnson**.

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

#### 5.5.1 Scene Read-Along Auto-Advance (New in v1.8)

The Scene feature's Read-Along mode (FR-4.29) is the fourth caller of the shared `referenceAligner.js` engine (alongside scripture read-along and free-text teleprompter), adding one new capability: automatic page transition on completion, not just in-page word tracking.

**FR-5.36 (New) — Page-Complete Detection:** While a Scene is active in Read-Along mode, the reference aligner treats the current Page's text as the reference. When the aligner's `wordIndex` reaches the final token of the Page (per the existing FR-5.31 fuzzy match, edit distance ≤2), the Page is marked `complete`.

**FR-5.37 (New) — Debounced Auto-Advance:** On a Page reaching `complete` (FR-5.36), the Scene shall wait a short debounce window (default 500ms, configurable) before transitioning to the next Page — long enough to avoid firing on a premature/false early match mid-sentence, short enough that the transition reads as immediate to the congregation. If speech continues past the final token within the debounce window without a clean sentence break, the debounce resets once (prevents advancing mid-thought on a false match) but does not retry indefinitely — after one reset, FR-5.38's fallback applies.

**FR-5.38 (New) — No-Match Fallback:** If no forward match is found for 4 seconds after entering the debounce window (per FR-5.37) — e.g. the speaker paraphrases rather than reads verbatim — the Scene does **not** auto-advance and instead surfaces a debug-bar prompt (mirroring the FR-3.19 "Did you mean?" pattern) offering a one-click manual advance, rather than silently stalling with no operator visibility.

**FR-5.39 (New) — Manual Override Always Available:** Regardless of Read-Along state, `Space`/Controller click/Mobile Companion next (FR-4.29's Manual mode controls) remain active as an override in Read-Along mode too — an operator can always force-advance a stuck or mis-tracking page without switching the Scene's mode.

---

## 6. Non-Functional Requirements

### 6.1 Performance

_(Unchanged from v1.6 — NFR-1 through NFR-8. NFR-1's <3s target applies regardless of active engine; whisper.cpp's chunk-based finals must still land within this budget — flagged as a soak-test item in the Roadmap.)_

### 6.2 Reliability

_(Unchanged from v1.6 — NFR-9 through NFR-15.)_

### 6.3 Compatibility

_(Unchanged from v1.6 — NFR-16 through NFR-19.)_

**NFR-37 (New) — macOS Microphone Entitlement:** The app shall declare `NSMicrophoneUsageDescription` in its Info.plist with church-context-appropriate copy, and shall handle the OS-level "mic access revoked" state gracefully (debug bar shows `error: mic-permission-denied` with a direct link to System Settings) rather than silently failing to transcribe. Continuous background listening while the app is not the focused window is a macOS behavior that should be explicitly tested, not assumed, during Phase 6 beta.

**NFR-38 (New) — Cross-Platform Video Codec Consistency:** Electron's native H.264 decode support is not guaranteed identical between Windows and macOS builds (dependent on proprietary-codec build flags). Per FR-4.32, this risk is mitigated by transcoding all imported video to VP9/WebM on ingest rather than depending on host-platform native codec support — this NFR exists to make that mitigation a tracked requirement, not just a Dockerfile-style implementation detail buried in an FR.

**NFR-39 (New) — Layer Transform Resolution Independence:** Pinned-layer position/size (FR-4.20) shall render pixel-identically (within normal sub-pixel rounding) across all display resolutions covered by NFR-19's 1/2/3-monitor support, verified by the normalized-coordinate storage model in FR-4.20 rather than assumed.

**NFR-40 (New) — Mic/Video-Audio Feedback Isolation:** Background and Pinned video layers default to muted (FR-4.19) specifically to prevent their audio output from being picked up by the always-on primary mic (FR-3.1) and misinterpreted as speech — a video's own audio track re-entering the ASR pipeline is a realistic false-trigger source that doesn't exist for image layers. If an operator explicitly unmutes a video layer, the existing FR-3.2 hardware echo cancellation is the mitigation of record, but this NFR flags it as a known-risk interaction requiring real-world validation (a live sermon video played at speaker-audible volume during a service is the realistic test case), not an assumption that echo cancellation trivially solves it.

**NFR-41 (New) — Import Pipeline Performance Budget:** Video normalization (FR-4.32) for a typical 2–5 minute media clip shall complete in under 60 seconds on reference mid-range hardware, with the operator able to continue using the rest of the app (Bible control, Scene editing) while a transcode runs in the background — the import pipeline must not block the main UI thread or the ASR pipeline's real-time budget (NFR-1).

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

| Risk                                                                                                                                                               | Likelihood                   | Impact                                       | Mitigation                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Spec/implementation drift between "Vosk" FRs and whisper.cpp-as-default architecture note (v1.6 issue)**                                                         | High (already occurred once) | High                                         | FR-3.65 ASR Adapter contract + explicit `[Vosk-fallback only]` FR tagging going forward; any new voice FR must state which engine(s) it applies to                                                                                                    |
| **Global pairing token can't support per-device revocation as promised by FR-7.4**                                                                                 | Medium                       | Medium                                       | FR-6.11 per-device session tokens issued at pairing time                                                                                                                                                                                              |
| **6-digit fallback pairing code brute-forceable on shared Wi-Fi**                                                                                                  | Low–Medium                   | High                                         | FR-6.12 rate limit + lockout                                                                                                                                                                                                                          |
| **"Next"/"previous" ambiguous between scripture and presentation voice commands**                                                                                  | Medium                       | Medium                                       | FR-5.32 central `activeDisplayContext` + FR-4.9 explicit-phrasing preference in grammar/alias tables                                                                                                                                                  |
| **Compound book names with ordinal prefixes ("First Corinthians") mis-parsed by structural shape gate**                                                            | Medium                       | Medium                                       | FR-3.69 ordinal-prefix exception in `matchReferenceShape`                                                                                                                                                                                             |
| **Teleprompter/read-along cursor gets permanently stuck after a legitimate backtrack**                                                                             | Medium                       | Medium                                       | FR-5.34 bounded backward resync                                                                                                                                                                                                                       |
| **Session archive records congregation members' voices without their individual consent**                                                                          | Medium                       | High (legal exposure varies by jurisdiction) | FR-5.17 notice covers operator/church-level consent only; church leadership should be advised this is a policy/legal decision, not something OCS can fully solve technically — recommend visible signage as a complementary, non-technical mitigation |
| **macOS revokes mic permission mid-service (OS update, user action) with no graceful in-app recovery**                                                             | Low                          | Critical                                     | NFR-37 explicit permission-denied state + guided recovery in debug bar                                                                                                                                                                                |
| **A video layer's own audio is picked up by the always-on primary mic and misinterpreted as a voice command** (new in v1.8)                                        | Medium                       | Medium                                       | FR-4.19 mute-by-default for video Background/Pinned layers; NFR-40 flags this as needing real-world validation even with echo cancellation active                                                                                                     |
| **Windows/macOS video codec inconsistency causes an imported clip to play on the operator's Mac dev machine but fail silently on a church's Windows install (V2)** | Medium                       | High                                         | FR-4.32 mandatory VP9/WebM transcode-on-import removes dependence on host-platform native codec support entirely                                                                                                                                      |
| **Scene read-along auto-advances mid-sentence on a false early word match, jumping ahead before the preacher finishes a page**                                     | Medium                       | Medium                                       | FR-5.37 debounce window + FR-5.38 no-match fallback with visible prompt instead of silent stall; FR-5.39 manual override always available as a backstop                                                                                               |
| **Pinned layer or Background pan position doesn't translate correctly between a 1-monitor and 3-monitor church setup**                                             | Low–Medium                   | Medium                                       | FR-4.20 normalized (0.0–1.0) coordinate storage instead of absolute pixels; NFR-39 tracks this as a verified requirement                                                                                                                              |
| **Auto-update installs mid-service because "live" was previously undefined**                                                                                       | Low                          | Critical                                     | NFR-28 now ties directly to the FR-5.9 timer lifecycle bus state                                                                                                                                                                                      |

---

## 9. Roadmap

**See companion file `OCS_Project_Phases.md` for the full phased breakdown.** As of v1.8, the Media, Scene, Text & Presentation Suite (Section 4.4) is placed in **Phase 2**, alongside the existing Bible & Display work — both build directly on the same Controller/Speaker/General IPC rendering model, so building them together avoids a rework pass later. The Timer Controller and Session Folder phases remain untouched, as they have been since v1.7.

---

## 10. Out of Scope — V1

_(Unchanged from v1.6.)_

---

## 11. Glossary

_(All v1.6 terms carried forward. New terms below.)_

| Term                   | Definition                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ASR Adapter            | The `AsrAdapter` interface (FR-3.65) that abstracts whisper.cpp and Vosk behind a single `onPartial`/`onFinal` contract                                                                                             |
| Synthesized partial    | A UI-feedback-only interim transcript produced by re-inferring whisper.cpp on a growing buffer (FR-3.67), distinct from Vosk's native partials                                                                      |
| Active display context | The single source of truth (`scripture` \| `presentation` \| `teleprompter` \| `idle`) used to disambiguate context-dependent voice commands like "next" (FR-5.32)                                                  |
| Master pairing token   | The launch-scoped token used only for the initial mobile pairing handshake (FR-6.10)                                                                                                                                |
| Session token (device) | A per-device token issued after pairing, used for all subsequent command traffic and independently revocable (FR-6.11)                                                                                              |
| Reference aligner      | The shared module (`referenceAligner.js`) that powers both scripture read-along and free-text teleprompter (FR-5.31)                                                                                                |
| Backward resync        | A bounded, rate-limited correction that lets the reference aligner's cursor move backward when the speaker legitimately backtracks (FR-5.34)                                                                        |
| Display Canvas         | The single compositor (`DisplayCanvas.js`) rendering Background, Content Slot, Pinned Layers, and Chrome as ordered bands (FR-4.13)                                                                                 |
| Content Slot           | The one active content type at a time (`bible` \| `scene` \| `presentation` \| `timer` \| `none`) rendered in the Display Canvas's second band (FR-4.13)                                                            |
| Background Layer       | A canvas-filling image/video, independent of the Content Slot, pannable via arrow keys (FR-4.17–FR-4.19)                                                                                                            |
| Pinned Layer           | A persistent image/video/text layer that survives Content Slot changes, positioned via adjusting nodes (FR-4.20–FR-4.23)                                                                                            |
| Adjusting nodes        | Drag handles (corner/edge) used to resize and reposition a Pinned layer in Edit Mode (FR-4.20)                                                                                                                      |
| Scene (feature)        | A named, ordered set of Pages (text or lyrics) with Read-Along or Manual/Mobile-Controlled page-advance (FR-4.28–FR-4.31) — not to be confused with the general "scene" terminology used by other compositing tools |
| Page-complete          | The state when the reference aligner's cursor reaches the final token of a Scene Page, triggering the FR-5.37 auto-advance debounce                                                                                 |

---

_OCS PRD v1.8 — August 2026_
