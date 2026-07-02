/** @type {import('tailwindcss').Config} */
const openuiTailwind = require("@openuidev/react-ui/tailwind");

module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@openuidev/react-ui/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [openuiTailwind],
};
