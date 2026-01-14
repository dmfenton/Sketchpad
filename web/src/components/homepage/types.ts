/**
 * Shared types for Homepage components
 */

export interface StrokePoint {
  x: number;
  y: number;
}

export interface PathData {
  type: string;
  points?: StrokePoint[];
  d?: string;
  author?: string;
}

export interface GalleryPiece {
  id: string;
  user_id: string;
  piece_number: number;
  stroke_count: number;
  created_at: string;
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

// Impressionist palette inspired by Monet
export const PALETTE = {
  primary: ['#e94560', '#ff6b6b', '#ff8585'],
  secondary: ['#7b68ee', '#9b8aff', '#b8a9ff'],
  accent: ['#4ecdc4', '#6ee7de', '#8ff4ed'],
  warm: ['#ffd93d', '#ffe566', '#ffed8a'],
  neutral: ['#2d3436', '#636e72', '#b2bec3'],
};

export const ALL_COLORS = [
  ...PALETTE.primary,
  ...PALETTE.secondary,
  ...PALETTE.accent,
  ...PALETTE.warm,
];
