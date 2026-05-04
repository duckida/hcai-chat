/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        neutral: {
          950: "#0a0a0a",
        },
      },
      typography: {
        invert: {
          css: {
            "--tw-prose-body": "rgb(229 229 229)",
            "--tw-prose-headings": "rgb(255 255 255)",
            "--tw-prose-lead": "rgb(209 213 219)",
            "--tw-prose-links": "rgb(96 165 250)",
            "--tw-prose-bold": "rgb(255 255 255)",
            "--tw-prose-counters": "rgb(156 163 175)",
            "--tw-prose-bullets": "rgb(75 85 99)",
            "--tw-prose-hr": "rgb(55 65 81)",
            "--tw-prose-quotes": "rgb(209 213 219)",
            "--tw-prose-quote-borders": "rgb(75 85 99)",
            "--tw-prose-captions": "rgb(156 163 175)",
            "--tw-prose-code": "rgb(229 229 229)",
            "--tw-prose-pre-bg": "rgb(23 23 23)",
            "--tw-prose-pre-code": "rgb(229 229 229)",
            "--tw-prose-th-borders": "rgb(75 85 99)",
            "--tw-prose-td-borders": "rgb(55 65 81)",
          },
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
  darkMode: "class",
};
