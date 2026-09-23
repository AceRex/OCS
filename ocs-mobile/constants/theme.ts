/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * Universal OCS Design Tokens
 * Strictly enforces 12px border radius across all cards, containers, and interactive elements.
 */
export const DESIGN_TOKENS = {
  borderRadius: 12,
  borderRadiusClass: "rounded-[12px]",
  cardBackground: "#161B26",
  cardBorder: "rgba(255, 255, 255, 0.08)",
  cardBorderActive: "rgba(0, 229, 255, 0.3)",
};

/**
 * Centralized Quick Action Card Gradients
 * High-contrast, distinguishable, static linear gradients.
 */
export const TOOL_GRADIENTS: Record<string, [string, string]> = {
  connect: ["#FF416C", "#FF4B2B"],         // Host & Connection (Vibrant Coral/Rose)
  assets: ["#F2994A", "#F2C94C"],          // Media Share (Warm Amber/Gold)
  agenda: ["#8B5CF6", "#6D28D9"],          // Agenda Planner (Deep Violet)
  timer: ["#00E5FF", "#00A8FF"],           // Timer & Clock (Cyan/Electric Blue)
  scenes: ["#10B981", "#059669"],          // Scene & Lyrics (Emerald/Teal)
  bible: ["#3B82F6", "#1D4ED8"],           // Bible & Scripture (Sapphire Blue)
  presentation: ["#A855F7", "#7C3AED"],    // Teleprompter & Notes (Purple)
  "stage-control": ["#EF4444", "#B91C1C"], // Stage Master (Director Crimson)
  intercom: ["#84CC16", "#4D7C0F"],        // Intercom & Push-to-Talk (Lime Green)
  "live-switcher": ["#E52D27", "#B31217"], // Live Broadcast & Switcher (Live Red)
};

