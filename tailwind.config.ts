import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-outfit)", "system-ui", "sans-serif"],
      },
      colors: {
        waymark: {
          bg: "#1e1d1b",
          surface: "#272624",
          border: "#3a3835",
          muted: "#7a7672",
          text: "#f0ede8",
          accent: "#c9a96e",
        },
      },
    },
  },
  plugins: [],
};
export default config;
