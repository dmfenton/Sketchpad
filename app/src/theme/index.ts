/**
 * Code Monet - Design System
 * A bold, immersive theme with vibrant accent colors (rose, violet, teal).
 * Designed for an artistic, creative experience.
 * Supports both light and dark modes.
 */

// Re-export colors and shadows
export {
  lightColors,
  darkColors,
  lightShadows,
  darkShadows,
  gradients,
  type ColorScheme,
  type ShadowScheme,
} from './colors';

// Re-export tokens
export { typography, spacing, borderRadius } from './tokens';

// Re-export theme context
export { ThemeProvider, useTheme, type ThemeContextValue } from './ThemeContext';

// Legacy exports for backwards compatibility
import { lightColors, lightShadows } from './colors';
export const colors = lightColors;
export const shadows = lightShadows;

// Re-export everything as a single theme object
import { gradients } from './colors';
import { typography, spacing, borderRadius } from './tokens';

export const theme = {
  colors,
  gradients,
  typography,
  spacing,
  borderRadius,
  shadows,
} as const;

export type Theme = typeof theme;
