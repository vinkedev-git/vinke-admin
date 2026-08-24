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
        // Paleta Vinke (Direção H + canvas do admin).
        // Semântica: roxo = marca/ação, verde = SÓ acerto/saúde/melhora.
        vinke: {
          DEFAULT: "#6236F0", // ação primária, foco, nav ativa
          deep: "#3E1DB8", // hover do primário
          soft: "#F1EFFB", // fundo suave roxo (chips, atalhos)
          sel: "#F8F6FE", // linha/área selecionada (light)
          ring: "#EDE8FD", // anel de foco
          lav: "#8B6DFF", // roxo claro p/ dark mode (gráficos, acentos)

          green: "#17D07C", // preenchimentos de acerto (barras, badges)
          "green-text": "#0E9C5C", // texto verde sobre claro
          "green-soft": "#E6F9F0", // fundo de badge verde

          red: "#D6455D",
          "red-soft": "#FBEDF0",
          "red-dark": "#FF6E88", // texto negativo no dark

          amber: "#B4650A",
          "amber-soft": "#FDF3E3",
          "amber-bar": "#E8A13D",

          navy: "#0B0A21", // fundo dark / sidebar
          "navy-deep": "#070617", // sidebar no dark mode
          "navy-card": "#151233", // card no dark
          "navy-line": "#262047", // borda no dark
          "navy-sel": "#1D1745", // seleção no dark

          offwhite: "#F7F6F2", // fundo de página (light)
          ink: "#0B0A21", // texto principal
          ink2: "#5D5A72", // texto secundário
          ink3: "#8A87A0", // texto muted / labels
          ink4: "#B9B6C6", // texto faint / desabilitado
          line: "#ECEAF4", // borda padrão (light)
          line2: "#F0EFF3", // divisor de tabela
          line3: "#F7F6FA", // divisor de linha sutil
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
