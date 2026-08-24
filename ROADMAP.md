# OCS (Organised Church Service) — Master Product Roadmap

**Document Version:** 1.0.0  
**Last Updated:** August 2026  
**Status:** Active Execution & Release Tracking  

---

## 🗺️ 1. Executive Summary & Vision

**OCS (Organised Church Service)** is an offline-first, AI-assisted worship projection, sermon archiving, and service automation platform designed for modern churches, ministries, broadcasters, and podcasters.

The platform eliminates operator panic during live services by combining:
- **Speech-driven scripture detection** (whisper.cpp + Vosk ASR) requiring zero manual lookup clicks.
- **Unified Layer Compositor (`DisplayCanvas`)** for seamless overlaying of scriptures, songs, presentations, timers, and videos.
- **Smart Agenda Planning & Broadcast Automation** with dynamic cue triggers (backgrounds, video bumpers, audio chimes).
- **Automated Sermon Archiving** capturing multi-track audio, synchronized scripture references, and generated sermon study PDFs.
- **Enterprise Web Infrastructure** featuring real-time WebSocket push notifications, live downloads telemetry, and 6-tier licensing.

---

## 🎯 2. Phase Breakdown & Implementation Status

```mermaid
gantt
    title OCS Development Phases & Milestones
    dateFormat  YYYY-MM-DD
    section Phase 1: Core Engine
    Offline Bible SQLite & ASR Pipelines       :done, p1, 2026-01-01, 2026-03-01
    DisplayCanvas Compositor & Dual Monitors   :done, p2, 2026-02-15, 2026-04-01
    section Phase 2: MSTP Suite
    Media & Presentation Engine (PPTX/PDF)     :done, p3, 2026-03-15, 2026-05-15
    Scene Creator & Pinned Layer Drag Handles  :done, p4, 2026-04-15, 2026-06-01
    section Phase 3: Service Planning & Voice
    Order of Service Planner & Timer Engine    :done, p5, 2026-05-01, 2026-06-30
    Reference Aligner & Teleprompter           :done, p6, 2026-06-01, 2026-07-15
    section Phase 4: Sessions & Agenda Planner
    Session Audio Archive & Bumper Stitching   :done, p7, 2026-07-01, 2026-08-10
    Tier 2 Gating & Smart Agenda Planner       :done, p8, 2026-08-10, 2026-08-24
    section Phase 5: Cloud & Web Platform
    Backend Auth, Rate Limiters & Resend Email :done, p9, 2026-07-15, 2026-08-15
    Real-Time WebSocket Feed & Dashboard       :done, p10, 2026-08-15, 2026-08-24
    section Phase 6: Mobile & Broadcast
    Mobile Companion Pairing & Asset Transfer  :active, p11, 2026-08-20, 2026-10-01
    NDI Broadcast Streams & Hardening          :active, p12, 2026-08-25, 2026-10-15
    section Phase 7: Future Expansion
    Multi-Campus Cloud Sync & AI Translations  :planned, p13, 2026-10-15, 2027-01-15
```

---

### ✅ Phase 1: Core Engine & Offline Presentation (Completed)
- **Local Embedded SQLite Bible**: Instant lookup across 11 canonical translations (KJV, NIV, ESV, NKJV, NLT, AMP, MSG, CSB, NASB, RSV, ASV).
- **Hybrid ASR Engine**: Primary fast local whisper.cpp engine with Vosk-small continuous fallback for real-time voice-to-scripture matching.
- **DisplayCanvas Compositor**: Multi-window presentation system routing separate feeds to Controller (Preview), Speaker View (Stage Display / Confidence Monitor), and General View (Projector / Main Screen).
- **Offline Session Cache**: 72-hour offline operation grace period ensuring uninterrupted services during internet drops.

---

### ✅ Phase 2: Media, Scene, Text & Presentation Suite (MSTP) (Completed)
- **Background & Pinned Media Layers**: Layer-stack compositor supporting video loops, solid colors, and draggable/resizable pinned images.
- **Presentation Deck Ingest**: Cross-platform conversion of `.pptx` and `.pdf` slide decks with slide navigation via UI, hotkeys, and voice triggers.
- **Scene Lyric & Song Engine**: Section-based hymn authoring with repeat flows, chorus loops, and auto-split pasting.

---

### ✅ Phase 3: Service Planning, Timers & Teleprompter (Completed)
- **Order of Service Planner**: Dynamic drag-and-drop service segment sequencing with auto-advance and delay countdowns.
- **Enhanced Timer Controller**:
  - Dual-action timer editing (**Add** minutes vs. **Update** duration).
  - Interval segment scheduling and custom skin themes (`default`, `digital`, `minimal`, `pill`).
