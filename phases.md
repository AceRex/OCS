# OCS — Organised Church Service

## Phased Build Plan (v1.8 alignment)

This is the execution breakdown for the PRD (`OCS_PRD_v1.8.md`). Timer Controller and Session Folders phases remain carried forward exactly as previously shipped/planned — not touched by this pass either. v1.7's gap-analysis work (ASR adapter, voice-driven presentation commands, teleprompter, token security) stays where it was placed. **New in this revision:** the Media, Scene, Text & Presentation Suite (MSTP — PRD Section 4.4) is folded into **Phase 2**, per direct request, since it shares the same Controller/Speaker/General IPC rendering foundation as the existing Bible & Display phase and would require rework if built separately later.

---

## Phase 0 — Architecture Foundation

**Status: mostly complete, one new sub-task added**

- ✅ Replace Python sidecar with native in-process ASR bindings (whisper.cpp addon + Vosk FFI fallback)
- ✅ Implement pairing-token generation and validation on the Express/Socket.IO server
- **[New] Build the `AsrAdapter` interface (FR-3.65)** — `onPartial` / `onFinal` / `engineName` / `confidence` — and migrate existing whisper.cpp + Vosk integration code behind it _before_ Phase 1 work builds on top of either engine directly. This is a foundational refactor, not new functionality — it exists to prevent the exact spec/implementation drift the v1.7 gap analysis found.
- Remaining validation: live service latency soak test against Phase 1 P95 targets (Section 7.3 of PRD)

---

## Phase 1 — Core Loop

**Scope: unchanged from prior plan**

- Voice → ASR Adapter → command execution working end-to-end (primary input only)
- KJV Bible loaded from SQLite
- Verse pushes to General View and Speaker View via IPC
- Debug bar fully functional, now showing active engine name (FR-3.26)

---

## Phase 2 — Bible, Display & Media Suite (expanded in v1.8)

**Scope: existing Bible & Display work, plus the full Media/Scene/Text/Presentation Suite (MSTP) — broken into ordered sub-phases so the compositor foundation lands before anything renders on top of it**

### Phase 2.1 — Bible & Display (unchanged from prior plan)

- Full verse tree UI (books, chapters, verses)
- Multi-verse selection
- Verse search (full-text)
- Keyboard shortcuts
- Black/logo screen shortcuts

### Phase 2.2 — Display Canvas Compositor Foundation (New)

Built first among the MSTP work because every other MSTP sub-phase renders onto this. Getting the band model (Background → Content Slot → Pinned → Chrome) right here is what makes "pinned media survives a Bible/Timer switch" work without special-casing later.

- Implement `DisplayCanvas.js` (FR-4.13) — the four-band compositor, replacing ad hoc per-feature rendering
- Scope `activate_set_content` (existing FR-1.3) to the Content Slot band only (FR-4.14) — this is the single most important fix in this phase; get it wrong and every later sub-phase inherits the bug
- Wire full canvas-state IPC sync to Speaker View / General View, and the lightweight summary to Mobile Companion (FR-4.15)
- Migrate the existing Bible verse renderer (Phase 2.1) to be the `bible` Content Slot type, as the first real test of the compositor before building anything new on top of it

### Phase 2.3 — Media: Background & Pinned Layers (New)

- Import flow with explicit Background/Layer placement choice (FR-4.16)
- Background: cover-fill rendering (FR-4.17), keyboard pan with clamped offset (FR-4.18), video loop/autoplay/muted-by-default (FR-4.19)
- Pinned layers: adjusting-node drag/resize UI in Edit Mode (FR-4.20), cross-Content-Slot persistence (FR-4.21) — this is the direct test that Phase 2.2's band separation actually works end-to-end
- Pinned video independent play/pause/loop (FR-4.22), z-order drag-reorder list (FR-4.23)
- Layer state folded into session auto-save (FR-4.24)
- Single-selection keyboard focus model (FR-4.27) — build alongside Pinned layers since arrow-key nudging needs a focus target to exist first

### Phase 2.4 — Text as a Layer (New)

Thin sub-phase — Text is a `LayerSource` variant, not new architecture, so this mainly means the text-entry UI and style override.

- Text layer type reusing all of Phase 2.3's Pinned-layer mechanics (FR-4.25)
- Quick-add panel + `"OCS add text layer"` voice command opening a text-entry prompt (FR-4.26)

### Phase 2.5 — Presentation: PPTX Import & Voice Control

