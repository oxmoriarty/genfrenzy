/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink:'#0A0A0F', surface:'#111118', panel:'#18181F', border:'#25252E',
        muted:'#3A3A48', dim:'#6B6B80', soft:'#9898AA', ghost:'#C8C8D8', snow:'#F0F0F8',
        brand:'#6C47FF', blue:'#3B6EFF', violet:'#9B59FF',
        teal:'#00D4B4', amber:'#FFB547', rose:'#FF4D6A', emerald:'#00C98D',
      },
      fontFamily: {
        display: ['var(--font-clash)','sans-serif'],
        body:    ['var(--font-plus)','sans-serif'],
        mono:    ['var(--font-jb)','monospace'],
      },
    },
  },
  plugins: [],
};
