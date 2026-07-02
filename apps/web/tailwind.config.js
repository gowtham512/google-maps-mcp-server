/** @type {import('tailwindcss').Config} */
import openuiTailwind from "@openuidev/react-ui/tailwind";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@openuidev/react-ui/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [openuiTailwind],
};
