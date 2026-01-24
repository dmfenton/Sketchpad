/**
 * Stroke smoothing utilities for converting polylines to smooth bezier curves.
 * Used for paint/brush mode to create organic, flowing strokes.
 */

import type { Point } from '../types';

/**
 * Convert a polyline to a smooth SVG path using Catmull-Rom to Bezier conversion.
 * This creates organic, flowing curves that pass through all control points.
 *
 * @param points - Array of points in the polyline
 * @param tension - Smoothing tension (0 = sharp corners, 1 = very smooth). Default 0.5
 * @returns SVG path d-string
 */
export function smoothPolylineToPath(points: Point[], tension = 0.5): string {
  if (points.length === 0) return '';
  // Safe: length >= 1
  const first = points[0]!;
  if (points.length === 1) return `M ${first.x} ${first.y}`;
  // Safe: length >= 2
  const second = points[1]!;
  if (points.length === 2) {
    return `M ${first.x} ${first.y} L ${second.x} ${second.y}`;
  }

  // Start at first point
  let path = `M ${first.x} ${first.y}`;

  // For each segment, calculate bezier control points using Catmull-Rom
  for (let i = 0; i < points.length - 1; i++) {
    // Safe: indices are clamped to valid range
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    // Calculate control points
    const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
    const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
    const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
    const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return path;
}

/**
 * Convert points to an SVG polyline path (sharp corners).
 * Used for plotter/pen mode.
 *
 * @param points - Array of points
 * @returns SVG path d-string
 */
export function polylineToPath(points: Point[]): string {
  if (points.length === 0) return '';
  // Safe: length >= 1
  const first = points[0]!;
  if (points.length === 1) return `M ${first.x} ${first.y}`;

  let path = `M ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!; // Safe: i < length
    path += ` L ${p.x} ${p.y}`;
  }
  return path;
}

/**
 * Calculate distance between two points.
 */
function distance(p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate stroke width at each point based on velocity.
 * Faster movement = thinner stroke (like a real brush with less pressure).
 *
 * @param points - Array of points
 * @param baseWidth - Base stroke width
 * @param minWidthRatio - Minimum width as ratio of base (0-1). Default 0.3
 * @param maxWidthRatio - Maximum width as ratio of base (0-1). Default 1.5
 * @returns Array of widths for each point
 */
export function calculateVelocityWidths(
  points: Point[],
  baseWidth: number,
  minWidthRatio = 0.3,
  maxWidthRatio = 1.5
): number[] {
  if (points.length <= 1) {
    return points.map(() => baseWidth);
  }

  // Calculate distances between consecutive points
  const distances: number[] = [];
  for (let i = 1; i < points.length; i++) {
    // Safe: i-1 >= 0 and i < length
    distances.push(distance(points[i - 1]!, points[i]!));
  }

  // Find max distance for normalization
  const maxDist = Math.max(...distances, 1);

  // Calculate widths - slower = wider, faster = thinner
  const widths: number[] = [baseWidth * maxWidthRatio]; // Start thick
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i]!; // Safe: i < length
    const normalizedVelocity = d / maxDist;
    // Invert: high velocity = thin, low velocity = thick
    const widthRatio = maxWidthRatio - normalizedVelocity * (maxWidthRatio - minWidthRatio);
    widths.push(baseWidth * widthRatio);
  }

  return widths;
}

/**
 * Create a tapered stroke path (thick in middle, thin at ends).
 * Returns an SVG path for a filled polygon that represents the stroke.
 *
 * @param points - Array of points along the stroke
 * @param baseWidth - Base stroke width at the middle
 * @param taperRatio - How much to taper at ends (0 = no taper, 1 = full taper to point)
 * @returns SVG path d-string for a filled shape
 */
export function createTaperedStrokePath(
  points: Point[],
  baseWidth: number,
  taperRatio = 0.8
): string {
  if (points.length < 2) return '';

  const halfWidth = baseWidth / 2;
  const leftEdge: Point[] = [];
  const rightEdge: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i]!; // Safe: i < length
    const progress = i / (points.length - 1); // 0 to 1

    // Taper: thin at start and end, thick in middle
    // Use sine curve for smooth taper
    const taperFactor = 1 - taperRatio * (1 - Math.sin(progress * Math.PI));
    const currentWidth = halfWidth * taperFactor;

    // Calculate perpendicular direction
    let perpX: number, perpY: number;
    if (i === 0) {
      // Use direction to next point
      const next = points[1]!; // Safe: length >= 2
      const dx = next.x - point.x;
      const dy = next.y - point.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      perpX = -dy / len;
      perpY = dx / len;
    } else if (i === points.length - 1) {
      // Use direction from previous point
      const prev = points[i - 1]!; // Safe: i >= 1
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      perpX = -dy / len;
      perpY = dx / len;
    } else {
      // Average of directions
      const prev = points[i - 1]!; // Safe: i >= 1
      const next = points[i + 1]!; // Safe: i < length - 1
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      perpX = -dy / len;
      perpY = dx / len;
    }

    // Offset points to create stroke edges
    leftEdge.push({
      x: point.x + perpX * currentWidth,
      y: point.y + perpY * currentWidth,
    });
    rightEdge.push({
      x: point.x - perpX * currentWidth,
      y: point.y - perpY * currentWidth,
    });
  }

  // Build closed path: left edge forward, right edge backward
  // Safe: leftEdge has same length as points (>= 2)
  let path = `M ${leftEdge[0]!.x} ${leftEdge[0]!.y}`;

  // Smooth the left edge
  for (let i = 1; i < leftEdge.length; i++) {
    const p = leftEdge[i]!; // Safe: i < length
    path += ` L ${p.x} ${p.y}`;
  }

  // Connect to right edge (reversed)
  for (let i = rightEdge.length - 1; i >= 0; i--) {
    const p = rightEdge[i]!; // Safe: i >= 0 and i < length
    path += ` L ${p.x} ${p.y}`;
  }

  path += ' Z'; // Close the path

  return path;
}

/**
 * Simplify a path by removing points that are very close together.
 * Useful for reducing complexity while maintaining shape.
 *
 * @param points - Input points
 * @param minDistance - Minimum distance between points
 * @returns Simplified array of points
 */
export function simplifyPoints(points: Point[], minDistance = 2): Point[] {
  if (points.length <= 2) return points;

  // Safe: length > 2
  const first = points[0]!;
  const result: Point[] = [first];
  let lastPoint = first;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!; // Safe: i < length - 1
    if (distance(lastPoint, p) >= minDistance) {
      result.push(p);
      lastPoint = p;
    }
  }

  // Always include last point (safe: length > 2)
  result.push(points[points.length - 1]!);

  return result;
}
