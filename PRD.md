# OCS — Organised Church Service

## Product Requirements Document (PRD)

**Author:** Are Oluwasegun Johnson
**Version:** 1.1
**Last Updated:** April 2026
**Status:** Active Development

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

|            |                                                                         |
| ---------- | ----------------------------------------------------------------------- |
| **For**    | Church media operators and worship leaders                              |
| **Who**    | Struggle with fragmented, click-heavy AV tools during live service      |
| **OCS is** | A unified, voice-first church service management platform               |
| **That**   | Controls scripture, media, and timers from a single offline desktop app |
| **Unlike** | ProPresenter, EasyWorship, and MediaShout                               |
| **OCS**    | Requires zero manual clicks during a live message via AI voice commands |

### 1.3 Problem Statement

Most church AV setups are deeply fragmented: one tool for Bible projection, another for timers, another for slides — and nothing purpose-built for voice-driven, hands-free operation during a live service. Operators must manually click through verses while simultaneously trying to follow a preacher who may jump to an unplanned scripture at any moment. This causes delays, missed verses, blank screens in front of congregations, and extreme cognitive load on volunteers who are often untrained.

### 1.4 Solution

OCS unifies all service display functions into a single Electron desktop application with:

- A **Controller Window** (operator's screen) for full, real-time control of all displays
- A **Speaker View** (stage monitor / secondary display) for the preacher — showing current verse, upcoming content, and timer
- A **General View** (projector / audience display) showing scripture and media to the congregation
- A **Mobile Companion App** (React Native / Expo) for remote control by worship leaders from the stage
- An **AI-powered voice engine** using offline Whisper ASR for completely hands-free, zero-delay scripture control
- An **Order of Service planner** for pre-service setup and in-service flow management

---

## 2. Target Users & Personas

### 2.1 Persona 1 — The Overwhelmed Media Operator

|                 |                                                |
| --------------- | ---------------------------------------------- |
| **Name**        | Daniel, 24                                     |
| **Role**        | Volunteer media operator, 1–2 years experience |
| **Environment** | Mid-sized church, 300–800 congregation         |

**Pain Points:**

- Preacher jumps to unplanned verses mid-sermon with no warning
- Must find verse, navigate tree, select, and click — all under live pressure in seconds
- Misses verses because he's watching the screen, not the preacher
- No way to know what's coming next — no preview of upcoming content
- When something breaks, recovery is slow and congregation sees a blank screen

**Jobs To Be Done:**

- Follow the preacher without friction or cognitive load
- Never show a blank screen to the congregation
- Recover in under 5 seconds when something goes wrong
- Know what's coming next without asking the preacher

**OCS Solution:** Voice commands eliminate clicks entirely. Speaker View shows next verse. Service queue prevents surprises. Crash recovery restores state in seconds.

---

### 2.2 Persona 2 — The Worship Leader

|                 |                                                        |
| --------------- | ------------------------------------------------------ |
| **Name**        | Adaeze, 31                                             |
| **Role**        | Worship leader, controls music and service transitions |
| **Environment** | On stage, often 10–15m from media desk                 |

**Pain Points:**

- Must physically walk back to the media desk to change scripture or timer
- Generic phone AV apps have no understanding of church context
- Loses worship flow and momentum every time she needs to change a slide

**Jobs To Be Done:**

- Control display content and timers from the stage without breaking flow
- Trust that what she sends from her phone appears instantly on screen
- Build the verse setlist before service, not during

**OCS Solution:** Mobile companion app with full verse control, queue management, and timer — purpose-built for church use, over local Wi-Fi with no cloud dependency.

---

### 2.3 Persona 3 — The Senior Pastor

|                 |                                                        |
| --------------- | ------------------------------------------------------ |
| **Name**        | Pastor Emmanuel, 52                                    |
| **Role**        | Lead preacher                                          |
| **Environment** | Pulpit, facing congregation, back to projection screen |

**Pain Points:**

- Cannot see what's on the projector from the pulpit
- No visible countdown timer during sermon — relies on signals from the operator
- Has to manually signal the media operator when changing scripture

**Jobs To Be Done:**

- Know exactly what the congregation is seeing at all times
- Track remaining sermon time without checking a watch
- Move confidently through scripture knowing the display will follow

**OCS Solution:** Speaker View stage monitor shows current displayed verse and live countdown. Voice commands mean the display follows speech naturally.

---

### 2.4 Persona 4 — The Church Tech Lead

|                 |                                                     |
| --------------- | --------------------------------------------------- |
| **Name**        | Bola, 38                                            |
| **Role**        | Technical director, manages AV setup and volunteers |
| **Environment** | Sets up the system weekly, trains new operators     |

**Pain Points:**

- Onboarding new volunteers to complex AV tools takes hours
- Systems that require internet access are a liability on service day
- Hard to troubleshoot live issues without disrupting the service

**Jobs To Be Done:**

- Set up the full system in under 15 minutes on service day
- Train a new operator to be functional in one session
- Diagnose and fix audio/display issues without restarting the app

**OCS Solution:** First-run wizard, always-visible debug bar, one-click Sync recovery, and full offline operation.

---

## 3. Platform & Technical Stack

### 3.1 Desktop Application (OCS Controller)

| Layer          | Technology                            | Rationale                                         |
| -------------- | ------------------------------------- | ------------------------------------------------- |
| Runtime        | Electron 30                           | Cross-platform, Chromium renderer, Node.js access |
| Frontend       | React 18 + Redux Toolkit              | Component model, predictable state                |
| Styling        | Tailwind CSS 3                        | Utility-first, fast iteration                     |
| Bundler        | Webpack 5 (dual-bundle)               | Controller + View windows bundled separately      |
| Database       | SQLite3 (better-sqlite3)              | Local Bible DB, instant queries, no network       |
| AI Engine      | Python `faster-whisper` sidecar (primary) + `@xenova/transformers` WASM (fallback) | 4–8× faster offline ASR; auto-fallback if Python unavailable |
| Noise Filter   | `noisereduce` (spectral subtraction) + enhanced VAD (ZCR + voicing score) | Rejects HVAC/crowd noise before ASR sees audio |
| Audio          | Web Audio API + AudioWorklet          | VAD pipeline, waveform, high-pass filter          |
| Communication  | Electron IPC                          | Main ↔ renderer, zero-latency                     |
| Remote Server  | Express.js + Socket.IO (LAN)          | Mobile companion communication                    |
| PPTX Support   | `pptx-glimpse`                        | Slide-to-PNG conversion for presentation          |
| Auto Update    | electron-updater                      | Background download, operator-approved install    |
| Error Tracking | Sentry (local-only mode)              | Crash reports without sending audio/content data  |

### 3.2 Mobile Companion App (OCS Mobile)

| Layer     | Technology                   | Rationale                                |
| --------- | ---------------------------- | ---------------------------------------- |
| Framework | React Native (Expo)          | iOS + Android from one codebase          |
| Language  | TypeScript                   | Type safety, shared types with desktop   |
| Styling   | NativeWind (Tailwind for RN) | Consistency with desktop styling system  |
| State     | Redux Toolkit                | Shared state patterns with desktop       |
| Transport | Socket.IO Client             | Real-time LAN communication with desktop |
| Haptics   | expo-haptics                 | Tactile confirmation of remote actions   |

---

## 4. Core Features

### 4.1 Multi-Window Display System

**FR-1.1** — The app shall open three windows on launch:

- **Controller Window** — Primary operator display; full management UI
- **Speaker View** — Stage monitor; current verse, next queue item, countdown timer
- **General View** — Projector/audience display; scripture and media only

**FR-1.2** — Monitor detection shall auto-assign windows:

- 1 monitor: All windows in preview panes within Controller
- 2 monitors: Controller on primary, Speaker View on secondary (fullscreen)
- 3 monitors: Controller primary, Speaker View secondary, General View tertiary (fullscreen)
- Manual override available in Settings for non-standard setups

**FR-1.3** — All windows shall receive synchronised content via Electron IPC:

- `activate_set_content` — push verse or media to displays
- `activate_set_timer` — sync timer state across all windows
- `activate_set_style` — broadcast style/theme changes in real time
- `activate_set_queue` — sync service queue position

**FR-1.4** — Closing the Controller Window shall prompt for confirmation, then quit the application entirely.

**FR-1.5** — Global keyboard shortcuts shall be available from any focused window:

| Shortcut       | Action                                 |
| -------------- | -------------------------------------- |
| `B`            | Black out General View instantly       |
| `L`            | Show OCS logo/branding on General View |
| `Space`        | Advance to next item in service queue  |
| `← / →`        | Previous / next verse                  |
| `Cmd/Ctrl + F` | Open verse search                      |
| `Cmd/Ctrl + T` | Focus timer input                      |
| `Esc`          | Clear all content / reset display      |
| `F11`          | Toggle fullscreen on General View      |

All shortcuts configurable in Settings.

---

### 4.2 Bible Controller

**FR-2.1** — The controller shall load the full 66-book KJV Bible from a local SQLite database (`bibles.db`) with instant query response (< 50ms).

**FR-2.2** — Users shall be able to browse books, chapters, and individual verses from a structured tree UI with collapse/expand state persisted between sessions.

**FR-2.3** — Selected verses shall be pushed live to Speaker View and General View simultaneously via IPC.

**FR-2.4** — Multi-verse selection shall be supported (e.g. John 3:16–18), displaying all selected verses as a single content block.

**FR-2.5** — Current verse context (book, chapter, verse, text) shall be tracked in memory for relative voice navigation.

**FR-2.6** — Multiple Bible translations shall be supported:

- KJV — bundled offline (default)
- NIV, ESV, AMP — downloadable offline packs (< 20MB each)
- Translation switcher in toolbar; voice command: _"OCS switch to NIV"_
- Current translation displayed persistently in the status bar

**FR-2.7** — Full-text verse search shall be available across all books:

- `Cmd/Ctrl + F` opens search panel
- Results show book, chapter, verse, and text excerpt
- Keyword highlighted in results
- One-click to push result to display

**FR-2.8** — A recently displayed verses panel shall show the last 10 verses sent to the General View, with one-click re-display.

---

### 4.3 Voice Command Engine

The voice system is the flagship differentiator of OCS. It must be fast, accurate, and fully offline.

#### 4.3.1 Architecture

**FR-3.1** — Continuous background voice activation — no push-to-talk required during service.

**FR-3.2** — Audio capture via Web Audio API at 16kHz with:

- Hardware echo cancellation
- Noise suppression
- Auto-gain control
- 2× software pre-amp gain boost
- 100Hz high-pass filter (removes HVAC/room rumble)

**FR-3.3** — Voice Activity Detection (VAD) via AudioWorklet (`audio.processor.js`) computing RMS volume per 2,048-sample chunk. Speech declared active when RMS > 0.005.

**FR-3.4** — Transcription via **Whisper Base (English)** loaded via `@xenova/transformers` in a Web Worker — fully offline after initial model download.

**FR-3.5** — The AI model shall pre-load on app launch. A non-blocking progress indicator in the debug bar shows load status. The app remains fully usable (manual control) while the model loads.

#### 4.3.2 Trigger Words

**FR-3.6** — Two primary trigger keywords are supported (both configurable in Settings):

| Keyword | Use Case | Example |
| ------- | -------- | ------- |
| **"OCS"** | Default; phonetically safer in noisy environments | _"OCS John three sixteen"_ |
| **"Media"** | Legacy / preference; shorter to say | _"Media John three sixteen"_ |

Recognised Whisper mishearing variants:

- **OCS:** _oh-see-ess, oasis, obvious, osiris, ocean, o-s-c, oc-s_
- **Media:** _meeting, meter, medium, video, median, me the, need a, meet a_

Additional configurable trigger words per church preference (e.g. "Display", "Screen", "Activate").

#### 4.3.3 Speech Capture Pipeline

**FR-3.7** — A 500ms pre-roll buffer (5 audio chunks) shall be prepended to every captured utterance to prevent clipped word starts.

**FR-3.8 — Mid-speech keyword probe:** After 1.5s of continuous speech, the system sends a snapshot to the worker as a lightweight `probe` request. If the trigger word is detected while the user is still speaking, full transcription fires immediately without waiting for silence.

**FR-3.9 — Short utterance fast-fire:** When speech stops and estimated word count is ≤ 5 words (chunk count ÷ 2.3), transcription fires after 200ms of silence.

**FR-3.10 — Standard silence threshold:** For longer utterances, transcription fires after 900ms of silence.

**FR-3.11** — Emergency force-trigger fires after 15 seconds of unbroken speech to prevent buffer overflow.

**FR-3.12** — A 5-second watchdog timer cancels and resets any hanging transcription job.

#### 4.3.4 Confidence Gating

**FR-3.13** — If Whisper transcription confidence score < 0.65, the result shall be silently discarded.

- Debug bar logs: `LOW CONFIDENCE — ignored (score: 0.52)`
- Prevents false triggers from background noise or distant voices
- Confidence threshold configurable in Settings (range: 0.50–0.85)

#### 4.3.5 Command Recognition

**FR-3.14** — Supported natural language commands (either **"OCS"** or **"Media"** as trigger):

| Command Type                 | Example Phrase                                              |
| ---------------------------- | ----------------------------------------------------------- |
| Scripture lookup             | _"OCS John three sixteen"_ / _"Media John three sixteen"_  |
| Book + chapter only          | _"OCS Genesis one"_ (defaults to verse 1)                  |
| Verse-only jump (in-context) | _"Media verse twenty-six"_                                  |
| Chapter jump (in-context)    | _"OCS chapter four"_                                        |
| Next verse                   | _"OCS next"_ / _"Media next"_                              |
| Previous verse               | _"OCS previous"_ / _"Media go back"_                       |
| Highlight word               | _"OCS highlight grace"_                                     |
| Highlight range              | _"Media mark from God to world"_                            |
| Unmark word                  | _"OCS remove grace"_                                        |
| Clear highlights             | _"Media clear highlights"_                                  |
| Switch translation           | _"OCS switch to NIV"_                                       |
| Set timer                    | _"Media set timer forty-five minutes"_                      |
| Start timer                  | _"OCS start timer"_                                         |
| Pause timer                  | _"Media pause timer"_                                       |
| Next queue item              | _"OCS next item"_                                           |
| Black screen                 | _"Media black screen"_                                      |
| Show logo                    | _"OCS show logo"_                                           |

**FR-3.15** — Book name matching uses a three-pass fuzzy strategy:

1. Exact alias match (full name or standard abbreviation)
2. Prefix match + word-order normalisation
3. Phonetic (simplified Metaphone) + Levenshtein distance fallback

Common mispronunciations explicitly handled: "Revelations" → Revelation, "Psalms" as "Sams", "Philemon" as "Filemon", "Deuteronomy" as "Deutronomy".

**FR-3.16** — Word-number conversion applied before matching (e.g. _"three"_ → `3`, _"twenty-six"_ → `26`).

**FR-3.17** — A deduplication guard prevents the same verse from being re-sent within 10 seconds via the voice path.

#### 4.3.6 Command Feedback

**FR-3.18** — Every voice command shall produce immediate audio + visual feedback:

| Outcome           | Audio        | Visual                                       |
| ----------------- | ------------ | -------------------------------------------- |
| Success           | Subtle chime | Green flash on debug bar + verse animates in |
| Unrecognised      | Low tone     | Amber flash + "Did you mean: X?" suggestion  |
| Duplicate blocked | None         | Grey flash + "Already showing" tooltip       |
| Low confidence    | None         | Debug bar: "LOW CONFIDENCE — ignored"        |

**FR-3.19** — "Did you mean?" suggestions shall show the closest matched verse reference for the operator to confirm or dismiss with one click.

#### 4.3.7 Trigger Sensitivity

**FR-3.20** — A sensitivity slider in Settings shall control trigger strictness:

- **Strict** — near-exact phonetic match required (noisy environments)
- **Balanced** — default; accepts close variants
- **Loose** — broad phonetic variants accepted (quiet, controlled environments)

#### 4.3.8 Word Highlighting

**FR-3.21** — Single-word and multi-word highlighting via HTML `<mark>` tags with gold styling (`#ffd700`).

**FR-3.22** — Range selection supported: _"from X to Y"_, including _"to the end."_

**FR-3.23** — Highlights cached per verse reference with 5-minute TTL, then auto-pruned.

**FR-3.24** — Fuzzy phonetic matching used for word lookup (handles Whisper mishearings of verse content).

#### 4.3.9 Diagnostics & Recovery

**FR-3.25** — A persistent debug bar at the bottom of the Controller Window shall show at all times:

- Engine status: `initializing` / `ready` / `listening` / `transcribing` / `error`
- Real-time RMS volume meter
- VAD state badge: `VOICE` / `WAITING`
- Last heard transcript: `HEARD: "OCS John three sixteen"`
- Confidence score of last result
- Current verse context
- Step-by-step internal event log (last 10 events)

**FR-3.26** — A **Sync** button shall reinitialise the microphone and AI engine without closing the app (cycles `isListening` off → on with 400ms gap).

**FR-3.27** — A microphone selector in Settings shall list all available audio input devices with a live RMS level test so operators can confirm the correct mic is active before service.

---

#### 4.3.10 Rebuilt Voice Engine — v2 (April 2026)

The voice engine has been fully rebuilt to eliminate transcription lag, improve noise rejection, and support partial Bible references.

**FR-3.28 — Python Faster-Whisper Sidecar:**
The primary ASR engine is now a local Python Flask server (`voice_server/server.py`) running `faster-whisper` (CTranslate2 backend) bound to `127.0.0.1:5421`. It is spawned as a subprocess by Electron's main process on app launch and killed on quit. The sidecar achieves **4–8× faster transcription** than the previous WASM engine with real `avg_logprob` confidence scores.

**FR-3.29 — Automatic WASM Fallback:**
If the Python sidecar is unavailable (Python not installed, cold start failure), the voice worker automatically falls back to `@xenova/transformers`. The debug bar displays `🐍 Python` or `🌐 WASM` to indicate the active engine. Auto-failover occurs mid-session without operator intervention.

**FR-3.30 — Spectral Noise Reduction:**
The Python sidecar applies `noisereduce` spectral subtraction before transcription. Noise profile is sampled from the first 250ms of each utterance to remove consistent background noise (HVAC, crowd murmur) that survives the high-pass filter.

**FR-3.31 — Enhanced Multi-Feature VAD:**
The AudioWorklet computes three signals per chunk to gate voice detection:
- **RMS energy** — primary volume gate with adaptive noise floor (self-calibrates every 8 silent chunks)
- **Zero-Crossing Rate (ZCR)** — must be < 0.42 (high ZCR = hiss/noise, not voice)
- **Voicing score** (autocorrelation periodicity) — must be > 0.12 (voiced speech is periodic; broadband noise is not)

All three signals must pass for `isSpeaking = true`. The debug bar shows the live voicing score percentage.

**FR-3.32 — Real Confidence Scoring:**
The Python sidecar returns actual Whisper `avg_logprob` from `faster-whisper` segments, mapped to 0.0–1.0. The confidence threshold is 0.60 (down from 0.65) because real log-probabilities are more reliable than heuristic estimates.

**FR-3.33 — Smart Bible Reference Resolution (4-Pass):**
The new `smartBibleMatch.js` module resolves spoken references via four cascading passes:
1. **Exact alias match** — full name, abbreviation, mispronunciation (200+ aliases)
2. **Phonetic + Levenshtein** — Metaphone + normalised edit distance ≤ 0.35
3. **Keyword content search** — if no book matched, searches SQLite verse text for heard keywords (e.g. _"for God so loved the world"_ → John 3:16)
4. **Context-only jump** — _"verse 5"_ or _"chapter 4"_ resolved against currently displayed book/chapter

**FR-3.34 — Partial Reference Support:**
Users may speak any subset of a reference and OCS will resolve it automatically:
- _"OCS John three"_ → John 3:1
- _"OCS for God so loved"_ → John 3:16 (keyword search)
- _"OCS verse five"_ → verse 5 of current chapter (context jump)
- _"OCS Revelations twenty two"_ → Revelation 22:1 (mispronunciation + fuzzy)

---

### 4.4 Presentation Controller


**FR-4.1** — Users shall import image/video files (jpg, png, gif, webp, mp4, webm, mov, avi) into a persistent local media library stored in Electron's `userData` directory.

**FR-4.2** — PowerPoint (`.pptx`) files shall be importable. Each slide auto-converts to PNG via `pptx-glimpse`. Conversion failures shall surface per-slide with a clear error (not a silent blank).

**FR-4.3** — Speaker notes from PPTX slides shall be displayed in the Controller Window and Speaker View — never on the General View.

**FR-4.4** — Individual media files shall be deletable from the library.

**FR-4.5** — A blank/logo screen shortcut shall be available (`B` for black, `L` for logo) to instantly clear the General View — standard expectation for professional AV operators.

**FR-4.6** — Slide annotations shall be supported during display:

- Operator can draw or highlight on the current slide
- Annotations shown on General View in real time
- Annotations are session-only and not saved

**FR-4.7** — Media scheduling shall be supported:

- Pre-schedule a video or image to display when the service timer reaches a specified mark
- E.g. "Play welcome_video.mp4 when timer hits 0:00"

---

### 4.5 Timer Controller

**FR-5.1** — Multiple named countdown timers shall be supported:

- Worship timer
- Sermon timer
- Announcement timer
- Custom named timers

**FR-5.2** — Timer state (active timer, value, running/paused) shall broadcast to all windows.

**FR-5.3** — Speaker View shall display the active countdown prominently as a stage monitor.

**FR-5.4** — General View shall show the timer only when the operator explicitly enables "audience timer mode."

**FR-5.5** — Timer controls (set, start, pause, reset) available from Controller Window, Mobile Companion App, and voice commands.

**FR-5.6** — Overtime indicator: when timer reaches 0:00, counter continues upward in red with a pulsing animation to alert the operator and preacher.

**FR-5.7** — Timer presets shall be saveable and loadable (e.g. "15 min worship", "45 min sermon", "5 min offering").

**FR-5.8** — Voice timer commands:

- _"OCS set timer forty-five minutes"_
- _"OCS start timer"_
- _"OCS pause timer"_
- _"OCS reset timer"_

---

### 4.6 Mobile Companion App

**FR-6.1** — The mobile app shall connect to the desktop OCS instance over local Wi-Fi via Socket.IO on port 4000 (configurable).

**FR-6.2** — Connection established by:

- Scanning a QR code shown in the Controller Window's Remote panel, or
- Manually entering the host IP address

**FR-6.3** — Supported remote actions:

- Browse all 66 Bible books and chapters
- Push a verse or chapter to the main display
- View and reorder the service queue
- Control all service timers (set, start, pause, reset)
- View the current display content in sync
- Trigger black screen or logo screen

**FR-6.4** — All Bible content served by the desktop app's embedded Express server — no third-party cloud required.

**FR-6.5** — Controller Window shall display a list of connected mobile devices with IP address and connection time.

**FR-6.6** — If Wi-Fi drops, the mobile app shall retry connection every 5 seconds with a visible "Reconnecting…" banner — never silently fail.

**FR-6.7** — Dark mode shall be default on mobile (stage environments are often dimly lit).

**FR-6.8** — Haptic feedback on every successful remote command to confirm action without needing to look at the screen.

**FR-6.9** — Mobile app shall allow building and reordering the service queue before and during service, syncing changes to desktop in real time.

---

### 4.7 Settings & Styling

**FR-7.1** — Global display style configuration:

- Font family and size
- Text colour and background colour
- Text shadow and outline for readability on mixed backgrounds
- Verse reference display options (show/hide, position)

**FR-7.2** — Style changes broadcast to all views in real time with a live preview panel in the Settings screen.

**FR-7.3** — Preview mode allows the operator to preview the Speaker View or General View output directly within the Controller Window without switching monitors.

**FR-7.4** — Settings shall include:

- Trigger word configuration
- Voice sensitivity slider
- Confidence threshold slider
- Microphone input selector with live level test
- Translation management (download / remove offline packs)
- Keyboard shortcut customisation
- Timer preset management
- Monitor assignment override

---

### 4.8 Display Reset

**FR-8.1** — A **Reset Display** button and `Esc` shortcut shall clear all content from both projection windows and revert to the default OCS branding screen.

---

## 5. New Feature Modules

### 5.1 Order of Service Planner

This is the most significant missing feature from v1. Without it, operators have no structured way to plan service flow.

**FR-9.1** — A pre-service planning view shall allow building an ordered service sequence:

- Item types: Scripture, Song (title only), Video, Timer, Announcement slide, PPTX deck, Custom note
- Drag-to-reorder items
- Each scripture item links to a specific verse/range
- Each media item links to a file in the media library

**FR-9.2** — During service, the active queue item is highlighted. The Speaker View shows the current item and the next item.

**FR-9.3** — Advancing through the queue:

- `Space` key on keyboard
- "Next item" button in Controller
- Voice command: _"OCS next item"_
- Mobile companion app next button

**FR-9.4** — The queue shall be saveable as a named service file (e.g. `sunday_22_june.ocs`) and reloadable for repeated service formats.

**FR-9.5** — Order of service shall be exportable as a PDF for printing and distribution to the team.

**FR-9.6** — The worship leader can share sermon notes or a verse list as plain text; OCS shall parse it and auto-import scripture items into the queue.

---

### 5.2 Verse Setlist / Queue

**FR-10.1** — Separate from the full Order of Service, operators shall be able to build a simple verse queue for the sermon portion:

- Add verses by reference or voice command: _"OCS queue Romans eight one"_
- Advance through queued verses with `Space` or _"OCS next"_
- Remove or reorder items during service
- Speaker View shows the next queued verse at all times

**FR-10.2** — Verse queue state is saved as part of the session crash recovery.

---

### 5.3 Crash Recovery & Session Persistence

**FR-11.1** — Every 30 seconds, OCS shall auto-save the complete service state to disk:

- Current displayed verse and translation
- Timer state (all timers)
- Active media file
- Queue position and full queue
- Current display styles

**FR-11.2** — On launch after an unexpected quit, OCS shall prompt:

> _"OCS was interrupted during a session. Restore to where you left off?"_
> `[Restore Session]` `[Start Fresh]`

**FR-11.3** — Session restore shall return the operator to the exact state in under 10 seconds — critical for live service recovery.

**FR-11.4** — Session files retained for 7 days then auto-pruned.

---

### 5.4 First-Run Setup Wizard

**FR-12.1** — On first launch, a guided setup wizard shall walk through:

```
Step 1: Welcome + hardware check
        └── CPU speed, available RAM, disk space warning if < 1GB free

Step 2: Monitor detection
        └── Assign Controller / Speaker View / General View to detected displays
        └── Manual override for non-standard layouts

Step 3: Microphone setup
        └── Select input device
        └── Live RMS level display
        └── "Speak normally" calibration — sets VAD threshold per environment

Step 4: AI model download
        └── Progress bar for Whisper Base download (~150MB)
        └── "Skip for now — use manual control only" option

Step 5: Voice command test
        └── Prompt: "Say 'OCS John three sixteen'"
        └── Shows transcription result and confirmation

Step 6: Translation selection
        └── KJV pre-selected and bundled
        └── Optional NIV / ESV / AMP download

Step 7: Ready
        └── Service-ready checklist:
            ✅ Monitors assigned
            ✅ Microphone active (RMS: 0.012)
            ✅ AI model loaded
            ✅ Bible database ready (KJV)
            ✅ Mobile server running on 192.168.1.x:4000
```

---

## 6. Non-Functional Requirements

### 6.1 Performance

| NFR   | Requirement                                                     | Target                   |
| ----- | --------------------------------------------------------------- | ------------------------ |
| NFR-1 | Voice transcription latency (end of speech → command execution) | < 3 seconds              |
| NFR-2 | Mid-speech probe trigger detection                              | 1.5–2s from speech start |
| NFR-3 | UI interactions (verse selection, timer)                        | < 100ms                  |
| NFR-4 | Whisper model load from cache                                   | < 10 seconds             |
| NFR-5 | App fully interactive (excl. model) from launch                 | < 5 seconds              |
| NFR-6 | Verse query from SQLite                                         | < 50ms                   |
| NFR-7 | Session restore after crash                                     | < 10 seconds             |

### 6.2 Reliability

| NFR    | Requirement                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------- |
| NFR-8  | 100% offline operation after initial model download                                            |
| NFR-9  | Watchdog timer prevents voice system from hanging indefinitely                                 |
| NFR-10 | Emergency 15s force-trigger ensures audio buffers never grow unbounded                         |
| NFR-11 | All IPC calls wrapped in try/catch; every error surfaces in the debug bar — no silent failures |
| NFR-12 | PPTX conversion failure surfaces per-slide with the specific error                             |
| NFR-13 | App tested for stability over a 3-hour continuous session (simulated service)                  |

### 6.3 Compatibility

| NFR    | Requirement                                                     |
| ------ | --------------------------------------------------------------- |
| NFR-14 | macOS primary target (Intel + Apple Silicon)                    |
| NFR-15 | Windows support in V2 — architecture shall not preclude it      |
| NFR-16 | Mobile app supports iOS 15+ and Android 10+ via Expo            |
| NFR-17 | Multi-monitor layouts of 1, 2, or 3 displays handled gracefully |

### 6.4 Disk & Memory

| NFR    | Requirement                               |
| ------ | ----------------------------------------- |
| NFR-18 | Base app including Whisper model: < 500MB |
| NFR-19 | Each Bible translation pack: < 20MB       |
| NFR-20 | App warns when userData disk space < 1GB  |
| NFR-21 | Idle RAM usage: < 300MB                   |
| NFR-22 | RAM during active transcription: < 500MB  |

### 6.5 Security & Privacy

| NFR    | Requirement                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- |
| NFR-23 | All audio processed locally on-device — no audio data ever leaves the machine                        |
| NFR-24 | Local server binds to `0.0.0.0:4000` — intended for trusted LAN use only                             |
| NFR-25 | No telemetry or analytics data collected without explicit operator consent                           |
| NFR-26 | Auto-updates download silently but install only with operator approval — never during a live session |

### 6.6 Accessibility

| NFR    | Requirement                                                |
| ------ | ---------------------------------------------------------- |
| NFR-27 | All Controller UI elements keyboard-navigable              |
| NFR-28 | Minimum font size 14px in Controller UI                    |
| NFR-29 | High-contrast mode available for bright stage environments |
| NFR-30 | All icons accompanied by text labels or tooltips           |

---

## 7. Success Metrics

### 7.1 Adoption

| Metric                                     | Target (6 months) |
| ------------------------------------------ | ----------------- |
| Weekly active churches (WAC)               | 50+               |
| Avg. service sessions per church per month | ≥ 4               |
| Mobile companion connections per service   | ≥ 1               |

### 7.2 Reliability

| Metric                          | Target |
| ------------------------------- | ------ |
| Voice command success rate      | ≥ 90%  |
| False trigger rate per service  | < 2    |
| App crash rate per service hour | < 0.1% |
| Session recovery success rate   | ≥ 99%  |

### 7.3 Performance

| Metric                                | Target  |
| ------------------------------------- | ------- |
| P95 voice-to-display latency          | < 2.5s  |
| P95 model load time (median hardware) | < 8s    |
| P95 verse search response             | < 100ms |

### 7.4 User Satisfaction

| Metric                                        | Target |
| --------------------------------------------- | ------ |
| Operator NPS                                  | ≥ 60   |
| Setup wizard completion rate                  | ≥ 85%  |
| Support tickets per 100 active churches/month | < 5    |

---

## 8. Risks & Mitigations

| Risk                                             | Likelihood | Impact   | Mitigation                                                                 |
| ------------------------------------------------ | ---------- | -------- | -------------------------------------------------------------------------- |
| Whisper mishears trigger word "OCS"              | Low        | High     | Broad alias list + sensitivity slider + configurable trigger               |
| Operator uses wrong microphone input             | High       | High     | Mic selector with live RMS test in setup wizard and settings               |
| Noisy church environment breaks VAD              | Medium     | High     | High-pass filter + gain + tuned threshold + per-church calibration         |
| False trigger from "media team" / "social media" | N/A        | N/A      | Resolved by changing trigger from "Media" to "OCS"                         |
| Church laptop too slow for Whisper Base          | Medium     | High     | Hardware check in setup wizard with clear minimum-spec warning             |
| Model download fails on first run                | Low        | Medium   | Progress indicator + automatic retry + offline-only mode fallback          |
| Mobile can't discover desktop IP                 | Low        | Medium   | QR code display + manual IP entry                                          |
| PPTX conversion fails for complex slides         | Medium     | Medium   | Per-slide error boundary + raw file display fallback                       |
| Two operators control display simultaneously     | Low        | Medium   | "Active operator" lock indicator — one operator active at a time           |
| App update breaks during live service            | Low        | Critical | Updates download silently, install only on operator approval after service |
| HDMI display not detected on launch              | Medium     | High     | Manual display assignment as fallback in Settings                          |
| Preacher uses regional book name variants        | High       | Medium   | Extended alias table covering common regional pronunciations               |
| Crash during live service                        | Low        | Critical | 30s auto-save + crash recovery prompt restores in < 10s                    |

---

## 9. Roadmap

### Phase 1 — Core Loop (Weeks 1–2)

- Voice → Whisper → command execution working end-to-end
- KJV Bible loaded from SQLite
- Verse pushes to General View and Speaker View via IPC
- Debug bar fully functional

### Phase 2 — Bible & Display (Weeks 3–4)

- Full verse tree UI (books, chapters, verses)
- Multi-verse selection
- Verse search (full-text)
- Keyboard shortcuts
- Black/logo screen shortcuts
- PPTX import and slide conversion

### Phase 3 — Service Management (Weeks 5–6)

- Order of Service planner
- Verse queue / setlist
- Timer module (multiple timers, presets, overtime indicator)
- Session crash recovery + auto-save

### Phase 4 — Mobile & Remote (Weeks 7–8)

- Mobile companion app (Socket.IO)
- QR code connection
- Remote verse control and timer control
- Queue management from mobile

### Phase 5 — Polish & Settings (Weeks 9–10)

- First-run setup wizard
- Display style configurator
- Translation download manager
- Trigger sensitivity + confidence threshold settings
- High-contrast mode

### Phase 6 — Beta & Launch (Weeks 11–12)

- Internal beta with 3–5 partner churches
- Sentry error monitoring integration
- electron-updater auto-update pipeline
- Public release build (macOS DMG)

---

## 10. Out of Scope — V1

The following are explicitly deferred to V2 and later. They are documented here so the V1 architecture does not preclude them.

| Feature                                             | Deferred To | Notes                                          |
| --------------------------------------------------- | ----------- | ---------------------------------------------- |
| Windows / Linux builds                              | V2          | Architecture should remain cross-platform      |
| Song lyrics + chord charts                          | V2          | Most requested post-MVP feature                |
| Cloud sync / backup                                 | V2          | Protects against laptop failure on service day |
| Live streaming integration                          | V2          | Growing need post-COVID                        |
| Multi-operator concurrent control                   | V2          | Large churches have 2+ operators               |
| Authentication for mobile app                       | V2          | V1 assumes trusted LAN                         |
| Sermon notes / order-of-service planning (advanced) | V2          | Basic version in V1                            |
| Hebrew / Greek lexicon                              | V3          | Study-focused feature                          |
| AI sermon assistant                                 | V3          | Out of core AV scope                           |

---

## 11. Glossary

| Term                 | Definition                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- |
| VAD                  | Voice Activity Detection — determines when a user is speaking vs. silent            |
| ASR                  | Automatic Speech Recognition — converting audio to text (Whisper)                   |
| RMS                  | Root Mean Square — a measure of audio loudness used for VAD                         |
| IPC                  | Inter-Process Communication — Electron's bridge between main and renderer processes |
| Pre-roll             | A short audio buffer prepended to a capture to prevent clipping word starts         |
| Probe                | A lightweight mid-speech transcription scan for early keyword detection             |
| Confidence threshold | Minimum Whisper certainty score required before acting on a transcription           |
| Speaker View         | The stage monitor display intended for the preacher/pastor                          |
| General View         | The projector / audience-facing display                                             |
| Controller Window    | The operator's primary interface for managing all displays                          |
| Service queue        | An ordered list of content items (verses, media, timers) for the service            |
| Verse setlist        | A simplified verse-only queue for the sermon portion                                |
| Session file         | A snapshot of complete service state saved for crash recovery                       |
| OCS file             | A saved Order of Service file (`.ocs`) containing the full service plan             |
| Overtime indicator   | Visual/audio alert when a timer passes 0:00 and counts upward                       |

---

_OCS PRD v1.0 — April 2026_
