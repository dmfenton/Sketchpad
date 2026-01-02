/**
 * Design system theme constants.
 * Dark theme with indigo/cyan accents.
 */

export const colors = {
  // Backgrounds
  background: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceElevated: '#252525',

  // Primary palette
  primary: '#6366F1',
  primaryMuted: '#4F46E5',
  secondary: '#22D3EE',
  secondaryMuted: '#06B6D4',

  // Semantic
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#A1A1AA',
  textMuted: '#71717A',

  // Borders & dividers
  border: '#27272A',
  borderLight: '#3F3F46',

  // Canvas specific
  canvasBackground: '#FFFFFF',
  stroke: '#000000',
  humanStroke: '#22D3EE',
  penIndicator: '#6366F1',

  // Status
  connected: '#10B981',
  disconnected: '#EF4444',
} as const;

export const typography = {
  headingXL: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 34,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 26,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  caption: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  small: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
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
} as const;

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: {
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 0,
  },
} as const;

// Re-export everything as a single theme object
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
} as const;

export type Theme = typeof theme;
