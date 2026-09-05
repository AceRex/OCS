/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{html,js,jsx,ts,tsx}",
    "./components/**/*.{html,js,jsx,ts,tsx}",
    "./renderer/**/*.{html,js,jsx,ts,tsx}",
    "./*.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "sans-serif"],
        grotesk: ["Space Grotesk", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // Cathedral Midnight palette
        bg: "#0B0814",
        surface: "#1A1428",
        "surface-elevated": "#231A36",
        "ocs-border": "#2E2542",
        fg: "#F5F2FA",
        muted: "#8882A4",
        violet: "#A788FA",
        cyan: "#67E8F9",
        amber: "#FCD34D",
        primary: {
          DEFAULT: "#282828",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        light: "#F5F2FA",
        ash: "#8882A4",
        red: "#F53C11",
        green: "#0AEF76",
        assent: { 100: "#112c70", 200: "#5b58eb", 300: "#A788FA", 400: "#67E8F9", 500: "#0B0814" },
        assent2: { 100: "#f4fffc", 200: "#91eaaf", 300: "#c3e956", 400: "#4d7111", 500: "#1f4b2c" },
        assent3: { 100: "#FCEDD8", 200: "#FCD34D", 300: "#FF5E5E", 400: "#E23C64", 500: "#B0183D" },
        assent4: { 100: "#FFF7AD", 200: "#FFB3AE", 300: "#FF49C1", 400: "#6A1452", 500: "#44113E" }
      },
      boxShadow: {
        "glow-violet": "0 0 24px rgba(167, 136, 250, 0.3)",
        "glow-cyan":   "0 0 24px rgba(103, 232, 249, 0.3)",
        "elevated":    "0 8px 32px rgba(0,0,0,0.5)",
      },
      borderRadius: {
        none: "0",
        xs: "12px",
        sm: "12px",
        DEFAULT: "12px",
        md: "12px",
        lg: "12px",
        xl: "12px",
        "2xl": "12px",
        "3xl": "12px",
        full: "9999px",
      },
      transitionTimingFunction: {
        "ocs": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
