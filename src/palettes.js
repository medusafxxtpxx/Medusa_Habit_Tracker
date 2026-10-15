// src/palettes.js
// Preset color palettes (chosen in the settings sheet, saved in
// app_prefs.palette). Keys match the CSS variable names in global.css so
// applyPalette() can just setProperty() each one, no separate CSS per palette.

export const PALETTES = {
  rose: {
    label: 'Rose',
    swatch: '#f78fb3',
    vars: {
      '--bg': '#170d12',
      '--bg-card': '#241620',
      '--bg-input': '#1d1219',
      '--bg-deep': '#120a0e',
      '--border': '#3d2430',
      '--border-hover': '#f78fb3',
      '--accent': '#f78fb3',
      '--accent-dim': '#c98aa3',
      '--accent-muted': '#a87b8f',
      '--text': '#f3d9e3',
      '--text-sub': '#a87b8f',
      '--text-label': '#c98aa3',
      '--gold': '#c8a96a',
    },
  },
  sage: {
    label: 'Sage',
    swatch: '#8fd9a8',
    vars: {
      '--bg': '#0f1712',
      '--bg-card': '#1a251d',
      '--bg-input': '#141d18',
      '--bg-deep': '#0a100c',
      '--border': '#2c3a30',
      '--border-hover': '#8fd9a8',
      '--accent': '#8fd9a8',
      '--accent-dim': '#7fc094',
      '--accent-muted': '#7ba88f',
      '--text': '#d9f3e2',
      '--text-sub': '#7ba88f',
      '--text-label': '#8fc0a0',
      '--gold': '#c8a96a',
    },
  },
  slate: {
    label: 'Slate Blue',
    swatch: '#8fb3f7',
    vars: {
      '--bg': '#0d1117',
      '--bg-card': '#191f28',
      '--bg-input': '#141a22',
      '--bg-deep': '#090c11',
      '--border': '#2a3444',
      '--border-hover': '#8fb3f7',
      '--accent': '#8fb3f7',
      '--accent-dim': '#7fa0e0',
      '--accent-muted': '#7b8fa8',
      '--text': '#d9e3f3',
      '--text-sub': '#7b8fa8',
      '--text-label': '#8fa3c8',
      '--gold': '#c8a96a',
    },
  },
  amber: {
    label: 'Amber',
    swatch: '#f7b98f',
    vars: {
      '--bg': '#171008',
      '--bg-card': '#241a10',
      '--bg-input': '#1d150c',
      '--bg-deep': '#120c07',
      '--border': '#3d2f1e',
      '--border-hover': '#f7b98f',
      '--accent': '#f7b98f',
      '--accent-dim': '#e0a57f',
      '--accent-muted': '#a8917b',
      '--text': '#f3e6d9',
      '--text-sub': '#a8917b',
      '--text-label': '#c8a98f',
      '--gold': '#c8a96a',
    },
  },
}

export const DEFAULT_PALETTE = 'rose'

export function applyPalette(key) {
  const palette = PALETTES[key] || PALETTES[DEFAULT_PALETTE]
  const root = document.documentElement
  Object.entries(palette.vars).forEach(([varName, value]) => {
    root.style.setProperty(varName, value)
  })
}
