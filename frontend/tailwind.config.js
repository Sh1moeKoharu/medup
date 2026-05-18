const { hairlineWidth } = require('nativewind/theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.tsx',
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './contexts/**/*.{js,jsx,ts,tsx}',
    './hooks/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    fontSize: {
      '4xl': ['2.5rem', { lineHeight: '3.5rem', fontWeight: '600' }],
      '3xl': ['2rem', { lineHeight: '3rem', fontWeight: '500' }],
      '2xl': ['1.5rem', { lineHeight: '2.5rem', fontWeight: '500' }],
      xl: ['1.25rem', { lineHeight: '2rem', fontWeight: '500' }],
      lg: ['1.125rem', { lineHeight: '1.5rem', fontWeight: '500' }],
      base: ['1rem', { lineHeight: '1.375rem', fontWeight: '500' }],
      sm: ['0.875rem', { lineHeight: '1.125rem', fontWeight: '500' }],
      xs: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
      '2xs': ['0.6875rem', { lineHeight: '0.875rem', fontWeight: '500' }],
      '3xs': ['0.625rem', { lineHeight: '0.75rem', fontWeight: '500' }],
    },
    extend: {
      fontFamily: {
        sans: ['Noto Sans', 'sans-serif'],
      },
      colors: {
        transparent: 'transparent',
        white: '#FFF',
        gray: {
          100: '#F1F1F1',
          200: '#E5E5E5',
          300: '#B5B5B5',
          400: '#888888',
        },
        black: '#282828',
        success: {
          200: '#B9F1B2',
          500: '#469B3B',
        },
        warning: {
          200: '#F8EC9A',
          500: '#9B8435',
        },
        error: {
          200: '#FFDFDF',
          500: '#F14747',
        },
        active: {
          200: '#B8CCFF',
          500: '#4E78E5',
          700: '#4E78E5',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
      height: {
        hairline: hairlineWidth(),
        13.5: '3.375rem',
      },
    },
  },
  plugins: [],
};
