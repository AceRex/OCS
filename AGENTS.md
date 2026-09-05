# OCS Agent Guidelines & Behavioral Invariants

## 1. Design System: Universal 12px Border Radius

**Mandate**: Every border-radius across the entire project (Desktop and Mobile) MUST be exactly **12px**.
- Structural elements, cards, multiview tiles, dialogs, modals, popovers, drawers, panels, and controls use `12px` (`rounded-xl` or `rounded-[12px]`).
- Buttons and inputs use `12px` (`rounded-[12px]` or `rounded-xl`).
- Circular indicators (pills/dots) may use `rounded-full`, but all structural containers and components must strictly use `12px`.
- Do NOT introduce new border-radius values (e.g. 4px, 6px, 8px, 10px, 14px, 16px, 20px, 24px, 30px, 50px). All new implementations must strictly follow the 12px rule.

## 2. Architecture & Offline-First Principles

- **Desktop (Electron)**: Main controller and media playout engine.
- **Mobile Companion (`ocs-mobile`, Expo / React Native)**: Remote control, camera streaming, and intercom.
- **Offline First**: All local church presentation and switcher capabilities must work with zero internet connectivity on the local LAN.
- **Multi-Camera Switcher**: Strict 6-device camera slot cap, server-side controller permission enforcement, 8-tile multiview grid, hard-cut switching, and local destination routing to General View / Speaker View.
