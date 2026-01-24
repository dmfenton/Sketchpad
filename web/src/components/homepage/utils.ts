/**
 * Utility functions for Homepage components
 */

import { StrokePoint } from './types';

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