- **Reference Aligner & Teleprompter**:
  - Continuous speech alignment for scripture read-along and free-text sermon notes.
  - Bounded backward resynchronization for natural speaker backtracks.

---

### ✅ Phase 4: Sessions Archive, Bumpers & Smart Agenda Planner (Completed)
- **Tier 2+ Entitlement Gating**:
  - Permission-locked `SessionsController` and broadcast Bumpers tab with upgrade prompts for Tier 1 accounts (`free`, `mini`, `trial`, `guest`).
  - Tier 1 audio bypass preventing unneeded recording disk usage and CPU load.
- **Broadcast Bumpers & Auto-Stitching**:
  - Intro and Outro video/audio bumper assignment with automated FFmpeg concatenation.
- **Smart Agenda Planner (`AgendaPlannerModal`)**:
  - Per-session audio recording check matrix with bulk select/deselect.
  - **Start Cues**: Solid background color application, intro video bumpers, intro audio chimes.
  - **Mid-Run Warning Cues**: 10-second/half-time amber flashing, warning alerts, prompt cues.
  - **Completion Cues**: Automatic display blackout, outro bumpers, benediction wraps.

---

### ✅ Phase 5: Cloud Platform, Licensing & Web Analytics (Completed)
- **Backend Architecture (`ocs-backend`)**:
  - Express.js REST API running with MongoDB persistence, rate limiting, and JWT authentication.
  - Resend transactional email integration (ticket alerts, password resets, onboarding emails).
  - 6-Tier Licensing Model (`trial`, `free`, `mini`, `standard`, `large`, `premium`) with super-admin permission overrides.
- **Real-Time WebSocket Bus (`socket.js`)**:
  - Socket.IO server broadcasting `admin:notification` and `admin:metrics` on ticket submissions, suggestions, testimonials, and app downloads.
- **Web Portal & Real-Time Dashboard (`ocs-web`)**:
  - Live Admin Dashboard aggregating KPIs (Downloads, Active Accounts, Open Tickets, 60-Day Trials) and 6-month timeline charts.
  - Real-time notification bell dropdown with live badge counters, deep-links, and popup toasts.
  - Download tracking endpoint (`POST /api/downloads`) and audited log table (`AdminDownloads.tsx`).
  - Pricing Matrix updated to reflect Tier 2+ exclusivity for Sessions Archive and Audio Recording.

---

### 🚧 Phase 6: Mobile Companion & Broadcast Streaming (In Progress / Hardening)
- **Mobile Companion App (iOS / Android)**:
  - QR Code Pairing using launch-scoped master tokens and per-device session tokens.
  - Remote control for timers, scripture changes, slide navigation, and lyric advancement.
  - Secondary Push-to-Talk and Continuous mic streaming for roaming pastors.
  - Mobile Asset Air-Drop with mandatory desktop operator review gate before display.
- **Broadcast & NDI Integration**:
  - mDNS-advertised HTTP/MJPEG program and stage video streams for OBS Studio and vMix.
  - Production code signing (macOS Developer ID + Notarization, Windows Authenticode).

---

### 🔮 Phase 7: Multi-Campus Cloud Sync & AI Intelligence (Planned)
- **Multi-Campus Cloud Setlists**: Real-time synchronization of Order of Service and sermon slide decks across satellite campuses.
- **Multilingual Real-Time AI Subtitles**: Real-time translation of spoken sermons projected onto stage and broadcast outputs.
- **Interactive Congregation Hymnal**: Mobile web view for congregation members to follow lyric progressions on personal devices.

---

## 📊 3. Tier & Feature Entitlement Matrix

| Feature Module | Free / Guest | Mini ($2/6mo) | Standard ($3/6mo) | Large ($5/6mo) | Premium (Custom) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Basic Countdown & Timer** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Live Broadcast Output** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Offline Bible (11 Versions)** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **General Presentation (PPTX/PDF)** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Custom Timer Views & Interval Delays** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Sessions Archive & Audio Recording** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Broadcast Bumpers & Auto-Stitching** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Smart Agenda Planner & Media Cues** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Scripture Teleprompter & Read-Along** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Sing-Along Karaoke Worship Guide** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Dynamic Scene Animations & Transitions**| ❌ | ❌ | ❌ | ✅ | ✅ |
| **Concurrent Desktop Seats** | 1 | 1 | 1 | 2 | 99 (Unlimited) |
| **Concurrent Mobile Seats** | 1 | 3 | 5 | 5 | 99 (Unlimited) |
