import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#d7372b",
          dark: "#a32118",
        },
      },
      keyframes: {
        fadein: {
          "0%": { opacity: "0", transform: "translate(-50%, -8px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        popin: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        fadein: "fadein .25s ease-out",
        popin: "popin .18s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
