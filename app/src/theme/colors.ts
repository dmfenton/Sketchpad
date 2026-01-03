/**
 * Code Monet - Color Definitions
 * An impressionist art-inspired color palette from Monet's Water Lilies,
 * Garden at Giverny, and Haystacks series.
 * Supports both light and dark modes.
 */

// Light mode colors - Soft, dreamy tones inspired by Monet's misty landscapes
export const lightColors = {
  // Backgrounds
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

// Dark mode colors - Night garden, moonlit water lilies
export const darkColors = {
  // Backgrounds - Deep, mysterious tones like Monet's evening scenes
  background: '#1A1B23', // Deep charcoal-blue
  surface: '#252631', // Elevated dark surface
  surfaceElevated: '#2D2E3A', // Even more elevated

  // Primary palette - Moonlit Water Lilies
  primary: '#8B9CE8', // Brighter periwinkle for dark mode
  primaryMuted: '#6E7FD0', // Slightly muted
  secondary: '#E8B4BC', // Rose pink stays vibrant
  secondaryMuted: '#C89AA3', // Muted rose

  // Accent colors - Night garden
  accent: '#9FCC9F', // Brighter sage for visibility
  accentMuted: '#7BAB7B', // Muted garden green
  lavender: '#D5C4F3', // Brighter lavender
  gold: '#F0DEB8', // Brighter gold
  coral: '#F0B8B0', // Brighter coral

  // Semantic - Visible but soft
  success: '#98C8A2', // Brighter sage green
  warning: '#F0D098', // Brighter amber
  error: '#E89898', // Brighter rose-red

  // Text - High contrast for readability
  textPrimary: '#F0EDE8', // Warm white
  textSecondary: '#A8ADB8', // Muted light gray
  textMuted: '#6B7080', // Darker muted
  textOnPrimary: '#FFFFFF', // White text on primary buttons

  // Borders & dividers - Subtle dark edges
  border: '#3A3B48', // Dark gray border
  borderLight: '#2D2E3A', // Very subtle border

  // Canvas specific - Moonlit workspace
  canvasBackground: '#F8F6F0', // Keep canvas light for drawing visibility
  stroke: '#2D3142', // Keep stroke dark for visibility
  humanStroke: '#8B9CE8', // Brighter periwinkle for dark mode
  penIndicator: '#E8B4BC', // Rose pink indicator

  // Status - Visible indicators
  connected: '#98C8A2', // Brighter sage green
  disconnected: '#E89898', // Brighter rose-red
} as const;

// Type that accepts both light and dark color values
export type ColorScheme = {
  readonly [K in keyof typeof lightColors]: string;
};

// Light mode shadows
export const lightShadows = {
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
  glow: {
    shadowColor: '#E8B4BC',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 0,
  },
  paper: {
    shadowColor: '#D0C8C0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

// Dark mode shadows
export const darkShadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 8,
  },
  glow: {
    shadowColor: '#8B9CE8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 0,
  },
  paper: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
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

// Monet-inspired gradients for special elements
export const gradients = {
  waterLilies: ['#B8C5E8', '#E8D4DC', '#C8E0D0'], // Blue to pink to green
  sunrise: ['#F0D4C8', '#E8C8D0', '#D0D8E8'], // Warm to cool sunrise
  garden: ['#C8E0D0', '#D8E8C8', '#E8E0B8'], // Fresh greens
  sunset: ['#E8D4A8', '#E8B4A0', '#C8A8C8'], // Golden hour
  mist: ['#E8E4F0', '#F0ECF8', '#F8F4FF'], // Soft morning mist
} as const;
