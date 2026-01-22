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
