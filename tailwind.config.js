/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'kb-sidebar': 'var(--kb-sidebar-bg)',
        'kb-sidebar-text': 'var(--kb-sidebar-text)',
        'kb-sidebar-accent': 'var(--kb-sidebar-accent)',
        'kb-board': 'var(--kb-board-bg)',
        'kb-card': 'var(--kb-card-bg)',
        'kb-card-border': 'var(--kb-card-border)',
        'kb-column-header': 'var(--kb-column-header)',
        'kb-accent': 'var(--kb-accent-primary)',
        'kb-accent-text': 'var(--kb-accent-text)',
      },
    },
  },
  plugins: [],
}
