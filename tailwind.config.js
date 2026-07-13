/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./public/**/*.{html,js}'],
  theme: {
    extend: {
      colors: {
        ink: '#171717',
        paper: '#f7f7f4',
        moss: '#175d4c',
        mint: '#dff5ec',
        line: '#deded8'
      },
      boxShadow: {
        soft: '0 18px 45px rgba(23, 23, 23, 0.08)'
      }
    }
  },
  plugins: []
};
