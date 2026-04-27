// ---------------------------------------------------------------------------
// Theme definitions.
//
// Each theme is a pair of CSS-custom-property maps (one for light mode,
// one for dark). Applying a theme means writing those variables onto
// `document.documentElement.style` — the components already reference
// these variables through Tailwind's arbitrary-value syntax (e.g.
// `bg-[var(--kb-board-bg)]`), so no component code needs to change
// when a new theme is added.
//
// Swatch colors shown in the theme picker use the accent color of the
// light variant so the picker is legible regardless of the current
// color mode.
//
// Adding a new theme: append an entry to `THEMES` with a unique `key`.
// That is the only place you need to edit.
// ---------------------------------------------------------------------------

export type ColorMode = 'light' | 'dark'

/**
 * The CSS custom properties used across the UI. Keeping them here as a
 * type ensures every theme variant supplies every token — any missing
 * key becomes a TypeScript error rather than an undefined CSS variable
 * at runtime.
 */
export interface ThemeColors {
  '--kb-sidebar-bg': string
  '--kb-sidebar-text': string
  '--kb-sidebar-accent': string
  '--kb-board-bg': string
  '--kb-card-bg': string
  '--kb-card-border': string
  '--kb-column-header': string
  '--kb-accent-primary': string
  '--kb-accent-text': string
  // Dialog / card text scale. These are used by modal content and
  // board-level elements that need text colors to follow the theme,
  // so that dark mode automatically flips the text to a light scale
  // without requiring a `dark:` Tailwind variant at every site.
  //   primary   — headings, titles, dense body text
  //   secondary — body text, field values
  //   muted     — labels, placeholders, meta info, disabled states
  '--kb-text-primary': string
  '--kb-text-secondary': string
  '--kb-text-muted': string
}

export interface Theme {
  key: string
  name: string
  // Swatch shown in the theme picker. Usually the light-mode accent.
  swatch: string
  light: ThemeColors
  dark: ThemeColors
}

