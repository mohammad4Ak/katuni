import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Shared sporty palette across storefront and dashboard.
        night: '#14211C', // بخشهای تیره، متن اصلی
        mist: '#69746E', // متن ثانویه
        paper: '#FFFFFF', // کارت و سطوح
        fog: '#F4F6F8', // پسزمینه صفحه
        line: '#E2E8E3', // خطوط و بوردرها
        lime: { DEFAULT: '#D7F76A' },
        brand: {
          DEFAULT: '#12664A',
          strong: '#0B4F38',
          soft: '#EAF3EE',
        },
      },
      fontFamily: {
        display: ['var(--font-vazir)', 'sans-serif'],
        body: ['var(--font-vazir)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
    },
  },
}
export default config
