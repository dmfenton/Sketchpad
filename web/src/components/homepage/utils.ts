/**
 * Utility functions for Homepage components
 */

import { StrokePoint, PathData } from './types';

/**
 * Generate a smooth bezier curve path for fallback animation
 */
export function generateArtisticPath(): StrokePoint[] {
  const points: StrokePoint[] = [];
  const startX = Math.random() * 300 + 50;
  const startY = Math.random() * 200 + 50;

  points.push({ x: startX, y: startY });

  const numPoints = Math.floor(Math.random() * 15) + 10;
  let currentX = startX;
  let currentY = startY;

  for (let i = 0; i < numPoints; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 30 + 10;
    currentX += Math.cos(angle) * distance;
    currentY += Math.sin(angle) * distance;

    currentX = Math.max(20, Math.min(380, currentX));
    currentY = Math.max(20, Math.min(280, currentY));

    points.push({ x: currentX, y: currentY });
  }

  return points;
}

/**
 * Convert points array to SVG path string with progress
 */
export function pointsToPath(points: StrokePoint[], progress: number): string {
  if (points.length < 2) return '';

  const visiblePoints = Math.ceil(points.length * progress);
  if (visiblePoints < 2) return '';

  const visible = points.slice(0, visiblePoints);

  let d = `M ${visible[0].x} ${visible[0].y}`;

  for (let i = 1; i < visible.length; i++) {
    const prev = visible[i - 1];
    const curr = visible[i];
    const midX = (prev.x + curr.x) / 2;
    const midY = (prev.y + curr.y) / 2;
    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
  }

  return d;
}

/**
 * Convert server path data to SVG path string.
 * Matches the rendering behavior of Canvas.tsx pathToSvgD.
 */
export function pathDataToSvg(path: PathData, scale: number = 1): string {
  // SVG paths with 'd' attribute - scale coordinates
  if (path.d) {
    if (scale === 1) return path.d;
    return path.d.replace(/[\d.]+/g, (match) => String(parseFloat(match) * scale));
  }

  if (!path.points || path.points.length === 0) return '';

  const pts = path.points;
  const s = scale; // shorthand

  switch (path.type) {
    case 'line':
      if (pts.length >= 2) {
        return `M ${pts[0].x * s} ${pts[0].y * s} L ${pts[1].x * s} ${pts[1].y * s}`;
      }
      return '';

    case 'quadratic':
      if (pts.length >= 3) {
        return `M ${pts[0].x * s} ${pts[0].y * s} Q ${pts[1].x * s} ${pts[1].y * s} ${pts[2].x * s} ${pts[2].y * s}`;
      }
      return '';

    case 'cubic':
      if (pts.length >= 4) {
        return `M ${pts[0].x * s} ${pts[0].y * s} C ${pts[1].x * s} ${pts[1].y * s} ${pts[2].x * s} ${pts[2].y * s} ${pts[3].x * s} ${pts[3].y * s}`;
      }
      return '';

    case 'polyline':
    case 'svg':
    default:
      // Polyline: straight line segments between points
      if (pts.length >= 2) {
        let d = `M ${pts[0].x * s} ${pts[0].y * s}`;
        for (let i = 1; i < pts.length; i++) {
          d += ` L ${pts[i].x * s} ${pts[i].y * s}`;
        }
        return d;
      }
      return '';
  }
}
