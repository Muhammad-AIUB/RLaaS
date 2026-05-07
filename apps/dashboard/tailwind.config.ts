import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#0b1220',
        fog: '#f3f7f2',
        moss: '#9dc08b',
        pine: '#235347',
        ember: '#d95d39',
        sand: '#f4e9cd',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 20px 60px rgba(11, 18, 32, 0.12)',
      },
      backgroundImage: {
        'mesh-glow':
          'radial-gradient(circle at top left, rgba(157, 192, 139, 0.35), transparent 30%), radial-gradient(circle at bottom right, rgba(217, 93, 57, 0.2), transparent 35%)',
      },
    },
  },
  plugins: [],
};

export default config;
