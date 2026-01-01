/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#282828",
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
    },
  },
  plugins: [],
};
