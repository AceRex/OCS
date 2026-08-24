# OCS (Organised Church Service) — Complete Technical Documentation

**Version:** 1.14  
**Last Updated:** August 2026  
**Architecture:** Electron (Desktop) + React 19 / Vite (Web) + Express / MongoDB (Backend)  

---

## 📑 Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Desktop Application (`OCS`)](#2-desktop-application-ocs)
   - [2.1 Process Model & Window Hierarchy](#21-process-model--window-hierarchy)
   - [2.2 Hybrid ASR & Voice Pipeline](#22-hybrid-asr--voice-pipeline)
   - [2.3 Display Canvas Compositor (`DisplayCanvas.js`)](#23-display-canvas-compositor-displaycanvasjs)
   - [2.4 Timer Controller & Dual-Action Editing](#24-timer-controller--dual-action-editing)
   - [2.5 Smart Agenda Planner (`AgendaPlannerModal.jsx`)](#25-smart-agenda-planner-agendaplannermodaljsx)
   - [2.6 Session Archiving, Bumpers & Tier 1 Bypass](#26-session-archiving-bumpers--tier-1-bypass)
   - [2.7 Desktop Auth & Permission Gating](#27-desktop-auth--permission-gating)
3. [Web Platform (`ocs-web`)](#3-web-platform-ocs-web)
   - [3.1 Tech Stack & Structure](#31-tech-stack--structure)
   - [3.2 Real-Time WebSocket Notification Bus](#32-real-time-websocket-notification-bus)
   - [3.3 Live Admin Dashboard & KPIs](#33-live-admin-dashboard--kpis)
   - [3.4 Download Tracking Telemetry](#34-download-tracking-telemetry)
   - [3.5 Commercial Pricing Matrix](#35-commercial-pricing-matrix)
4. [Backend API Infrastructure (`ocs-backend`)](#4-backend-api-infrastructure-ocs-backend)
   - [4.1 Architecture & Services](#41-architecture--services)
   - [4.2 WebSocket Gateway (`socket.js`)](#42-websocket-gateway-socketjs)
   - [4.3 Database Models & Schemas](#43-database-models--schemas)
   - [4.4 Transactional Email Engine (Resend)](#44-transactional-email-engine-resend)
5. [IPC Channels & API Specifications](#5-ipc-channels--api-specifications)
6. [Development, Build & Testing Guide](#6-development-build--testing-guide)

---

## 1. System Architecture Overview

OCS is structured across three core projects:

```
OCS Ecosystem
├── 🖥️ OCS (Desktop Application)
│   ├── Electron 30 Main Process (IPC Router, Window Manager, Audio Pipeline, Local SQLite)
│   ├── Controller Window (Operator UI, Redux Store, Agenda Planner, Presentation Controls)
│   ├── General View Window (Audience Display / Projector Output)
│   └── Speaker View Window (Stage Confidence Monitor / Teleprompter)
│
├── 🌐 ocs-web (Web Portal)
│   ├── React 19 + Vite + TypeScript + TailwindCSS
│   ├── Real-Time WebSocket Client (Socket.IO)
│   ├── Public Landing, Features, Pricing & Download Pages
│   └── Admin Management Console (Live KPIs, Downloads, Users, Tickets, Testimonials)
│
└── ⚙️ ocs-backend (Cloud Services & API)
    ├── Node.js / Express.js REST API
    ├── Socket.IO Real-Time Notification Broadcast Server
    ├── MongoDB (Users, Downloads, Tickets, Suggestions, Permissions)
    ├── Resend Transactional Email Engine
    └── Rate Limiting, GeoIP & JWT Authentication
```

---

## 2. Desktop Application (`OCS`)

### 2.1 Process Model & Window Hierarchy
The desktop application is built with Electron 30, segregating concerns across decoupled windows:

1. **Main Process (`main.js`)**:
   - Manages window lifecycles and display assignment (multi-monitor positioning).
   - Initializes local embedded SQLite Bible database queries.
   - Orchestrates FFmpeg audio concatenation for session bumper merges.
   - Houses the local Express/Socket.IO server for Mobile Companion pairing (`port 4000`).

2. **Controller Window (`src/App/controller/index.js`)**:
   - Primary operator interface containing Bible search, Presentation slides, Order of Service, and Timer controls.
   - Houses the central Redux state store (`state.jsx`, `slice.tsx`).

3. **General View (`src/App/View/index.js`)**:
   - Rendered on the church projector/main screen with hardware acceleration.
   - Clean, distraction-free display output without operator UI chrome.

4. **Speaker View**:
   - Confidence monitor display rendering current scripture, elapsed/remaining timer, and teleprompter scroll.

---

### 2.2 Hybrid ASR & Voice Pipeline
- **Primary Engine**: Local embedded `whisper.cpp` addon delivering high-accuracy offline transcription.
- **Fallback Engine**: Local lightweight Vosk engine (`vosk-koffi`) providing continuous word-by-word streaming partials.
- **Reference Aligner (`referenceAligner.js`)**:
  - Implements fuzzy Levenshtein alignment (edit distance $\le 2$) matching spoken speech to active scripture passages.
  - Supports bounded backward resynchronization ($\le 30$ tokens backward) for preacher backtracks.

---

### 2.3 Display Canvas Compositor (`DisplayCanvas.js`)
All visual content is rendered through a unified layer-stack compositor:

1. **Layer 1 — Background**: Solid background colors or normalized VP9/WebM video background loops.
2. **Layer 2 — Content Slot**: Renders one active content element:
   - `bible`: Scripture verse text with dynamic translation badges.
   - `scene`: Hymn or song lyric pages with read-along highlights.
   - `presentation`: PPTX/PDF slide graphics.
   - `timer`: Full-screen countdown / service timer.
3. **Layer 3 — Pinned Overlays**: Draggable and resizable graphic overlays (church logos, lower-thirds, speaker cards) preserved across content slot changes.
4. **Layer 4 — Broadcast Chrome**: Lower-third reference badges and time indicators.

---

### 2.4 Timer Controller & Dual-Action Editing
Located in `src/App/controller/TimerController.js`:
- **Timer Modes**: Scheduled Event Mode vs. Manual Countdown Mode.
- **Visual Warning Thresholds**: Automatic amber/red background alert transitions at $T \le 10\text{s}$.
- **Dual-Action Time Editing**:
  - **"Add" Action**: Adds entered minutes directly to the currently running countdown without resetting elapsed session metrics.
  - **"Update" Action**: Overrides set duration with new time while continuously saving updated Label and Speaker anchor fields.

---

### 2.5 Smart Agenda Planner (`AgendaPlannerModal.jsx`)
Integrated directly into the timer controls for Tier 2+ operators:

```jsx
// Agenda Planner Configuration Structure
{
  [itemId]: {
    recordAudio: boolean,         // Whether audio recording is active for this session
    startMedia: 'none' | 'color' | 'video' | 'audio',
    startValue: string,           // Hex color or media path
    midMedia: 'none' | 'warning_color' | 'audio' | 'image',
    midValue: string,
    endMedia: 'none' | 'blackout' | 'video' | 'audio',
    endValue: string
  }
}
```

- **Per-Session Recording Controls**: Selective checkboxes allow excluding worship singing or announcements while capturing the sermon.
- **Start Cue Automation**: Sets canvas background color or triggers intro video/audio bumpers upon countdown start.
- **Mid-Run Warning Cues**: Dispatches amber flashing cues or audio chimes at 10s or 50% threshold.
- **Completion Cues**: Triggers automatic canvas blackout or outro video/audio bumpers upon time expiration (`00:00:00`).

---

### 2.6 Session Archiving, Bumpers & Tier 1 Bypass
Located in `src/main/sessionArchive.js` and `src/main/sessionAudio.js`:
- **Tier 2+ Flow**: Captures 16kHz WebM audio chunks from microphone input. Upon session completion, it stitches optional Intro/Outro bumpers (`ffmpeg-static`), generates sermon metadata (`meta.json`), and creates a sermon study PDF with captured scripture references.
- **Tier 1 Bypass**: If the user is on a Tier 1 plan (`free`, `mini`, `trial`, `guest`) or if the session was unchecked in the Agenda Planner:
  - `pushAudioChunk()` drops buffers immediately.
  - `finalizeSession()` skips audio encoding and bumper concatenation, generating a lightweight metadata log without disk or CPU overhead.

---

### 2.7 Desktop Auth & Permission Gating
- **`AuthContext.js`**: Provides client-side role and permission evaluation (`hasPermission(key)`).
- **`DisabledContainer.js`**: Reusable container displaying clear feature-locked state with upgrade CTAs when Tier 1 users attempt to access gated features (`SessionsController.js` and Bumpers in `SettingsController.js`).

---

## 3. Web Platform (`ocs-web`)

### 3.1 Tech Stack & Structure
- **Framework**: React 19, TypeScript, Vite, TailwindCSS.
- **State & Data Fetching**: TanStack React Query (`queries.ts`, `mutations.ts`).
- **Icons & Visuals**: `lucide-react`, `react-icons`, Recharts.

---

### 3.2 Real-Time WebSocket Notification Bus
Integrated in `AdminLayout.tsx`:
- Subscribes to Socket.IO events (`admin:notification`, `admin:metrics`).
- Plays dynamic toast alerts on new tickets, suggestions, testimonials, or app downloads.
- Real-time notification dropdown displaying live time-ago indicators and unread badge counter.

---

### 3.3 Live Admin Dashboard & KPIs
Located in `AdminDashboard.tsx`:
- Consumes real backend queries (`useAdminDownloadsQuery`, `useUsersQuery`, `useTicketsQuery`).
- Renders live KPIs: Total Downloads, Active Accounts, Open Support Tickets, Active 60-Day Trials.
- Dynamic 6-tier subscription breakdown chart and 6-month download trend line chart.

---

### 3.4 Download Tracking Telemetry
- **Public Download Page (`DownloadPage.tsx`)**: Logs installation clicks via `POST /api/downloads` with client platform (`mac`, `windows`, `android`, `ios`) and version metadata.
- **Admin Audit View (`AdminDownloads.tsx`)**: Real-time table of all downloads with church names, platform pills, and distribution charts.

---

### 3.5 Commercial Pricing Matrix
Located in `PricingPage.tsx`:
- Updated plan cards and comparison matrix clearly detailing that **Sessions Archive & Automated Multi-Track Audio Recording** and **Agenda Planner & Media Cues** are exclusive to **Tier 2+ (Standard, Large, Premium)**.

---

## 4. Backend API Infrastructure (`ocs-backend`)

### 4.1 Architecture & Services
- **Framework**: Express.js REST API with Helmet security headers, CORS, and Gzip compression.
- **Database**: MongoDB via Mongoose.
- **Authentication**: JWT tokens with bcrypt password hashing.
- **Security**: Rate limiters on sensitive endpoints (`/api/auth/login`, `/api/auth/forgot-password`).

---

### 4.2 WebSocket Gateway (`socket.js`)
- Initializes Socket.IO with CORS validation.
- Provides helper functions `emitAdminNotification()` and `emitAdminMetrics()` called across route handlers (`tickets.js`, `suggestions.js`, `downloads.js`).

---

### 4.3 Database Models & Schemas
1. **User (`User.js`)**:
   - Stores `churchName`, `email`, `password`, `tier`, `role` (`church_admin`, `admin`, `super_admin`), `trialEndsAt`, `activeSessions`.
2. **Download (`Download.js`)**:
   - Records `platform`, `appVersion`, `ipAddress`, `country`, `churchName`, `createdAt`.
3. **Ticket (`Ticket.js`)**:
   - Support ticket tracker with `status` (`open`, `in-progress`, `resolved`, `closed`), `priority`, and messages.
4. **PlanPermission (`PlanPermission.js`)**:
   - Dynamic 22-permission mapping editable at runtime by super-admins.

---

### 4.4 Transactional Email Engine (Resend)
Located in `src/utils/emailService.js`:
- Sends responsive HTML emails via Resend HTTP API.
- Automated triggers:
  - Welcome confirmation email on signup.
  - Password reset links with single-use hashed tokens.
  - Support ticket creation and status update alerts.

---

## 5. IPC Channels & API Specifications

### Key Electron IPC Channels

| Channel | Direction | Payload | Description |
| :--- | :---: | :--- | :--- |
| `Session:emitTimerLifecycle` | Renderer $\to$ Main | `{ type, timerId, title, recordAudio, durationSec }` | Emits timer start/stop/pause events for audio capture |
| `Session:pushAudioChunk` | Renderer $\to$ Main | `ArrayBuffer` | Streams microphone audio chunks to session archiver |
| `Presentation:setContent` | Renderer $\to$ Main | `Object` or `null` | Updates active presentation slide or triggers blackout |
| `Presentation:setStyles` | Renderer $\to$ Main | `{ backgroundColor, ... }` | Sets display canvas background colors |
| `auth:open-browser` | Renderer $\to$ Main | `String (url)` | Launches external browser for web-redirect login |

---

### Key Backend REST Endpoints

| Method | Endpoint | Auth Level | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/register` | Public | Registers a new account with 60-day trial |
| `POST` | `/api/auth/login` | Public | Authenticates account and returns JWT token |
| `POST` | `/api/auth/forgot-password` | Public | Sends password reset email via Resend |
| `POST` | `/api/auth/reset-password` | Public | Validates reset token and sets new password |
| `POST` | `/api/downloads` | Public | Logs an app download event |
| `GET` | `/api/admin/downloads` | Admin | Retrieves audited list of all download logs |
| `GET` | `/api/admin/users` | Admin | Retrieves customer accounts and active tiers |
| `PUT` | `/api/permissions/user/:id/tier`| Super Admin | Overrides a user's subscription tier |

---

## 6. Development, Build & Testing Guide

### Running OCS Desktop
```bash
cd /Users/rex/OCS
npm install
npm start  # Launches webpack watchers and Electron desktop
```

### Running Backend API
```bash
cd /Users/rex/ocs-backend
npm install
npm test   # Executes Jest test suite (67 unit/integration tests)
npm run dev
```

### Running Web Portal
```bash
cd /Users/rex/ocs-web
npm install
npm run build # Validates TypeScript types and generates production bundle
npm run dev   # Starts Vite dev server
```
