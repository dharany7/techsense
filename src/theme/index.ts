// Theme tokens — mirrors tailwind.config.js for use in JS/TS code
export const theme = {
  colors: {
    background: '#0B0F14',
    surface:    '#141A22',
    primary:    '#1E5FFF',
    success:    '#2ECC71',
    warning:    '#F5A623',
    danger:     '#E74C3C',
    foreground: '#F5F7FA',
  },
  fontFamily: {
    sans: 'Inter, system-ui, sans-serif',
  },
} as const

export type ThemeColors = typeof theme.colors
