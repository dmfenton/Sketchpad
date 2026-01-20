/**
 * Shared types for Homepage components
 */

export interface StrokePoint {
  x: number;
  y: number;
}

export type PathDataType = 'line' | 'quadratic' | 'cubic' | 'polyline' | 'svg';

export interface PathData {
  type: PathDataType;
  points?: StrokePoint[];
  d?: string;
  author?: string;
  color?: string;
  stroke_width?: number;
  opacity?: number;
}

export interface GalleryPiece {
  id: string;
  user_id: string;
  piece_number: number;
  stroke_count: number;
  created_at: string;
  title?: string; // Piece title (set by agent via name_piece tool)
}

export interface PieceStrokes {
  id: string;
  strokes: PathData[];
  piece_number: number;
  created_at: string;
}

export interface SimulatedStroke {
  id: number;
  points: StrokePoint[];
  color: string;
  width: number;
  progress: number;
}

// Monet-inspired palette from his actual paintings
// Colors drawn from Water Lilies, Impression Sunrise, and Giverny gardens
export const PALETTE = {
  // Ochres and golds - morning light
  ochre: ['#c4a35a', '#d4a84b', '#b89b4a'],
  // Water and sky blues
  water: ['#6a9fb5', '#7eb3c4', '#5d8a9e'],
  // Lily pinks and roses
  rose: ['#b5606e', '#c8868f', '#a85060'],
  // Garden greens and sage
  sage: ['#7d8471', '#8f9682', '#6b7560'],
  // Lavender and violet shadows
  lavender: ['#8b7ea8', '#9d90b8', '#7a6d98'],
  // Warm earth tones
  sienna: ['#9e6b4a', '#b07d5a', '#8a5d40'],
  // Deep indigos for shadows
  indigo: ['#2c3e50', '#34495e', '#243342'],
};

// Flattened array of all colors for random selection
export const ALL_COLORS = [
  ...PALETTE.ochre,
  ...PALETTE.water,
  ...PALETTE.rose,
  ...PALETTE.sage,
  ...PALETTE.lavender,
  ...PALETTE.sienna,
];

// Subset of warmer, more prominent colors for simulated strokes
export const STROKE_COLORS = [
  '#c4a35a', // ochre
  '#6a9fb5', // water blue
  '#b5606e', // rose
  '#7d8471', // sage
  '#8b7ea8', // lavender
  '#9e6b4a', // sienna
  '#d4a84b', // gold
  '#7eb3c4', // light blue
];
