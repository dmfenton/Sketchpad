/**
 * PaintSplatter - Floating decorative paint splatter
 */

import React from 'react';

export interface PaintSplatterProps {
  delay: number;
  size: number;
  color: string;
  x: number;
  y: number;
}

export function PaintSplatter({
  delay,
  size,
  color,
  x,
  y,
}: PaintSplatterProps): React.ReactElement {
  return (
    <div
      className="paint-splatter"
      style={{
        width: size,
        height: size,
        left: `${x}%`,
        top: `${y}%`,
        backgroundColor: color,
        animationDelay: `${delay}s`,
      }}
    />
  );
}
