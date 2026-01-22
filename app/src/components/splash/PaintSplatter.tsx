/**
 * PaintSplatter - Decorative paint splatter circle.
 */

import React from 'react';
import { Circle } from 'react-native-svg';

interface PaintSplatterProps {
  x: number;
  y: number;
  size: number;
  color: string;
}

export function PaintSplatter({ x, y, size, color }: PaintSplatterProps): React.JSX.Element {
  return <Circle cx={x} cy={y} r={size} fill={color} opacity={0.15} />;
}
