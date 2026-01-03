/**
 * Theme Context - Provides dynamic theming with system preference detection
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import {
  lightColors,
  darkColors,
  lightShadows,
  darkShadows,
  gradients,
  type ColorScheme,
  type ShadowScheme,
} from './colors';
import { typography, spacing, borderRadius } from './tokens';

export interface ThemeContextValue {
  isDark: boolean;
  colors: ColorScheme;
  shadows: ShadowScheme;
  gradients: typeof gradients;
  typography: typeof typography;
  spacing: typeof spacing;
  borderRadius: typeof borderRadius;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const theme = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      colors: isDark ? darkColors : lightColors,
      shadows: isDark ? darkShadows : lightShadows,
      gradients,
      typography,
      spacing,
      borderRadius,
    }),
    [isDark]
  );

  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
