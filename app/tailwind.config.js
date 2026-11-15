/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // A night map table: slate panels, map-paper text, amber for the grid
      // and for whatever is active.
      colors: {
        ink: "#14202B",
        raised: "#1D2C3A",
        edge: "#34495C",
        paper: "#E8E4D8",
        dim: "#93A3B1",
        signal: "#F2B441",
        friendly: "#7FD4F5",
        hostile: "#E5604D",
      },
      // B612 was drawn for aircraft cockpit displays: built to stay legible
      // at small sizes on a screen full of other information.
      fontFamily: {
        sans: ["B612", "system-ui", "sans-serif"],
        mono: ['"B612 Mono"', "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
