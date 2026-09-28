// Every color the app uses reads a CSS variable, so switching theme is a
// change of variables on <html> rather than of classes in every view. Only the
// shades the app actually uses are wired; the rest keep Tailwind's defaults.
// The variables themselves live in index.css.
const themed = (family, shades) =>
  Object.fromEntries(shades.map((s) => [s, `rgb(var(--c-${family}-${s}) / <alpha-value>)`]));

/** @type {import('tailwindcss').Config} */
export default {
  // Class names are only ever written out in full, never assembled at runtime,
  // so scanning the source finds every one. Keep it that way: a class built
  // from a template string would silently be missing from the stylesheet.
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Teko', 'sans-serif'],
      },
      colors: {
        // `white` is the primary text color, so it goes dark in light mode.
        // Text on a filled accent button uses `onaccent`, which never flips.
        white: 'rgb(var(--c-white) / <alpha-value>)',
        onaccent: 'rgb(255 255 255 / <alpha-value>)',
        slate: themed('slate', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        ice: themed('ice', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        red: themed('red', [100, 200, 300, 400, 500, 600, 900]),
        green: themed('green', [300, 400, 500, 900]),
        blue: themed('blue', [300, 500, 900]),
        yellow: themed('yellow', [300, 500, 900]),
        purple: themed('purple', [300, 900]),
        orange: themed('orange', [500]),
        amber: themed('amber', [400]),
        puck: '#1e293b',
      },
    },
  },
  plugins: [],
};
