import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0F2A4A",
          light: "#1A3A5C",
          mid: "#1E4976",
        },
        blue: {
          DEFAULT: "#2563EB",
          light: "#6BAADF",
          hover: "#1D4ED8",
          soft: "#EFF6FF",
        },
        surface: "#FAFBFC",
        card: "#FFFFFF",
        success: {
          DEFAULT: "#059669",
          bg: "#ECFDF5",
        },
        warning: {
          DEFAULT: "#D97706",
          bg: "#FFFBEB",
        },
        danger: {
          DEFAULT: "#EF4444",
          bg: "#FEF2F2",
        },
        muted: "#6B7280",
        body: "#1F2937",
        mathbg: "#F0F3F7",
        border: "#E8EBF0",
        accent: {
          DEFAULT: "#C7D5E5",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "sans-serif"],
      },
      fontSize: {
        heading: ["28px", { lineHeight: "1.3", letterSpacing: "-0.3px", fontWeight: "500" }],
        "heading-sm": ["24px", { lineHeight: "1.3", letterSpacing: "-0.3px", fontWeight: "500" }],
        label: ["11px", { lineHeight: "1.4", letterSpacing: "0.8px", fontWeight: "500" }],
      },
      spacing: {
        sidebar: "240px",
        topbar: "56px",
      },
    },
  },
  plugins: [],
};
export default config;
