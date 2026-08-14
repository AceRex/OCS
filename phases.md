# OCS — Organised Church Service

## Phased Build Plan (v1.7 alignment)

This is the execution breakdown for the PRD (`OCS_PRD_v1.7.md`). Timer Controller and Session Folders phases are carried forward exactly as previously shipped/planned — not touched by this pass. New work from the v1.7 gap-analysis (ASR adapter, voice-driven presentation, teleprompter, token security) is slotted into the existing phase structure rather than bolted on at the end, so nothing ships twice.

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

## Phase 2 — Bible & Display

**Scope: unchanged from prior plan**

- Full verse tree UI (books, chapters, verses)
- Multi-verse selection
- Verse search (full-text)
- Keyboard shortcuts
- Black/logo screen shortcuts
- PPTX import and slide conversion (import/library only — voice control lands in Phase 2.5, see below)

### Phase 2.5 — Voice-Driven Presentation Control (New)

Slotted here because it depends on both the command router (Phase 1) and the PPTX/media library (Phase 2), and should land before Session Management so Phase 3's Order of Service can assume slide navigation already works end-to-end.

- Implement FR-4.8 command set (next/previous/jump-to/first/last slide, play/pause)
- Implement FR-5.32 `activeDisplayContext` state (idle/scripture/presentation/teleprompter) — build it now even though teleprompter doesn't exist yet, since Phase 2.5 is the natural place to introduce context disambiguation
- Implement FR-4.9 "next"/"previous" disambiguation between scripture and presentation
- Implement FR-3.69 ordinal book-prefix fix in the shape gate (small, isolated fix — bundle here since it's touching the same command-routing code)

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
- **[New] Implement FR-3.67 synthesized partials for whisper.cpp** — needed here because the aligner benefits from partial-equivalent updates for smooth scrolling; can be deferred past Phase 2.5 since presentation commands don't need it (they're final-only per FR-3.8d)

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

- Internal beta with 3–5 partner churches, deliberately including at least one with strongly accented preaching to stress-test the ASR accuracy risk, **and at least one session that exercises voice-driven presentation control and teleprompter under real service conditions** (both are new enough in this plan to need dedicated beta attention, not just incidental coverage)
- **[New] macOS mic-permission-revoked recovery path (NFR-37)** should be manually tested at least once during beta — easy to miss in normal dev-machine usage since permissions are rarely revoked mid-session there
- **[New] Verify NFR-28's "live session" gate** (auto-update blocked while timer lifecycle bus shows an active session) actually blocks an update attempt in a real beta service, not just in unit tests
- Sentry error monitoring integration
- electron-updater auto-update pipeline
- Public release build (macOS DMG)

---

## Summary of what changed vs. the prior (v1.6-implied) phase plan

| Change                                                                                               | Where                    |
| ---------------------------------------------------------------------------------------------------- | ------------------------ |
| New sub-task: build `AsrAdapter` before other voice work                                             | Phase 0                  |
| New phase: Voice-driven presentation control                                                         | Phase 2.5 (new)          |
| Token security hardening (per-device tokens, rate limiting, WSS option)                              | Phase 4                  |
| Secondary input scope explicitly widened                                                             | Phase 4                  |
| New phase: Teleprompter & read-along, generalized aligner                                            | Phase 5 (new)            |
| Engine-switch recalibration + per-engine alias sets                                                  | Phase 6                  |
| Beta scenarios explicitly cover new features + macOS permission edge case + live-session update gate | Phase 7 (renumbered)     |
| Timer Controller, Session Folders                                                                    | **Untouched everywhere** |

_Companion to OCS PRD v1.7 — August 2026_
