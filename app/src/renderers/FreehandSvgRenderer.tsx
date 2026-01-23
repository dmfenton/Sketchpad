/**
 * SVG renderer with perfect-freehand for natural strokes.
 *
 * This renderer uses perfect-freehand to generate natural-looking
 * stroke outlines, then renders them as filled SVG paths.
 * Works without Skia, providing painterly effects via SVG.
 */

import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, G, Path as SvgPath, Filter, FeGaussianBlur } from 'react-native-svg';

import type { Path, Point, RendererProps, StrokeStyle, BrushName } from '@code-monet/shared';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  getEffectiveStyle,
  getFreehandOutline,
  outlineToSvgPath,
  PAINTERLY_FREEHAND_OPTIONS,
  getBristleOutlines,
  getBrushPreset,
  brushPresetToFreehandOptions,
} from '@code-monet/shared';

import { IdleParticles } from '../components/IdleParticles';

/**
 * Render a stroke with perfect-freehand outline.
 */
function FreehandStroke({
  points,
  style,
  brushName,
  blur = false,
}: {
  points: Point[];
  style: StrokeStyle;
  brushName?: BrushName;
  blur?: boolean;
}): React.ReactElement | null {
  const { mainPath, bristlePaths, brush } = useMemo(() => {
    if (points.length === 0) return { mainPath: '', bristlePaths: [], brush: null };

    // Get brush preset if specified
    const brushPreset = brushName ? getBrushPreset(brushName) : null;
    const options = brushPreset
      ? brushPresetToFreehandOptions(brushPreset, style.stroke_width)
      : { ...PAINTERLY_FREEHAND_OPTIONS, size: style.stroke_width * 2 };

    // Main stroke outline
    const outline = getFreehandOutline(points, options);
    const main = outlineToSvgPath(outline);

    // Bristle strokes for texture
    let bristles: string[] = [];
    if (brushPreset && brushPreset.bristleCount > 0) {
      const bristleOutlines = getBristleOutlines(
        points,
        brushPreset.bristleCount,
        brushPreset.bristleSpread * style.stroke_width,
        options
      );
      bristles = bristleOutlines.map((o) => outlineToSvgPath(o)).filter((d) => d.length > 0);
    }

    return { mainPath: main, bristlePaths: bristles, brush: brushPreset };
  }, [points, style.stroke_width, brushName]);

  if (!mainPath) return null;

  const filterId = blur ? 'painterly-blur' : undefined;

  return (
    <G filter={filterId ? `url(#${filterId})` : undefined}>
      {/* Bristle strokes (background texture) */}
      {bristlePaths.map((d, i) => (
        <SvgPath
          key={`bristle-${i}`}
          d={d}
          fill={style.color}
          fillOpacity={(brush?.bristleOpacity ?? 0.3) * style.opacity}
        />
      ))}

      {/* Main stroke */}
      <SvgPath
        d={mainPath}
        fill={style.color}
        fillOpacity={(brush?.mainOpacity ?? 1) * style.opacity}
      />
    </G>
  );
}

/**
 * Render a single-point stroke as a filled circle.
 */
function StrokeDot({ point, style }: { point: Point; style: StrokeStyle }): React.ReactElement {
  const radius = Math.max(style.stroke_width / 2, 1.5);
  return <Circle cx={point.x} cy={point.y} r={radius} fill={style.color} fillOpacity={style.opacity} />;
}

/**
 * Pen position indicator with outer ring and inner dot.
 */
function PenIndicator({
  position,
  penDown,
  color,
}: {
  position: Point;
  penDown: boolean;
  color: string;
}): React.ReactElement {
  const outerRadius = penDown ? 6 : 8;
  const innerRadius = penDown ? 3 : 4;

  return (
    <G>
      <Circle
        cx={position.x}
        cy={position.y}
        r={outerRadius}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />
      <Circle cx={position.x} cy={position.y} r={innerRadius} fill={color} fillOpacity={0.8} />
    </G>
  );
}

/**
 * FreehandSvgRenderer - SVG renderer with perfect-freehand strokes.
 *
 * Provides painterly effects without requiring Skia:
 * - Natural pressure-sensitive stroke outlines
 * - Bristle texture simulation
 * - SVG blur filter for soft edges
 */
export function FreehandSvgRenderer({
  strokes,
  currentStroke,
  agentStroke,
  agentStrokeStyle,
  penPosition,
  penDown,
  styleConfig,
  showIdleAnimation,
  width,
  height,
  primaryColor,
}: RendererProps): React.ReactElement {
  const isPaintMode = styleConfig.type === 'paint';

  return (
    <Svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      style={styles.svg}
    >
      {/* Define blur filter for painterly effect */}
      <Defs>
        <Filter id="painterly-blur" x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation="1.5" />
        </Filter>
        <Filter id="soft-blur" x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation="0.8" />
        </Filter>
      </Defs>

      {/* Idle animation particles */}
      <IdleParticles visible={showIdleAnimation} />

      {/* Completed strokes */}
      {strokes.map((stroke, index) => {
        const style = getEffectiveStyle(stroke, styleConfig);
        const points = stroke.points;

        // Single point = dot
        if (points.length === 1 && points[0]) {
          return <StrokeDot key={index} point={points[0]} style={style} />;
        }

        return (
          <FreehandStroke
            key={index}
            points={points}
            style={style}
            brushName={isPaintMode ? stroke.brush : undefined}
            blur={isPaintMode}
          />
        );
      })}

      {/* Current human stroke */}
      {currentStroke.length > 0 && (
        <FreehandStroke
          points={currentStroke}
          style={styleConfig.human_stroke}
          blur={isPaintMode}
        />
      )}

      {/* Agent in-progress stroke */}
      {agentStroke.length > 0 && (
        <FreehandStroke
          points={agentStroke}
          style={{
            ...styleConfig.agent_stroke,
            ...agentStrokeStyle,
          }}
          blur={isPaintMode}
        />
      )}

      {/* Pen position indicator */}
      {penPosition && <PenIndicator position={penPosition} penDown={penDown} color={primaryColor} />}
    </Svg>
  );
}

const styles = StyleSheet.create({
  svg: {
    flex: 1,
  },
});
