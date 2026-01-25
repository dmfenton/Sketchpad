/**
 * SVG renderer with perfect-freehand for natural strokes (web version).
 *
 * This renderer uses perfect-freehand to generate natural-looking
 * stroke outlines, then renders them as filled SVG paths.
 */

import React, { useMemo } from 'react';

import type { Point, RendererProps, StrokeStyle, BrushName } from '@code-monet/shared';
import {
  getEffectiveStyle,
  getFreehandOutline,
  outlineToSvgPath,
  PAINTERLY_FREEHAND_OPTIONS,
  getBristleOutlines,
  getBrushPreset,
  brushPresetToFreehandOptions,
  pathToSvgD,
  samplePathPoints,
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
      : { ...PAINTERLY_FREEHAND_OPTIONS, size: style.stroke_width };

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
    <g filter={filterId ? `url(#${filterId})` : undefined}>
      {/* Bristle strokes (background texture) */}
      {bristlePaths.map((d, i) => (
        <path
          key={`bristle-${i}`}
          d={d}
          fill={style.color}
          fillOpacity={(brush?.bristleOpacity ?? 0.3) * style.opacity}
        />
      ))}

      {/* Main stroke */}
      <path
        d={mainPath}
        fill={style.color}
        fillOpacity={(brush?.mainOpacity ?? 1) * style.opacity}
      />
    </g>
  );
}

/**
 * Render a single-point stroke as a filled circle.
 */
function StrokeDot({ point, style }: { point: Point; style: StrokeStyle }): React.ReactElement {
  const radius = Math.max(style.stroke_width / 2, 1.5);
  return <circle cx={point.x} cy={point.y} r={radius} fill={style.color} fillOpacity={style.opacity} />;
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
    <g>
      <circle
        cx={position.x}
        cy={position.y}
        r={outerRadius}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />
      <circle cx={position.x} cy={position.y} r={innerRadius} fill={color} fillOpacity={0.8} />
    </g>
  );
}

/**
 * FreehandSvgRenderer - SVG renderer with perfect-freehand strokes (web version).
 *
 * Provides painterly effects without requiring Skia/canvaskit:
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
  primaryColor,
}: RendererProps): React.ReactElement {
  const isPaintMode = styleConfig.type === 'paint';

  return (
    <>
      {/* Define blur filter for painterly effect */}
      <defs>
        <filter id="painterly-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>

      {/* Idle animation particles */}
      <IdleParticles visible={showIdleAnimation} />

      {/* Completed strokes */}
      {strokes.map((stroke, index) => {
        const style = getEffectiveStyle(stroke, styleConfig);
        const points = samplePathPoints(stroke);

        if (stroke.type === 'svg') {
          const d = pathToSvgD(stroke, isPaintMode);
          if (!d) return null;
          const filterId = isPaintMode ? 'painterly-blur' : undefined;
          return (
            <path
              key={index}
              d={d}
              stroke={style.color}
              strokeWidth={style.stroke_width}
              fill="none"
              strokeLinecap={style.stroke_linecap}
              strokeLinejoin={style.stroke_linejoin}
              opacity={style.opacity}
              filter={filterId ? `url(#${filterId})` : undefined}
            />
          );
        }

        if (points.length === 0) return null;

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
      {currentStroke.length > 0 &&
        (currentStroke.length === 1 ? (
          <StrokeDot point={currentStroke[0]!} style={styleConfig.human_stroke} />
        ) : (
          <FreehandStroke
            points={currentStroke}
            style={styleConfig.human_stroke}
            blur={isPaintMode}
          />
        ))}

      {/* Agent in-progress stroke */}
      {agentStroke.length > 0 &&
        (() => {
          // Get effective style - use agentStrokeStyle overrides in paint mode
          const effectiveColor =
            styleConfig.supports_color && agentStrokeStyle?.color
              ? agentStrokeStyle.color
              : styleConfig.agent_stroke.color;
          const effectiveWidth =
            styleConfig.supports_variable_width && agentStrokeStyle?.stroke_width
              ? agentStrokeStyle.stroke_width
              : styleConfig.agent_stroke.stroke_width;
          const effectiveOpacity =
            styleConfig.supports_opacity && agentStrokeStyle?.opacity !== undefined
              ? agentStrokeStyle.opacity
              : styleConfig.agent_stroke.opacity;
          const effectiveStyle: StrokeStyle = {
            color: effectiveColor,
            stroke_width: effectiveWidth,
            opacity: effectiveOpacity,
            stroke_linecap: styleConfig.agent_stroke.stroke_linecap,
            stroke_linejoin: styleConfig.agent_stroke.stroke_linejoin,
          };

          return agentStroke.length === 1 ? (
            <StrokeDot point={agentStroke[0]!} style={effectiveStyle} />
          ) : (
            <FreehandStroke points={agentStroke} style={effectiveStyle} blur={isPaintMode} />
          );
        })()}

      {/* Pen position indicator */}
      {penPosition && <PenIndicator position={penPosition} penDown={penDown} color={primaryColor} />}
    </>
  );
}
