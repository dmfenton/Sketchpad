/**
 * BrushStroke - Artistic brush stroke decoration.
 */

import React from 'react';
import { Path } from 'react-native-svg';

interface BrushStrokeProps {
  x: number;
  y: number;
  width: number;
  color: string;
  rotation?: number;
}

export function BrushStroke({
  x,
  y,
  width,
  color,
  rotation = 0,
}: BrushStrokeProps): React.JSX.Element {
  const height = width * 0.12;

  return (
    <Path
      d={`M ${x} ${y}
          Q ${x + width * 0.25} ${y - height * 0.8} ${x + width * 0.5} ${y}
          Q ${x + width * 0.75} ${y + height * 0.8} ${x + width} ${y}`}
      stroke={color}
      strokeWidth={height * 2}
      strokeLinecap="round"
      fill="none"
      opacity={0.4}
      transform={`rotate(${rotation}, ${x + width / 2}, ${y})`}
    />
  );
}