// All eight themes. The accent color drives the theme's visual
// character; the surfaces and text colors are tuned so both modes
// remain legible with sensible contrast.
export const THEMES: Theme[] = [
  {
    key: 'default',
    name: 'Default',
    swatch: '#7c3aed',
    light: {
      '--kb-sidebar-bg': '#1f1b2e',
      '--kb-sidebar-text': '#e5e7eb',
      '--kb-sidebar-accent': '#a78bfa',
      '--kb-board-bg': '#f7f7fb',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#e5e7eb',
      '--kb-column-header': '#f3f4f6',
      '--kb-accent-primary': '#7c3aed',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      // Dark mode surfaces tuned for legible card-vs-board contrast.
      // Board is the darkest layer; cards are noticeably lighter so they
      // sit clearly above it; the border is lighter again so the card
      // outline is visible. Aim for ~25% luminance lift from board to
      // card and another ~15% from card to border.
      '--kb-sidebar-bg': '#14101c',
      '--kb-sidebar-text': '#e5e7eb',
      '--kb-sidebar-accent': '#a78bfa',
      '--kb-board-bg': '#1a1628',
      '--kb-card-bg': '#322c44',
      '--kb-card-border': '#453d5c',
      '--kb-column-header': '#221d32',
      '--kb-accent-primary': '#a78bfa',
      '--kb-accent-text': '#14101c',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'slate',
    name: 'Slate',
    swatch: '#475569',
    light: {
      '--kb-sidebar-bg': '#1e293b',
      '--kb-sidebar-text': '#e2e8f0',
      '--kb-sidebar-accent': '#94a3b8',
      '--kb-board-bg': '#f1f5f9',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#e2e8f0',
      '--kb-column-header': '#e2e8f0',
      '--kb-accent-primary': '#475569',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#0a1120',
      '--kb-sidebar-text': '#e2e8f0',
      '--kb-sidebar-accent': '#94a3b8',
      '--kb-board-bg': '#111a2b',
      '--kb-card-bg': '#283448',
      '--kb-card-border': '#425068',
      '--kb-column-header': '#1a2538',
      '--kb-accent-primary': '#94a3b8',
      '--kb-accent-text': '#0a1120',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'indigo',
    name: 'Indigo',
    swatch: '#4f46e5',
    light: {
      '--kb-sidebar-bg': '#1e1b4b',
      '--kb-sidebar-text': '#e0e7ff',
      '--kb-sidebar-accent': '#818cf8',
      '--kb-board-bg': '#f5f5ff',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#e0e7ff',
      '--kb-column-header': '#eef2ff',
      '--kb-accent-primary': '#4f46e5',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#13113a',
      '--kb-sidebar-text': '#e0e7ff',
      '--kb-sidebar-accent': '#818cf8',
      '--kb-board-bg': '#191538',
      '--kb-card-bg': '#302c5e',
      '--kb-card-border': '#443f7e',
      '--kb-column-header': '#221e46',
      '--kb-accent-primary': '#818cf8',
      '--kb-accent-text': '#191538',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'teal',
    name: 'Teal',
    swatch: '#0d9488',
    light: {
      '--kb-sidebar-bg': '#134e4a',
      '--kb-sidebar-text': '#ccfbf1',
      '--kb-sidebar-accent': '#5eead4',
      '--kb-board-bg': '#f0fdfa',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#d1fae5',
      '--kb-column-header': '#ccfbf1',
      '--kb-accent-primary': '#0d9488',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#0a2322',
      '--kb-sidebar-text': '#ccfbf1',
      '--kb-sidebar-accent': '#5eead4',
      '--kb-board-bg': '#0f2b28',
      '--kb-card-bg': '#1d5650',
      '--kb-card-border': '#2d7770',
      '--kb-column-header': '#143833',
      '--kb-accent-primary': '#2dd4bf',
      '--kb-accent-text': '#0f2b28',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'rose',
    name: 'Rose',
    swatch: '#e11d48',
    light: {
      '--kb-sidebar-bg': '#4c0519',
      '--kb-sidebar-text': '#ffe4e6',
      '--kb-sidebar-accent': '#fb7185',
      '--kb-board-bg': '#fff1f2',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#fecdd3',
      '--kb-column-header': '#ffe4e6',
      '--kb-accent-primary': '#e11d48',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#1f050c',
      '--kb-sidebar-text': '#ffe4e6',
      '--kb-sidebar-accent': '#fb7185',
      '--kb-board-bg': '#260913',
      '--kb-card-bg': '#4b1428',
      '--kb-card-border': '#722040',
      '--kb-column-header': '#341020',
      '--kb-accent-primary': '#fb7185',
      '--kb-accent-text': '#260913',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'amber',
    name: 'Amber',
    swatch: '#d97706',
    light: {
      '--kb-sidebar-bg': '#451a03',
      '--kb-sidebar-text': '#fef3c7',
      '--kb-sidebar-accent': '#fcd34d',
      '--kb-board-bg': '#fffbeb',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#fde68a',
      '--kb-column-header': '#fef3c7',
      '--kb-accent-primary': '#d97706',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#1f0e03',
      '--kb-sidebar-text': '#fef3c7',
      '--kb-sidebar-accent': '#fcd34d',
      '--kb-board-bg': '#261305',
      '--kb-card-bg': '#4d2b0d',
      '--kb-card-border': '#754314',
      '--kb-column-header': '#331b08',
      '--kb-accent-primary': '#f59e0b',
      '--kb-accent-text': '#261305',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'zinc',
    name: 'Zinc',
    swatch: '#52525b',
    light: {
      '--kb-sidebar-bg': '#27272a',
      '--kb-sidebar-text': '#e4e4e7',
      '--kb-sidebar-accent': '#a1a1aa',
      '--kb-board-bg': '#fafafa',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#e4e4e7',
      '--kb-column-header': '#f4f4f5',
      '--kb-accent-primary': '#52525b',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#141416',
      '--kb-sidebar-text': '#e4e4e7',
      '--kb-sidebar-accent': '#a1a1aa',
      '--kb-board-bg': '#18181b',
      '--kb-card-bg': '#33333a',
      '--kb-card-border': '#4e4e57',
      '--kb-column-header': '#222225',
      '--kb-accent-primary': '#a1a1aa',
      '--kb-accent-text': '#18181b',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
  {
    key: 'midnight',
    name: 'Midnight',
    swatch: '#1d4ed8',
    light: {
      // Midnight's "light" mode is still deliberately moody — a pale
      // lavender board with a deep navy sidebar and blue accent.
      '--kb-sidebar-bg': '#0f172a',
      '--kb-sidebar-text': '#e0e7ff',
      '--kb-sidebar-accent': '#60a5fa',
      '--kb-board-bg': '#eef2ff',
      '--kb-card-bg': '#ffffff',
      '--kb-card-border': '#dbeafe',
      '--kb-column-header': '#e0e7ff',
      '--kb-accent-primary': '#1d4ed8',
      '--kb-accent-text': '#ffffff',
      '--kb-text-primary': '#0f172a',
      '--kb-text-secondary': '#475569',
      '--kb-text-muted': '#94a3b8',
    },
    dark: {
      '--kb-sidebar-bg': '#040918',
      '--kb-sidebar-text': '#e0e7ff',
      '--kb-sidebar-accent': '#60a5fa',
      '--kb-board-bg': '#080e22',
      '--kb-card-bg': '#1b264a',
      '--kb-card-border': '#2f3e6e',
      '--kb-column-header': '#121a36',
      '--kb-accent-primary': '#60a5fa',
      '--kb-accent-text': '#080e22',
      '--kb-text-primary': '#f1f5f9',
      '--kb-text-secondary': '#cbd5e1',
      '--kb-text-muted': '#94a3b8',
    },
  },
]

export const DEFAULT_THEME_KEY = 'default'

/**
 * Write a theme's CSS variables onto the document root. Called from a
 * `useEffect` whenever the stored theme key or color mode changes.
 */
export function applyTheme(themeKey: string, mode: ColorMode): void {
  const theme = THEMES.find((t) => t.key === themeKey) ?? THEMES[0]
  const colors = mode === 'dark' ? theme.dark : theme.light
  const root = document.documentElement
  for (const [k, v] of Object.entries(colors)) {
    root.style.setProperty(k, v)
  }
  // Keep `color-scheme` in sync so native browser chrome (scrollbars,
  // date-pickers) picks up the right color mode.
  root.style.colorScheme = mode
}

/**
 * Look up a theme by key. Falls back to the default theme when the key
 * is unknown (e.g. a stored localStorage value from an older version).
 */
export function getTheme(key: string): Theme {
  return THEMES.find((t) => t.key === key) ?? THEMES[0]
}
