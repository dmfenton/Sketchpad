/**
 * Code Monet - Design Tokens
 * Typography, spacing, and border radius values.
 */

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
