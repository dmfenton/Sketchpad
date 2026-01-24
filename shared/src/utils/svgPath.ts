/**
 * SVG path conversion utilities.
 * Converts Path objects and point arrays to SVG path 'd' attribute strings.
 */

import type { Path, Point } from '../types';
import { smoothPolylineToPath } from './strokeSmoothing';

/**
 * Convert a Path object to SVG path 'd' attribute.
 * @param path - The path to convert
 * @param smooth - If true, use bezier smoothing for polylines (paint mode)
 */
export function pathToSvgD(path: Path, smooth = false): string {
  // SVG paths already have their d-string
  if (path.type === 'svg') {
    return path.d || '';
  }

  if (path.points.length === 0) return '';

  const points = path.points;

  // For polylines in paint mode, use smooth bezier curves
  if (path.type === 'polyline' && smooth && points.length > 2) {
    return smoothPolylineToPath(points, 0.5);
  }

  const parts: string[] = [];

  switch (path.type) {
    case 'line':
      if (points.length >= 2) {
        parts.push(`M ${points[0]?.x} ${points[0]?.y}`);
        parts.push(`L ${points[1]?.x} ${points[1]?.y}`);
      }
      break;

    case 'polyline':
      if (points.length > 0) {
        parts.push(`M ${points[0]?.x} ${points[0]?.y}`);
        for (let i = 1; i < points.length; i++) {
          parts.push(`L ${points[i]?.x} ${points[i]?.y}`);
        }
      }
      break;

    case 'quadratic':
      if (points.length >= 3) {
        parts.push(`M ${points[0]?.x} ${points[0]?.y}`);
        parts.push(`Q ${points[1]?.x} ${points[1]?.y} ${points[2]?.x} ${points[2]?.y}`);
      }
      break;

    case 'cubic':
      if (points.length >= 4) {
        parts.push(`M ${points[0]?.x} ${points[0]?.y}`);
        parts.push(
          `C ${points[1]?.x} ${points[1]?.y} ${points[2]?.x} ${points[2]?.y} ${points[3]?.x} ${points[3]?.y}`
        );
      }
      break;
  }

  return parts.join(' ');
}

/**
 * Convert an array of points to SVG polyline path 'd' attribute.
 * @param points - Array of points
 * @param smooth - If true, use bezier smoothing (paint mode)
 */
export function pointsToSvgD(points: Point[], smooth = false): string {
  if (points.length === 0) return '';

  // Use smooth bezier curves for paint mode
  if (smooth && points.length > 2) {
    return smoothPolylineToPath(points, 0.5);
  }

  const parts = [`M ${points[0]?.x} ${points[0]?.y}`];
  for (let i = 1; i < points.length; i++) {
    parts.push(`L ${points[i]?.x} ${points[i]?.y}`);
  }
  return parts.join(' ');
}

/**
 * Convert a Path object to SVG path 'd' attribute with optional scaling.
 * Used for rendering strokes at different sizes (e.g., thumbnails).
 * @param path - The path to convert
 * @param scale - Scale factor to apply to coordinates (default: 1)
 */
export function pathToSvgDScaled(path: Path, scale = 1): string {
  // SVG paths with 'd' attribute - scale coordinates in the d-string
  if (path.type === 'svg' && path.d) {
    if (scale === 1) return path.d;
    return path.d.replace(/[\d.]+/g, (match) => String(parseFloat(match) * scale));
  }

  if (!path.points || path.points.length === 0) return '';

  const pts = path.points;
  const s = scale;

  switch (path.type) {
    case 'line':
      if (pts.length >= 2) {
        const p0 = pts[0]!;
        const p1 = pts[1]!;
        return `M ${p0.x * s} ${p0.y * s} L ${p1.x * s} ${p1.y * s}`;
      }
      return '';

    case 'quadratic':
      if (pts.length >= 3) {
        const p0 = pts[0]!;
        const p1 = pts[1]!;
        const p2 = pts[2]!;
        return `M ${p0.x * s} ${p0.y * s} Q ${p1.x * s} ${p1.y * s} ${p2.x * s} ${p2.y * s}`;
      }
      return '';

    case 'cubic':
      if (pts.length >= 4) {
        const p0 = pts[0]!;
        const p1 = pts[1]!;
        const p2 = pts[2]!;
        const p3 = pts[3]!;
        return `M ${p0.x * s} ${p0.y * s} C ${p1.x * s} ${p1.y * s} ${p2.x * s} ${p2.y * s} ${p3.x * s} ${p3.y * s}`;
      }
      return '';

    case 'polyline':
    default:
      // Polyline: straight line segments between points
      if (pts.length >= 2) {
        const p0 = pts[0]!;
        let d = `M ${p0.x * s} ${p0.y * s}`;
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i]!;
          d += ` L ${p.x * s} ${p.y * s}`;
        }
        return d;
      }
      return '';
  }
}
