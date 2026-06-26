/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        valorant: {
          red: '#FF4655',
          dark: '#0F1923',
          panel: '#1A2632',
          panel2: '#22313F',
          accent: '#ECE8E1',
          muted: '#768079',
        },
        cls: {
          controller: '#9b8fff',
          duelist: '#ff6b6b',
          initiator: '#7ad6c0',
          sentinel: '#ffd166',
        },
      },
    },
  },
  plugins: [],
};
