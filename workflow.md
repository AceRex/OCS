# OCS — Organised Church Service

## System Workflows

**Version:** 2.0  
**Last Updated:** April 2026  
**Covers:** Voice Command · Service Day Setup · Mobile Connection · Crash Recovery

---

## Table of Contents

1. [Workflow 1 — Voice Command Flow](#workflow-1--voice-command-flow)
2. [Workflow 2 — Service Day Setup Flow](#workflow-2--service-day-setup-flow)
3. [Workflow 3 — Mobile Companion Connection Flow](#workflow-3--mobile-companion-connection-flow)
4. [Workflow 4 — Crash Recovery Flow](#workflow-4--crash-recovery-flow)

---

## Workflow 1 — Voice Command Flow

**Purpose:** From spoken word to projected verse — fully offline, target < 3 seconds total  
**Trigger:** User speaks near the operator microphone  
**End state:** Correct verse displayed on General View and Speaker View with audio + visual confirmation

---

### Phase 1 — Audio Capture

```
Microphone
  → 16kHz capture
  → Hardware echo cancellation
  → Noise suppression
  → 100Hz high-pass filter (removes HVAC rumble)
  → 2× software pre-amp gain boost
  ↓
AudioWorklet (VAD Engine)
  → RMS computed per 2,048-sample chunk
  → Speech active when RMS > 0.005
  ↓
Pre-roll Buffer
  → 500ms of audio prepended to capture
  → Prevents clipped word starts
  ↓
Trigger Timing Decision
  → Mid-speech probe at 1.5s (fires immediately if trigger detected)
  → Short utterance (≤5 words): 200ms silence threshold
  → Long utterance: 900ms silence threshold
  → Emergency force-trigger at 15s of unbroken speech
```

### Phase 2 — Transcription (Whisper Base · Offline · Web Worker)

```
Audio chunk sent to Whisper Web Worker
  → @xenova/transformers · Whisper Base English
  → Runs entirely offline — no network call
  → 5-second watchdog timer starts
  ↓
Confidence Gate
  → Score < 0.65 → discard silently
  → Log to debug bar: "LOW CONFIDENCE — ignored (score: 0.52)"
  → Score ≥ 0.65 → continue
  → Keyword Detection
  → Check for "OCS" + "Media" + alias variants
  → OCS aliases: oh-see-ess, oasis, obvious, osiris, ocean, o-s-c
  → Media aliases: meeting, meter, medium, video, median, me the
  → No trigger found → discard silently
  → Trigger found → continue to command parsing
  ↓
Command Parser
  → Word-to-number conversion ("three" → 3, "twenty-six" → 26)
  → Book name fuzzy match (3-pass strategy):
      Pass 1: Exact alias match (full name or standard abbreviation)
      Pass 2: Prefix match + word-order normalisation
      Pass 3: Phonetic (Metaphone) + Levenshtein distance
  → Common mispronunciations handled:
      "Revelations" → Revelation
      "Psalms" as "Sams"
      "Philemon" as "Filemon"
  → Verse reference extracted
  ↓
Deduplication Guard
  → Same verse sent within last 10 seconds → block silently
  → Grey flash on debug bar: "Already showing"
  → New verse → continue to execution
```

### Phase 3 — Command Execution

```
SQLite Verse Lookup
  → Query bibles.db for book + chapter + verse
  → Response time < 50ms
  → Verse not found → "Did you mean?" suggestion shown
  ↓
IPC Broadcast
  → activate_set_content event fires
  → Received by: Speaker View, General View, Controller preview
  ↓
Verse Renders on All Displays
  → General View: full-screen verse for congregation
  → Speaker View: verse + upcoming queue item + timer
  → Controller: preview pane updates
  ↓
Feedback to Operator
  → Success: chime + green flash on debug bar
  → Unrecognised command: low tone + amber flash + "Did you mean X?"
  → Duplicate blocked: grey flash + tooltip
  → Low confidence: debug bar log only (no audio)
```

### Supported Commands

| Voice Command                          | Action                                     |
| -------------------------------------- | ------------------------------------------ |
| `OCS John three sixteen`               | Display John 3:16                          |
| `Media John three sixteen`             | Display John 3:16 (same result)            |
| `OCS Genesis one`                      | Display Genesis 1:1 (defaults to verse 1)  |
| `Media verse twenty-six`               | Jump to verse 26 in current chapter        |
| `OCS chapter four`                     | Jump to chapter 4, verse 1 of current book |
| `OCS next` / `Media next`             | Advance to next verse                      |
| `OCS previous` / `Media go back`      | Go back one verse                          |
| `OCS highlight grace`                  | Highlight the word "grace" in gold         |
| `Media mark from God to world`         | Highlight range from "God" to "world"      |
| `OCS remove grace`                     | Remove highlight from "grace"              |
| `Media clear highlights`               | Clear all highlights from current verse    |
| `OCS switch to NIV`                    | Change active translation to NIV           |
| `Media set timer forty-five minutes`   | Set sermon timer to 45:00                  |
| `OCS start timer`                      | Start the active timer                     |
| `Media pause timer`                    | Pause the active timer                     |
| `OCS next item`                        | Advance to next item in service queue      |
| `Media black screen`                   | Black out General View instantly           |
| `OCS show logo`                        | Show OCS branding on General View          |

### Timing Breakdown

| Step                                     | Target          |
| ---------------------------------------- | --------------- |
| Speech detected → trigger fires          | 0.2–0.9s        |
| Audio sent to Whisper worker             | Immediate       |
| Whisper transcription returned           | ~1–2s           |
| Command parsed + verse looked up         | < 100ms         |
| IPC broadcast + displays update          | < 50ms          |
| **Total: spoken word → displayed verse** | **< 3 seconds** |

### Failure Paths

| Condition                       | Behaviour                                                         |
| ------------------------------- | ----------------------------------------------------------------- |
| Confidence < 0.65               | Silent discard. Debug bar logs score.                             |
| Trigger word not detected       | Silent discard. No feedback.                                      |
| Book name not matched           | Amber flash + "Did you mean?" suggestion                          |
| Verse reference not found in DB | Error shown in debug bar. No display change.                      |
| Same verse within 10s           | Grey flash + "Already showing" tooltip                            |
| Whisper worker hangs > 5s       | Watchdog cancels job. Engine resets. Debug bar: "TIMEOUT — reset" |

---

## Workflow 2 — Service Day Setup Flow

**Purpose:** From operator arrival to service-ready — target: fully set up in under 15 minutes  
**Trigger:** Operator arrives and powers on the church laptop  
**End state:** All displays active, voice working, queue loaded, mobile connected, checklist green

---

### Phase 1 — Arrival & Hardware (0–5 min)

**Step 1 — Power on and connect displays**

- Power on the laptop
- Connect HDMI cable(s):
  - Projector → General View (audience display)
  - Stage monitor → Speaker View (preacher's display)
- Connect USB or 3.5mm operator microphone

> ⚠️ Connect displays before launching OCS so monitor detection runs correctly on startup.

**Step 2 — Launch OCS**

- Double-click the OCS application
- System automatically:
  - Detects connected monitors and assigns windows
  - Loads Bible database (KJV) from SQLite — instant
  - Starts Express + Socket.IO server on port 4000
  - Checks for a previous session file

**Step 3 — Verify display assignment**

- OCS logo should appear on both the projector and stage monitor
- If a display is wrong: Settings → Monitor Assignment → manually reassign
- Controller Window should be on the operator's primary screen

---

### Phase 2 — Audio & Voice Setup (5–8 min)

**Step 4 — Select microphone input**

- Open Settings → Audio
- Select the correct input device from the dropdown
- Watch the live RMS level meter — speak normally and confirm the bar moves
- If RMS stays at zero: wrong device selected or mic not connected

**Step 5 — Wait for Whisper model to load**

- Debug bar shows: `AI: initializing...` → `AI: ready`
- Load time from cache: < 10 seconds
- App is fully usable for manual control while model loads

**Step 6 — Run voice test**

- Say clearly: _"OCS John three sixteen"_
- Verify: John 3:16 appears on the General View and Speaker View
- Debug bar shows: `HEARD: "OCS John three sixteen"` and green flash
- If no response: check mic selection, RMS level, and trigger sensitivity

---

### Phase 3 — Content Preparation (8–12 min)

**Step 7 — Load or build the service plan**

Option A — Load a saved plan:

- File → Open → select saved `.ocs` file from previous service

Option B — Build new:

- Open the Order of Service panel
- Add items in sequence: Song → Scripture → Video → Timer → Announcement

**Step 8 — Import sermon verses**

- Paste sermon notes or verse list into the Import panel
- OCS auto-extracts scripture references and adds them to the verse queue
- Review and reorder the queue as needed

**Step 9 — Import media (if applicable)**

- Drag PPTX, video, or image files into the Media Library panel
- PPTX slides auto-convert to PNG (allow 10–30s for large decks)
- Schedule media to appear at a specific timer mark if needed

**Step 10 — Set timer presets**

- Open the Timer panel
- Load saved presets or set durations manually:
  - Worship timer: e.g. 15 minutes
  - Sermon timer: e.g. 45 minutes
- Verify overtime indicator is configured (count-up in red after 0:00)

---

### Phase 4 — Mobile & Final Check (12–15 min)

**Step 11 — Connect worship leader's mobile**

- Open the Remote tab in the Controller Window
- Show the QR code to the worship leader
- Worship leader opens OCS Mobile → Scan QR code
- Verify the device appears in the connected devices list with correct IP

**Step 12 — Pre-service checklist**

Before service begins, confirm all items are green:

```
✅ Displays assigned and showing OCS logo
✅ Microphone active — RMS level confirmed
✅ AI model loaded — debug bar shows "ready"
✅ Bible database ready — KJV loaded
✅ Service queue populated and ordered
✅ Mobile companion connected
✅ Timers configured
✅ Mobile server running (IP shown in Remote panel)
```

**Step 13 — Reset display and stand by**

- Press `L` to show OCS logo/branding screen
- Operator is service-ready — await worship leader cue

---

### Common Issues During Setup

| Issue                     | Fix                                                            |
| ------------------------- | -------------------------------------------------------------- |
| Monitor not detected      | Reconnect HDMI, then Settings → Detect Monitors                |
| Mic RMS stays at zero     | Check input device selection in Settings → Audio               |
| Whisper model not loading | Check disk space (need > 200MB free). Re-download in Settings. |
| Voice test not working    | Check trigger sensitivity slider. Try Loose setting.           |
| Mobile can't connect      | Confirm same Wi-Fi network. Try manual IP entry.               |
| PPTX not converting       | Check file is not corrupted. Try re-importing.                 |

---

## Workflow 3 — Mobile Companion Connection Flow

**Purpose:** Worship leader connects phone to OCS desktop over local Wi-Fi for remote control  
**Trigger:** Worship leader opens OCS Mobile app during setup  
**End state:** Mobile fully synced with desktop — remote control of verse, queue, and timers active

---

### Connection Setup

**Step 1 — Desktop starts local server (automatic)**

```
OCS launches
  → Express.js server starts automatically
  → Binds to 0.0.0.0:4000 (all LAN interfaces)
  → Socket.IO ready to accept connections
  → No internet required — LAN only
```

**Step 2 — Open Remote panel on desktop**

- Click the Remote tab in the Controller Window
- QR code generated from local IP address
- IP address also shown as text for manual entry
- Connected devices list shown (empty until first connection)

**Step 3 — Connect from mobile**

Option A — QR scan (recommended):

1. Open OCS Mobile on phone
2. Tap "Scan QR Code"
3. Point camera at QR code on the Controller Window
4. Connection established automatically

Option B — Manual IP entry:

1. Open OCS Mobile on phone
2. Tap "Enter IP manually"
3. Type the IP shown on the Controller Window (e.g. `192.168.1.45`)
4. Tap Connect

**Step 4 — Handshake & state sync**

```
Socket.IO connection established
  → Desktop: device added to connected list (shows IP + connection time)
  → Mobile: "Connected" banner shown
  → Desktop pushes current state to mobile:
      Current verse + translation
      Full service queue + current position
      All timer states
      Current display content
  → Mobile haptic: single vibration confirms connection
```

---

### During Service — Remote Control

**Actions available from mobile:**

| Action        | Mobile UI               | Desktop result                     |
| ------------- | ----------------------- | ---------------------------------- |
| Select verse  | Bible tree → tap verse  | Verse pushed to all displays       |
| Advance queue | Tap "Next"              | Next queue item displayed          |
| Start timer   | Timer panel → Start     | All timers sync across windows     |
| Pause timer   | Timer panel → Pause     | Timer pauses on all windows        |
| Black screen  | Tap black screen button | General View goes black            |
| Show logo     | Tap logo button         | OCS branding shown on General View |

**Round-trip latency:** < 50ms over LAN (no cloud hop)

**Feedback per action:**

- Mobile: haptic vibration (single pulse = success)
- Mobile: content preview updates to show what's now displayed
- Desktop: debug bar logs the remote action source

---

### Disconnection & Reconnection

**If Wi-Fi drops:**

```
Socket disconnects detected
  → Mobile: "Reconnecting…" banner shown immediately
  → Mobile: retry every 5 seconds
  → Retry counter shown: "Attempting to reconnect (3/12)..."
  → Desktop: continues operating normally — no interruption
  ↓
If reconnected within 60s:
  → State re-synced from desktop
  → Mobile haptic: double pulse confirms reconnection
  → Banner dismissed — remote control resumes
  ↓
If not reconnected after 60s (12 attempts):
  → Mobile: "Connection lost" screen shown
  → Options: [Scan QR Again] [Enter IP Manually] [Continue offline]
```

**If desktop IP changes** (e.g. DHCP lease renews):

- Operator opens Remote tab — new QR code generated with updated IP
- Worship leader scans new QR code to reconnect

---

### Mobile App Capabilities

**Bible browser:**

- All 66 books listed with chapter counts
- Tap any chapter → verse list shown
- Tap any verse → pushed to General View immediately
- Verse highlights and translations in sync with desktop

**Queue management:**

- Full service queue shown on mobile
- Drag to reorder items during service
- Changes sync to desktop in real time
- Current position highlighted

**Timer controls:**

- All named timers shown (Worship, Sermon, Custom)
- Start, pause, reset per timer
- Remaining time shown live

**Dark mode:**

- Default on — stage environments are typically dark
- Protects operator's night vision during worship

---

## Workflow 4 — Crash Recovery Flow

**Purpose:** Return the operator to exactly the same service state in under 10 seconds after an unexpected quit  
**Trigger:** App crashes or quits unexpectedly during a live service  
**End state:** All displays restored to the correct content — service continues without interruption

---

### Phase 1 — Continuous Auto-Save (Normal Operation)

This runs silently throughout every service with no operator action required.

```
Every 30 seconds during service:
  → Snapshot of full service state written to disk (atomic write)
  → File: {userData}/session.ocs

State captured includes:
  ├── Current displayed verse (book, chapter, verse, translation)
  ├── Full service queue + current position index
  ├── All timer states (name, duration, elapsed, running/paused)
  ├── Active media file path
  ├── Current display styles (font, colour, size)
  └── Connected mobile device list

Retention: Session files kept for 7 days, then auto-pruned
```

**Worst case data loss:** Up to 30 seconds of changes (e.g. operator advanced 2 verses between saves).

---

### Phase 2 — Crash Event

**What crashes:**

- Power interruption
- OS force-quit
- Electron renderer crash
- Uncaught JavaScript exception
- Laptop overheating / sleep

**Immediate impact:**

- All OCS windows close
- General View and Speaker View go blank (congregation sees nothing)
- Mobile companion loses connection

**Operator action required:** Re-launch OCS immediately.

---

### Phase 3 — Recovery on Relaunch

**Step 1 — Relaunch OCS**

- Double-click the OCS application or click the dock icon
- Target: app is interactive in under 5 seconds

**Step 2 — Session file detected**

```
On launch:
  → Check {userData}/session.ocs
  → File found AND age < 7 days → show restore prompt
  → File not found OR too old → launch fresh (no prompt)
```

**Step 3 — Restore prompt**

```
Dialog shown immediately on launch:

┌─────────────────────────────────────────────┐
│  OCS was interrupted during a live session. │
│                                             │
│  Last saved: 2 minutes ago                  │
│  Verse: John 3:16 · KJV                     │
│  Queue: Item 4 of 12                        │
│  Timer: Sermon — 32:14 remaining            │
│                                             │
│  [Restore Session]      [Start Fresh]       │
└─────────────────────────────────────────────┘
```

**Step 4 — Restore path (tap "Restore Session")**

```
session.ocs loaded from disk
  ↓
Verse re-pushed via IPC
  → General View: correct verse displayed
  → Speaker View: verse + queue position restored
  ↓
Queue position restored
  → Operator sees same position in the service order
  ↓
Timers restored
  → All timers returned to saved values — PAUSED
  → Operator manually resumes when ready
  ↓
Media re-loaded
  → Active media file path verified and reloaded
  ↓
Display styles restored
  → Font, colour, size settings re-applied
  ↓
Mobile companion: auto-reconnect begins
  → Retries every 5s once desktop server is back up
```

**Step 5 — Operator confirms and continues**

- Verify displays show correct content
- Resume timer if needed
- Mobile companion will auto-reconnect within 10–15s

**Total downtime target: < 10 seconds from crash to correct content on screen.**

---

**Step 4 (alternate) — Fresh start path (tap "Start Fresh")**

```
Previous session.ocs moved to archive
  → Not deleted — retained for reference
  → Archive location: {userData}/sessions/archive/

OCS launches with blank state
  → Operator manually navigates to current verse
  → Use voice command: "OCS [book] [chapter] [verse]"
  → Or use verse search (Cmd+F)
  → Queue must be rebuilt manually
```

---

### Session File Contents (Technical Reference)

```json
{
  "version": "2.0",
  "saved_at": "2026-04-20T10:32:15Z",
  "verse": {
    "book": "John",
    "chapter": 3,
    "verse": 16,
    "translation": "KJV",
    "text": "For God so loved the world..."
  },
  "queue": {
    "items": [...],
    "current_index": 3
  },
  "timers": [
    {
      "name": "Sermon",
      "duration_seconds": 2700,
      "elapsed_seconds": 988,
      "state": "running"
    }
  ],
  "active_media": null,
  "styles": {
    "font_family": "Georgia",
    "font_size": 48,
    "text_color": "#FFFFFF",
    "background_color": "#000000"
  }
}
```

---

### Recovery Outcomes

| Scenario                        | Outcome                                           |
| ------------------------------- | ------------------------------------------------- |
| Restore within 10s              | Full state back. < 10s downtime.                  |
| Session file missing            | No prompt. Launch fresh.                          |
| Session file > 7 days old       | No prompt. Launch fresh.                          |
| Operator chooses "Start Fresh"  | Old session archived. Manual navigation required. |
| Restore fails (corrupt file)    | Error shown. Offered to launch fresh.             |
| Mobile reconnects after restore | State re-synced automatically.                    |

---

### Minimising Crash Risk

| Practice                                                   | Benefit                            |
| ---------------------------------------------------------- | ---------------------------------- |
| Keep OCS as the only fullscreen app                        | Reduces OS memory pressure         |
| Disable automatic OS updates during service hours          | Prevents forced restarts           |
| Plug into power — never run on battery during service      | Prevents low-battery sleep         |
| Test full recovery flow during rehearsal, not live service | Operator confident when it matters |
| Keep at least 2GB free disk space                          | Ensures session writes never fail  |

---

_OCS Workflow Documentation — v2.0 · April 2026_
_Part of the OCS Product Requirements Document suite._
