/**
 * Code Monet - Color Definitions
 * A bold, immersive dark theme with vibrant accent colors.
 * Designed for an artistic, creative experience.
 */

// Light mode colors - Clean, modern with artistic accents
export const lightColors = {
  // Backgrounds
  background: '#F5F5F8', // Cool neutral gray
  surface: '#FFFFFF', // Pure white for cards
  surfaceElevated: '#FAFAFA', // Slightly elevated

  // Primary palette - Vibrant artistic accents
  primary: '#e94560', // Rose/crimson (main accent)
  primaryMuted: '#a83248', // Dimmed rose
  secondary: '#7b68ee', // Violet (secondary accent)
  secondaryMuted: '#5a4bc7', // Deeper violet

  // Accent colors - Creative palette
  accent: '#4ecdc4', // Teal
  accentMuted: '#3ba89f', // Deeper teal
  lavender: '#7b68ee', // Violet (alias)
  gold: '#ffd93d', // Bright gold
  coral: '#ff6b6b', // Coral/salmon

  // Semantic - Clear, functional
  success: '#4ade80', // Bright green
  warning: '#fbbf24', // Amber
  error: '#ef4444', // Red

  // Text - High contrast
  textPrimary: '#1a1a2e', // Dark blue-black
  textSecondary: '#4a4a6a', // Muted dark
  textMuted: '#8888a8', // Light muted
  textOnPrimary: '#FFFFFF', // White text on primary buttons

  // Borders & dividers
  border: '#e0e0e8', // Light gray
  borderLight: '#f0f0f4', // Very light gray

  // Canvas specific - Clean workspace
  canvasBackground: '#FFFFFF', // Pure white canvas
  stroke: '#1a1a2e', // Dark strokes
  humanStroke: '#7b68ee', // Violet for human strokes
  penIndicator: '#e94560', // Rose indicator

  // Status
  connected: '#4ade80', // Green
  disconnected: '#ef4444', // Red
} as const;

// Dark mode colors - Immersive, cinematic dark theme
export const darkColors = {
  // Backgrounds - Deep, rich darks
  background: '#0a0a0f', // Near black
  surface: '#12121a', // Dark surface
  surfaceElevated: '#1a1a2e', // Elevated dark blue

  // Primary palette - Vibrant on dark
  primary: '#e94560', // Rose/crimson
  primaryMuted: '#a83248', // Dimmed rose
  secondary: '#7b68ee', // Violet
  secondaryMuted: '#5a4bc7', // Deeper violet

  // Accent colors - Pop on dark backgrounds
  accent: '#4ecdc4', // Teal
  accentMuted: '#3ba89f', // Deeper teal
  lavender: '#7b68ee', // Violet
  gold: '#ffd93d', // Bright gold
  coral: '#ff6b6b', // Coral

  // Semantic
  success: '#4ade80', // Bright green
  warning: '#fbbf24', // Amber
  error: '#ef4444', // Red

  // Text - High contrast on dark
  textPrimary: '#ffffff', // Pure white
  textSecondary: 'rgba(255, 255, 255, 0.7)', // 70% white
  textMuted: 'rgba(255, 255, 255, 0.4)', // 40% white
  textOnPrimary: '#FFFFFF', // White text on primary buttons

  // Borders & dividers - Subtle on dark
  border: '#2a2a3e', // Dark border
  borderLight: '#1a1a2e', // Very subtle border

  // Canvas specific - Light canvas for visibility
  canvasBackground: '#FFFFFF', // Keep canvas white
  stroke: '#1a1a2e', // Dark strokes
  humanStroke: '#7b68ee', // Violet for human strokes
  penIndicator: '#e94560', // Rose indicator

  // Status
  connected: '#4ade80', // Green
  disconnected: '#ef4444', // Red
} as const;

// Type that accepts both light and dark color values
export type ColorScheme = {
  readonly [K in keyof typeof lightColors]: string;
};

// Light mode shadows - Clean, subtle
export const lightShadows = {
  sm: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: {
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 0,
  },
  paper: {
    shadowColor: '#1a1a2e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 4,
  },
} as const;

// Dark mode shadows - Deep, dramatic
export const darkShadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: {
    shadowColor: '#e94560',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 0,
  },
  paper: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 4,
  },
} as const;

// Shadow style type
type ShadowStyle = {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
};

export type ShadowScheme = {
  readonly [K in keyof typeof lightShadows]: ShadowStyle;
};

// Vibrant gradients matching web styling
export const gradients = {
  // Primary gradients
  primary: ['#e94560', '#ff6b6b'], // Rose to coral
  secondary: ['#7b68ee', '#4ecdc4'], // Violet to teal
  // Artistic gradients
  sunset: ['#e94560', '#ffd93d'], // Rose to gold
  ocean: ['#4ecdc4', '#7b68ee'], // Teal to violet
  aurora: ['#7b68ee', '#e94560', '#4ecdc4'], // Multi-color
  // Legacy aliases
  waterLilies: ['#7b68ee', '#e94560', '#4ecdc4'],
  sunrise: ['#ffd93d', '#ff6b6b', '#e94560'],
  garden: ['#4ecdc4', '#4ade80', '#ffd93d'],
  mist: ['#1a1a2e', '#12121a', '#0a0a0f'], // Dark gradient
} as const;
