/**
 * Perfect-freehand wrapper for natural stroke rendering.
 *
 * This module wraps the perfect-freehand library to generate
 * natural-looking stroke outlines from input points.
 */

import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Point, BrushPreset } from '../types';

/**
 * Options for generating stroke outlines.
 */
export interface FreehandStrokeOptions {
  /** Base stroke size (diameter) */
  size?: number;
  /** Pressure thinning amount (-1 to 1, default 0.5) */
  thinning?: number;
  /** Smoothing amount (0 to 1, default 0.5) */
  smoothing?: number;
  /** Streamline amount (0 to 1, default 0.5) */
  streamline?: number;
  /** Simulate pressure based on velocity */
  simulatePressure?: boolean;
  /** Easing function for pressure */
  easing?: (t: number) => number;
  /** Taper at start of stroke */
  start?: {
    cap?: boolean;
    taper?: number | boolean;
    easing?: (t: number) => number;
  };
  /** Taper at end of stroke */
  end?: {
    cap?: boolean;
    taper?: number | boolean;
    easing?: (t: number) => number;
  };
}

/**
 * Default stroke options for natural drawing feel.
 */
export const DEFAULT_FREEHAND_OPTIONS: FreehandStrokeOptions = {
  size: 8,
  thinning: 0.5,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: true,
  start: {
    cap: true,
    taper: 0,
  },
  end: {
    cap: true,
    taper: 0,
  },
};

/**
 * Painterly stroke options with more organic feel.
 */
export const PAINTERLY_FREEHAND_OPTIONS: FreehandStrokeOptions = {
  size: 16,
  thinning: 0.6,
  smoothing: 0.5,
  streamline: 0.4,
  simulatePressure: true,
  start: {
    cap: true,
    taper: 40,
    easing: (t) => t * t,
  },
  end: {
    cap: true,
    taper: 40,
    easing: (t) => t * t,
  },
};

/**
 * Convert brush preset to freehand options.
 */
export function brushPresetToFreehandOptions(
  preset: BrushPreset,
  strokeWidth: number
): FreehandStrokeOptions {
  const taperAmount = preset.taper * strokeWidth * 2;

  return {
    size: strokeWidth * 2,
    thinning: preset.pressureResponse * 0.8,
    smoothing: preset.smoothing,
    streamline: 0.5,
    simulatePressure: true,
    start: {
      cap: true,
      taper: taperAmount,
      easing: (t) => t * t,
    },
    end: {
      cap: true,
      taper: taperAmount,
      easing: (t) => t * t,
    },
  };
}

/**
 * Generate stroke outline points using perfect-freehand.
 *
 * @param inputPoints - Array of input points (from user drawing or agent)
 * @param options - Stroke options for customizing the output
 * @returns Array of outline points forming a closed polygon
 */
export function getFreehandOutline(
  inputPoints: Point[],
  options: FreehandStrokeOptions = DEFAULT_FREEHAND_OPTIONS
): Point[] {
  if (inputPoints.length === 0) {
    return [];
  }

  // Convert to format expected by perfect-freehand: [x, y] or [x, y, pressure]
  const points = inputPoints.map((p) => [p.x, p.y] as [number, number]);

  // Get stroke outline
  const outline = getStroke(points, options as StrokeOptions);

  // Convert back to Point objects
  return outline.map(([x, y]) => ({ x, y }));
}

/**
 * Convert outline points to SVG path d-string.
 * Creates a filled polygon from the outline.
 */
export function outlineToSvgPath(outline: Point[]): string {
  if (outline.length === 0) {
    return '';
  }

  const first = outline[0]!;
  let d = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`;

  for (let i = 1; i < outline.length; i++) {
    const point = outline[i]!;
    d += ` L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }

  d += ' Z';
  return d;
}

/**
 * Generate SVG path d-string directly from input points.
 * Combines getFreehandOutline and outlineToSvgPath.
 */
export function pointsToFreehandPath(
  inputPoints: Point[],
  options: FreehandStrokeOptions = DEFAULT_FREEHAND_OPTIONS
): string {
  const outline = getFreehandOutline(inputPoints, options);
  return outlineToSvgPath(outline);
}

/**
 * Generate multiple bristle stroke outlines for brush texture effect.
 *
 * @param inputPoints - Array of input points
 * @param bristleCount - Number of bristle strokes
 * @param spread - How far bristles spread from center (in pixels)
 * @param options - Base stroke options (size will be reduced for bristles)
 * @returns Array of outline arrays, one per bristle
 */
export function getBristleOutlines(
  inputPoints: Point[],
  bristleCount: number,
  spread: number,
  options: FreehandStrokeOptions = DEFAULT_FREEHAND_OPTIONS
): Point[][] {
  if (inputPoints.length === 0 || bristleCount <= 0) {
    return [];
  }

  const bristles: Point[][] = [];
  const bristleSize = (options.size ?? 8) * 0.3;

  for (let i = 0; i < bristleCount; i++) {
    // Calculate offset for this bristle
    const offset = ((i / (bristleCount - 1)) - 0.5) * spread * 2;

    // Jitter each point slightly
    const jitteredPoints = inputPoints.map((p) => ({
      x: p.x + offset + (Math.random() - 0.5) * spread * 0.3,
      y: p.y + (Math.random() - 0.5) * spread * 0.3,
    }));

    // Generate outline for this bristle
    const outline = getFreehandOutline(jitteredPoints, {
      ...options,
      size: bristleSize,
      thinning: 0.3,
    });

    bristles.push(outline);
  }

  return bristles;
}
