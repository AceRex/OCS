/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{html,js,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        light: "#F6F3F1",
        ash: "#646363",
        red: "#F53C11",
        green: "#0AEF76",
        assent: { 100: "#112c70", 200: "#5b58eb", 300: "#BB63FF", 400: "#56E1E9", 500: "#0A2353" },
        assent2: {
          100: "#f4fffc",
          200: "#91eaaf",
          300: "#c3e956",
          400: "#4d7111",
          500: "#1f4b2c"
        },
        assent3: {
          100: "#FCEDD8",
          200: "#FFD464",
          300: "#FF5E5E",
          400: "#E23C64",
          500: "#B0183D"
        },
        assent4: {
          100: "#FFF7AD",
          200: "#FFB3AE",
          300: "#FF49C1",
          400: "#6A1452",
          500: "#44113E"
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
