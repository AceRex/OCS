# OCS — Standing Engineering Rules

**Read this file at the start of every session, before doing any work.** These rules exist because specific, repeated failures happened without them. Each rule below traces to a real incident in this project's history — they are not theoretical.

---

## 1. Never cite a requirement that doesn't exist

**Why this rule exists:** Prior audits cited FR-6.20–FR-6.27 and FR-6.30–FR-6.39 for features that had no corresponding entries in PRD.md. These were invented during self-verification, not real citations — a compliance check against a requirement that doesn't exist is not a compliance check.

**The rule:** Only cite an FR/NFR number that actually appears in the current PRD.md. If you're checking behavior that has no corresponding requirement, say so explicitly: _"No corresponding requirement in PRD.md — flagging as undocumented, not citing a number."_ Never invent a plausible-sounding FR number to make an audit table look complete.

---

## 2. New capabilities need a spec checkpoint before implementation, not after

**Why this rule exists:** NDI/broadcast streaming, PDF import, Mobile Scene Creator, and Continuous Voice Mode were all built and shipped across multiple commits before ever being discussed. They were discovered retroactively via `git log`, days later, already built. NDI specifically kept getting _feature_ work (throughput optimization) added on top of an _unreviewed security posture_ — the security question was never blocking further development, it just got built past.

**The rule:** If a task naturally suggests building something beyond what was explicitly requested — a new user-facing screen, a new network service, a new file format, a new always-on background behavior — **stop and flag it before implementing**, even if it seems like an obvious improvement. Describe what you're proposing and why in your response, and wait for confirmation. This is especially non-negotiable for anything that:

- Opens a new network-exposed surface (a new listening port, a new discoverable service, a new stream)
- Runs continuously/in the background rather than on explicit user action
- Handles authentication, pairing, or file transfer

---

## 3. A green test suite is a claim, not proof — distinguish interaction-level from logic-level verification

**Why this rule exists:** The mobile file-picker bug: `scripts/test-mobile-asset-transfer.js` passed 100% while the actual "Select File" button did nothing on a real device (it called a web `document.createElement` API that doesn't exist in React Native, silently falling through to a placeholder alert). The test suite verified the transfer/payload logic correctly — it never verified that a human tapping the button gets a real picker.

**The rule:** For any feature involving direct user interaction (buttons, pickers, modals, voice activation, drag/drop), your report must explicitly state one of:

- **"Interaction-verified"** — you personally drove the real interaction (real device, simulator, or manual trace of the actual event handler chain with no assumed steps) and confirmed the real outcome.
- **"Logic-verified only"** — your test suite confirms the code behaves correctly given an assumed input/state, but you did not confirm a real user can actually reach that state through the real UI.

Never report a feature as simply "PASS" or "IMPLEMENTED" without this distinction attached. If it's logic-verified only, say what specifically would need real-device/interaction testing to close the gap.

---

## 4. Security-sensitive changes get a dedicated stop, not a footnote

**Why this rule exists:** NDI streaming's security posture (default-on or off? any access control? what's actually exposed on the church's LAN?) was raised explicitly and then the next round of work optimized stream throughput without answering it.

**The rule:** Any change touching network exposure, authentication, pairing tokens, or file-transfer trust boundaries requires its own explicit answer to "what can go wrong and who is affected" before any further feature work builds on top of it. If a security question was raised in a prior task and not resolved, it blocks new work in that area — you may not add features to an unresolved security surface.

---

## 5. Real-device/hardware limits must be stated as the headline, not buried

**Why this rule exists:** Multiple mobile audit reports correctly noted "no physical device tested" but presented it as a minor caveat alongside a confident "Confirmed Solid" verdict — easy to miss, easy to treat as ready anyway.

**The rule:** If your environment cannot access real hardware (a phone, a simulator, actual Bluetooth/Wi-Fi conditions), that limitation goes in the **first paragraph** of your report, in plain language, followed by an explicit list of exactly which claims are therefore unverified at the real-world level. Do not let a clean test-suite table imply confidence the environment cannot actually support.

---

## 6. Existing guardrails (carried forward from every task in this project)

- Never modify Timer Controller or Session Folders code unless a task explicitly says otherwise.
- Every "fixed"/"implemented"/"working" claim needs real evidence (actual output, actual observed behavior) — not a description of what the code should do.
- Reuse existing architecture/components before building parallel implementations — check what already exists first.
- When uncertain whether something is in scope, ask or flag rather than assuming and proceeding.

---

## How to use this file

At the start of a task, confirm you've read this file. If a task conflicts with one of these rules (e.g. asks you to build something without a spec checkpoint), flag the conflict rather than silently picking one instruction over the other.
