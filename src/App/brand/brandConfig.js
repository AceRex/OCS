/**
 * wave.io Central Brand Configuration
 * Single source of truth for branding, palette tokens, and official asset imports.
 */

import waveIconFullColor from "@/assets/wave/wave_icon_full_color.png";
import waveIconWhite from "@/assets/wave/wave_icon_white.png";
import waveIconGray from "@/assets/wave/wave_icon_gray.png";
import waveIconBlack from "@/assets/wave/wave_icon_black.png";

import waveHorizontalFullColor from "@/assets/wave/wave_horizontal_full_color.png";
import waveHorizontalWhite from "@/assets/wave/wave_horizontal_white.png";
import waveHorizontalGray from "@/assets/wave/wave_horizontal_gray.png";
import waveHorizontalBlack from "@/assets/wave/wave_horizontal_black.png";

import waveStackedFullColor from "@/assets/wave/wave_stacked_full_color.png";
import waveStackedWhite from "@/assets/wave/wave_stacked_white.png";
import waveStackedGray from "@/assets/wave/wave_stacked_gray.png";
import waveStackedBlack from "@/assets/wave/wave_stacked_black.png";

import waveWordmarkFullColor from "@/assets/wave/wave_wordmark_full_color.png";

export const BRAND = {
  name: "wave.io",
  legalName: "wave.io Technologies",
  tagline: "Live Worship & Presentation Suite",
  docsUrl: "https://waveio-git-main-acerexs-projects.vercel.app/docs",
  supportEmail: "support@wave.io",

  colors: {
    deepNavy: "#0B1020",
    electricBlue: "#00A8FF",
    cyan: "#00E5FF",
    violet: "#8B5CF6",
    charcoalGray: "#303030",
    lightGray: "#E5E7EB",
    white: "#FFFFFF",
    // Functional operational colors (preserved)
    recording: "#EF4444",
    liveGreen: "#10B981",
    warningAmber: "#F59E0B",
  },

  assets: {
    icon: {
      fullColor: waveIconFullColor,
      white: waveIconWhite,
      gray: waveIconGray,
      black: waveIconBlack,
    },
    horizontal: {
      fullColor: waveHorizontalFullColor,
      white: waveHorizontalWhite,
      gray: waveHorizontalGray,
      black: waveHorizontalBlack,
    },
    stacked: {
      fullColor: waveStackedFullColor,
      white: waveStackedWhite,
      gray: waveStackedGray,
      black: waveStackedBlack,
    },
    wordmark: {
      fullColor: waveWordmarkFullColor,
    },
  },
};

export default BRAND;
