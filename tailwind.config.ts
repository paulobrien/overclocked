/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The palette from §8 — grounded in the warehouse subject, lane colors
        // are literally the Cerebras (orange) and event (blue) brand hues.
        'floor-slate': '#1A1F2B',
        'floor-deep': '#141926',
        panel: '#1F2734',
        steel: '#2A3340',
        'cerebras-orange': '#EF5A2A',
        'cerebras-dim': '#7d3724',
        'challenger-blue': '#3C7BF2',
        'challenger-dim': '#274a86',
        manila: '#E8DCC0',
        'manila-edge': '#cdb78c',
        'manila-shadow': '#b9a373',
        ink: '#2A2620',
        'overflow-amber': '#F5A623',
        'cleared-green': '#46C46E',
        'alert-red': '#e0533f',
      },
      fontFamily: {
        sig: ['Oswald', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        hud: ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        tread: { to: { backgroundPositionX: '-48px' } },
        pulse: { '50%': { opacity: '0.45' } },
        nudge: { '50%': { transform: 'translateY(-50%) translateX(-2px)' } },
        thwack: {
          '0%': { transform: 'rotate(-9deg) scale(1.6)', opacity: '0' },
          '60%': { opacity: '1' },
          '100%': { transform: 'rotate(-9deg) scale(1)', opacity: '1' },
        },
        breathe: { '50%': { transform: 'translateY(-1.6px)' } },
        celebrate: {
          '0%,100%': { transform: 'translateY(0) rotate(0deg)' },
          '28%': { transform: 'translateY(-9px) rotate(-3deg)' },
          '55%': { transform: 'translateY(-1px) rotate(3deg)' },
          '80%': { transform: 'translateY(-4px) rotate(-1deg)' },
        },
        fistpump: {
          '0%,100%': { transform: 'translateY(2px) rotate(-8deg)' },
          '50%': { transform: 'translateY(-13px) rotate(-48deg)' },
        },
        tremble: {
          '0%': { transform: 'translateX(-1.2px)' },
          '50%': { transform: 'translateX(1.2px)' },
          '100%': { transform: 'translateX(-1.2px)' },
        },
        twinkle: {
          '0%,100%': { opacity: '0', transform: 'scale(.3)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
