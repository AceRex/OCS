# OCS Design System Rule: Universal 12px Border Radius

## Invariant
Every UI component, container, card, modal, button, input, dropdown, multiview grid tile, preview element, and HUD badge in this project MUST have a border-radius of exactly **12px** (`rounded-xl` or `12px` / `0.75rem`).

## Guidelines for Implementations

1. **Containers & Cards**:
   - Use `rounded-xl` or `rounded-[12px]`.
   - Never use `rounded-sm` (unless configured as 12px), `rounded-md`, `rounded-2xl`, `rounded-3xl`, `rounded-[8px]`, `rounded-[16px]`, `rounded-[20px]`, or any arbitrary radius other than `12px`.
2. **Buttons, Badges & Inputs**:
   - All standard buttons, icon buttons, inputs, selects, and textareas must use `rounded-[12px]` or `rounded-xl`.
   - The only exception is circular status indicator dots / avatar pills where `rounded-full` is explicitly intended for 50% circle geometry. All non-circular components MUST use 12px.
3. **Tailwind Configurations**:
   - In both Desktop (`tailwind.config.js`) and Mobile (`ocs-mobile/tailwind.config.js`), the `borderRadius` theme scales (`xs`, `sm`, `DEFAULT`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`) are locked to `12px`.
   - CSS variable `--radius: 12px` in `src/index.css`.
4. **Consistency**:
   - Any new screen, component, or view created for Desktop or Mobile MUST strictly adhere to this 12px radius standard.