(Carries forward the prior plan's Phase 2.5 content, renumbered as a Phase 2 sub-phase since Presentation is now explicitly one of the two Content Slot types alongside Scene, not a standalone later addition.)

- PPTX import and slide-to-PNG conversion (FR-4.1–FR-4.7, media _library_ infrastructure shared with Phase 2.3's import flow)
- Presentation as a Content Slot type (FR-4.13 integration)
- Voice command set: next/previous/jump-to/first/last slide, play/pause (FR-4.8)
- `activeDisplayContext` state — `scripture` | `presentation` | `scene` | `teleprompter` (FR-5.32, extended in v1.8 to include `scene` even though Scene's read-along isn't built until Phase 5 — the state value is reserved now so Phase 5 doesn't need to touch this enum again)
- "Next"/"previous" disambiguation (FR-4.9)
- Ordinal book-prefix shape-gate fix (FR-3.69) — small, isolated, bundled here since it touches the same command-routing code being built in this sub-phase

### Phase 2.6 — Scene: Structure & Manual Mode (New)

Scene ships in two parts across two phases: the entity/manual-navigation half here, the Read-Along auto-advance half in Phase 5 once `referenceAligner.js` exists. Building it this way means Manual/Mobile-Controlled Scenes are usable standalone without waiting on the aligner.

- Scene entity + Page editor, modeled on the existing Bible verse tree UI for consistency (FR-4.28)
- Manual/Mobile-Controlled navigation mode: `Space`, Controller click, Mobile Companion next/previous (FR-4.29's manual branch)
- Scene as a Content Slot type (FR-4.30)
- Voice commands: start scene, next/previous page (FR-4.31)
- **Explicitly deferred to Phase 5:** Read-Along mode (FR-4.29's automatic branch) — flagged here, not silently dropped, so it isn't forgotten between phases

### Phase 2.7 — Cross-Platform Media Pipeline (New)

Closes this phase out, since it hardens everything built in 2.3–2.6 rather than adding new user-facing surface area.

- Bundle prebuilt-per-platform ffmpeg; video normalization to VP9/WebM on import (FR-4.32, NFR-38)
- Bundle `sharp` (or equivalent) for image normalization (FR-4.33)
- Background transcode job with progress + per-item failure surfacing (FR-4.34, NFR-41's performance budget)
- Audit all new layer transforms to confirm they're CSS `transform`/`opacity`-based, not Canvas2D/WebGL (FR-4.35)
- `path` module discipline pass across the new media/scene file-handling code (FR-4.36)
- Bundle fonts for Text layers/Scene pages rather than relying on host OS fonts (FR-4.37)
- Confirm Electron's native `dialog` module is used for all new import pickers (FR-4.38)
- Keyboard modifier parity check for new MSTP shortcuts (FR-4.39)

---

## Phase 3 — Service Management

**Scope: unchanged from prior plan — Timer Controller and Session Folders untouched**

- Order of Service planner
- Verse queue / setlist
- Timer module (multiple timers, presets, overtime indicator) — **as-shipped, no changes**
- Session crash recovery + auto-save
- Session Folders (FR-5.9–5.29) — **as-shipped, no changes**

---

## Phase 4 — Mobile & Remote

**Scope: existing plan, with token security hardening added**

- Mobile companion app (Socket.IO)
- QR code + 6-digit code connection, now issuing a **master token** at pairing time only (FR-6.10)
- **[New] Per-device session tokens (FR-6.11)** — issued post-pairing, independently revocable
- **[New] Fallback code rate limiting / lockout (FR-6.12)**
- **[New] Optional WSS transport setting (FR-6.13)**
- Remote verse control and timer control
- Queue management from mobile
- Secondary (phone) push-to-talk voice input — **now explicitly scoped to cover presentation and teleprompter commands too (FR-3.40), not scripture/timer only**

---

## Phase 5 — Teleprompter & Read-Along (New Phase)

Pulled out as its own phase rather than squeezed into Polish, since it introduces a genuinely new subsystem (the shared reference aligner) that both scripture read-along and free-text teleprompter depend on.

- Build `referenceAligner.js` (FR-5.31) as a standalone module: reference text in, ASR final/synthesized-partial stream in, `{referenceId, wordIndex, confidence}` out
- Wire scripture read-along (existing FR-3.62 requirement) through the shared aligner instead of a bespoke implementation
- Add free-text teleprompter source (FR-5.30b/c): paste-a-script and Order-of-Service-note sources
- Implement FR-5.33 teleprompter scroll rendering (Speaker View only, General View excluded — same isolation rule as scripture read-along)
- Implement FR-5.34 bounded backward resync
- Implement FR-5.35 teleprompter voice commands (start/stop/restart)
- **[New] Implement FR-3.67 synthesized partials for whisper.cpp** — needed here because the aligner benefits from partial-equivalent updates for smooth scrolling; can be deferred past Phase 2 since presentation commands don't need it (they're final-only per FR-3.8d)
- **[New in v1.8] Wire Scene Read-Along mode** (deferred from Phase 2.6) — page-complete detection (FR-5.36), debounced auto-advance (FR-5.37), no-match fallback prompt (FR-5.38), manual override always available (FR-5.39). This is the fourth caller of `referenceAligner.js` (alongside scripture read-along, free-text teleprompter, and Order-of-Service-note teleprompter), so building it here — right after the aligner itself is stable — is more efficient than a separate later phase.

---

## Phase 6 — Polish & Settings

**Scope: existing plan, plus engine-switch handling**

- First-run setup wizard (including mobile pairing step)
- Display style configurator
- Translation download manager
- Trigger sensitivity + confidence threshold settings
- ASR model selection
- **[New] FR-3.68 confidence re-calibration prompt on engine switch** — small but easy to forget; bundle with the existing calibration UI work in this phase
- **[New] FR-3.66 per-engine alias set switching** — bundle with trigger-word/book-alias settings work already planned here
- High-contrast mode

---

## Phase 7 — Beta & Launch

**Renumbered from Phase 6 in the prior plan to make room for the new Phase 5**

- Internal beta with 3–5 partner churches, deliberately including at least one with strongly accented preaching to stress-test the ASR accuracy risk, **and at least one session that exercises voice-driven presentation control, Scene read-along, and pinned media layers under real service conditions** (all new enough in this plan to need dedicated beta attention, not just incidental coverage)
- **[New] macOS mic-permission-revoked recovery path (NFR-37)** should be manually tested at least once during beta — easy to miss in normal dev-machine usage since permissions are rarely revoked mid-session there
- **[New] Verify NFR-28's "live session" gate** (auto-update blocked while timer lifecycle bus shows an active session) actually blocks an update attempt in a real beta service, not just in unit tests
- **[New in v1.8] Video-layer audio/mic feedback test (NFR-40)** — play a Background or Pinned video with audio unmuted during a live-mic beta session and confirm it doesn't trigger false voice commands; this is a real-world condition that's easy to miss in solo dev testing with headphones
- **[New in v1.8] Cross-platform media smoke test (NFR-38, FR-4.40)** — once a Windows build exists (V2), replay the same imported video/image set used in macOS beta testing and confirm identical playback, without assuming Chromium's codec behavior carried over
- Sentry error monitoring integration
- electron-updater auto-update pipeline
- Public release build (macOS DMG)

---

## Summary of what changed vs. the prior (v1.7) phase plan

| Change                                                                                                  | Where                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| New sub-task: build `AsrAdapter` before other voice work                                                | Phase 0 (v1.7)                  |
| Token security hardening (per-device tokens, rate limiting, WSS option)                                 | Phase 4 (v1.7)                  |
| Secondary input scope explicitly widened                                                                | Phase 4 (v1.7)                  |
| Engine-switch recalibration + per-engine alias sets                                                     | Phase 6 (v1.7)                  |
| **Display Canvas compositor foundation**                                                                | **Phase 2.2 (new in v1.8)**     |
| **Media: Background & Pinned layers**                                                                   | **Phase 2.3 (new in v1.8)**     |
| **Text as a layer**                                                                                     | **Phase 2.4 (new in v1.8)**     |
| Presentation + voice control (carried forward from v1.7's Phase 2.5, renumbered as a Phase 2 sub-phase) | Phase 2.5                       |
| **Scene: structure + manual mode**                                                                      | **Phase 2.6 (new in v1.8)**     |
| **Cross-platform media pipeline (ffmpeg/sharp normalization)**                                          | **Phase 2.7 (new in v1.8)**     |
| **Scene Read-Along auto-advance** (depends on the aligner, so deferred here from Phase 2.6)             | **Phase 5 (extended in v1.8)**  |
| Beta scenarios extended for video/mic feedback + cross-platform media smoke test                        | Phase 7 (extended in v1.8)      |
| Timer Controller, Session Folders                                                                       | **Untouched everywhere, still** |

## Why MSTP sub-phases are ordered this way (2.2 → 2.7)

The dependency chain is real, not arbitrary: the compositor (2.2) has to exist before anything can render on it; Media (2.3) is built next because Text (2.4) is architecturally just a Media layer variant and would be rebuilding the same mechanics if done first; Presentation (2.5) carries forward mostly as-is from v1.7 since it was already spec'd; Scene (2.6) is split so its non-aligner half doesn't wait on Phase 5; and the cross-platform hardening pass (2.7) comes last because it's auditing/normalizing work across everything built in 2.3–2.6, not new user-facing surface area in its own right.

_Companion to OCS PRD v1.8 — August 2026_
