/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Vinke (Direção H). Semântica: roxo = marca/ação, verde = SÓ acerto/recompensa.
        vinke: {
          DEFAULT: "#6236F0",
          deep: "#3E1DB8",
          green: "#17D07C",
          "green-text": "#0E9C5C",
          navy: "#0B0A21",
          offwhite: "#F7F6F2",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "sans-serif"],
        sans: ["var(--font-manrope)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
