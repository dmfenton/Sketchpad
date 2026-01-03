/**
 * Code Monet - Design System
 * An impressionist art-inspired theme with colors from Monet's Water Lilies,
 * Garden at Giverny, and Haystacks series.
 */

export const colors = {
  // Backgrounds - Soft, dreamy tones inspired by Monet's misty landscapes
  background: '#F7F4F0', // Warm ivory, like aged canvas
  surface: '#FFFFFF', // Pure white for cards
  surfaceElevated: '#FBF9F7', // Slightly warm white

  // Primary palette - Water Lilies inspired
  primary: '#7B8CDE', // Soft periwinkle blue (water reflections)
  primaryMuted: '#5E6FBF', // Deeper lavender-blue
  secondary: '#E8B4BC', // Soft rose pink (water lily petals)
  secondaryMuted: '#D69AA3', // Deeper rose

  // Accent colors - Garden at Giverny
  accent: '#8FBC8F', // Sage green (lily pads)
  accentMuted: '#6B9B6B', // Deeper garden green
  lavender: '#C5B4E3', // Soft lavender (wisteria)
  gold: '#E8D4A8', // Soft gold (haystacks, sunlight)
  coral: '#F0A8A0', // Soft coral (garden flowers)

  // Semantic - Keeping functionality but with softer tones
  success: '#88B892', // Soft sage green
  warning: '#E8C088', // Warm amber
  error: '#D88888', // Soft rose-red

  // Text - Elegant, readable contrast
  textPrimary: '#2D3142', // Deep charcoal-blue
  textSecondary: '#6B7280', // Muted gray
  textMuted: '#9CA3AF', // Light gray
  textOnPrimary: '#FFFFFF', // White text on primary buttons

  // Borders & dividers - Subtle, painterly edges
  border: '#E5E1DC', // Warm light gray
  borderLight: '#F0EDE8', // Very light warm gray

  // Canvas specific - Artist's workspace
  canvasBackground: '#FFFEF9', // Warm cream, like fine paper
  stroke: '#2D3142', // Deep charcoal for drawings
  humanStroke: '#7B8CDE', // Periwinkle for human strokes
  penIndicator: '#E8B4BC', // Rose pink indicator

  // Status - Softer indicators
  connected: '#88B892', // Sage green
  disconnected: '#D88888', // Soft rose-red
} as const;

// Monet-inspired gradients for special elements
export const gradients = {
  waterLilies: ['#B8C5E8', '#E8D4DC', '#C8E0D0'], // Blue to pink to green
  sunrise: ['#F0D4C8', '#E8C8D0', '#D0D8E8'], // Warm to cool sunrise
  garden: ['#C8E0D0', '#D8E8C8', '#E8E0B8'], // Fresh greens
  sunset: ['#E8D4A8', '#E8B4A0', '#C8A8C8'], // Golden hour
  mist: ['#E8E4F0', '#F0ECF8', '#F8F4FF'], // Soft morning mist
} as const;

export const typography = {
  // Using elegant, readable fonts
  headingXL: {
    fontSize: 32,
    fontWeight: '300' as const, // Light, elegant
    lineHeight: 40,
    letterSpacing: 1,
  },
  heading: {
    fontSize: 22,
    fontWeight: '500' as const, // Medium weight
    lineHeight: 28,
    letterSpacing: 0.5,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
    letterSpacing: 0,
  },
  // Special typography for artistic elements
  artistic: {
    fontSize: 48,
    fontWeight: '200' as const,
    lineHeight: 56,
    letterSpacing: 4,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#7B8CDE',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#7B8CDE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#7B8CDE',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
  // Soft, dreamy glow effects
  glow: {
    shadowColor: '#E8B4BC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 0,
  },
  // Canvas paper effect
  paper: {
    shadowColor: '#D0C8C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

// Re-export everything as a single theme object
export const theme = {
  colors,
  gradients,
  typography,
  spacing,
  borderRadius,
  shadows,
} as const;

export type Theme = typeof theme;
