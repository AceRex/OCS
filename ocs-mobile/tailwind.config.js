/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
    presets: [require("nativewind/preset")],
    theme: {
        extend: {
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
        },
    },
    plugins: [],
}
