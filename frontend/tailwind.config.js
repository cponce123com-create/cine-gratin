/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          red: "#E50914",
          gold: "#F5C518",
          dark: "#0A0A0A",
          card: "#141414",
          surface: "#1A1A1A",
          border: "#2A2A2A",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      aspectRatio: {
        poster: "2/3",
        video: "16/9",
      },
    },
  },
  plugins: [],
};
