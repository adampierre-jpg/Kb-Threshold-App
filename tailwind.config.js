/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Essential Fitness brand colors
        oxblood: {
          DEFAULT: '#722F37',
          50: '#E8D5D7',
          100: '#DFBFC2',
          200: '#CC9499',
          300: '#B96970',
          400: '#A14149',
          500: '#722F37',
          600: '#5C262C',
          700: '#461D22',
          800: '#301417',
          900: '#1A0B0C',
        },
        dark: {
          DEFAULT: '#0F0F0F',
          50: '#3D3D3D',
          100: '#333333',
          200: '#292929',
          300: '#1F1F1F',
          400: '#171717',
          500: '#0F0F0F',
          600: '#0A0A0A',
          700: '#050505',
          800: '#000000',
          900: '#000000',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
