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
      },
    },
  },
  plugins: [],
};
