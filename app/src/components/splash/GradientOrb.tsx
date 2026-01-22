/**
 * GradientOrb - Animated gradient circle for splash screen.
 */

import React from 'react';
import { Circle, Defs, G, LinearGradient, Stop } from 'react-native-svg';

interface GradientOrbProps {
  cx: number;
  cy: number;
  size: number;
  color1: string;
  color2: string;
  gradientId: string;
}

export function GradientOrb({
  cx,
  cy,
  size,
  color1,
  color2,
  gradientId,
}: GradientOrbProps): React.JSX.Element {
  return (
    <G>
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={color1} stopOpacity="0.6" />
          <Stop offset="100%" stopColor={color2} stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={size} fill={`url(#${gradientId})`} />
    </G>
  );
}
