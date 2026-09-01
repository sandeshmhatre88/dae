// DAE is a fixed dark theme (like the mock) - no light mode toggle.
// Tokens ported 1:1 from mock/css/style.css so the app matches the approved design.
export const Colors = {
  bg: '#191b21',
  surface: '#22252d',
  surface2: '#2b2f39',
  surface3: '#363b47',
  text: '#f2f3f6',
  textDim: '#9599a8',
  accent: '#2dd4bf',
  accentInk: '#06201c',
  accent2: '#8b7cf6',
  like: '#ff5d7a',
  border: 'rgba(255,255,255,0.08)',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const FontSize = {
  xs: 12,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;
