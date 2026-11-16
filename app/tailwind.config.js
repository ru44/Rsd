/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Neutral, near-black panels with hairline borders, so the map is the
      // only colourful thing on screen. Whatever is active turns white.
      colors: {
        ink: "#09090B", // panel background
        raised: "#27272A", // hover and inset surfaces
        edge: "#2E2E33", // borders
        paper: "#FAFAFA", // text
        dim: "#A1A1AA", // secondary text
        signal: "#FAFAFA", // the active tool, the selected item
        friendly: "#7FD4F5",
        hostile: "#F87171",
      },
      fontFamily: {
        sans: ['"Geist Variable"', "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
