/**
 * SVG canvas component with stroke rendering and touch handling.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Path as SvgPath } from 'react-native-svg';

import { screenToCanvas } from '../hooks/useCanvas';
import { IdleParticles } from './IdleParticles';
import type { DrawingStyleConfig, Path, Point, StrokeStyle } from '@code-monet/shared';
import {
  CANVAS_ASPECT_RATIO,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  getEffectiveStyle,
  PLOTTER_STYLE,
  smoothPolylineToPath,
  createTaperedStrokePath,
} from '@code-monet/shared';
import { borderRadius, spacing, typography, useTheme } from '../theme';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[]; // Agent's in-progress stroke
  agentStrokeStyle?: Partial<StrokeStyle> | null; // Style override for in-progress agent stroke
  penPosition: Point | null;
  penDown: boolean;
  drawingEnabled: boolean;
  styleConfig?: DrawingStyleConfig; // Current drawing style (defaults to plotter)
  showIdleAnimation: boolean; // Whether to show idle particles
  onStrokeStart: (x: number, y: number) => void;
  onStrokeMove: (x: number, y: number) => void;
  onStrokeEnd: () => void;
}

/**
 * Convert a path to SVG path 'd' attribute.
 * @param path - The path to convert
 * @param smooth - If true, use bezier smoothing for polylines (paint mode)
 */
function pathToSvgD(path: Path, smooth = false): string {
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
 * Convert current stroke points to SVG path 'd' attribute.
 * @param points - Array of points
 * @param smooth - If true, use bezier smoothing (paint mode)
 */
function pointsToSvgD(points: Point[], smooth = false): string {
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

export function Canvas({
  strokes,
  currentStroke,
  agentStroke,
  agentStrokeStyle,
  penPosition,
  penDown,
  drawingEnabled,
  styleConfig = PLOTTER_STYLE,
  showIdleAnimation,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: CanvasProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const containerRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    containerRef.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(drawingEnabled)
        .onStart((event) => {
          const { width, height } = containerRef.current;
          if (width > 0 && height > 0) {
            const point = screenToCanvas(event.x, event.y, width, height);
            onStrokeStart(point.x, point.y);
          }
        })
        .onUpdate((event) => {
          const { width, height } = containerRef.current;
          if (width > 0 && height > 0) {
            const point = screenToCanvas(event.x, event.y, width, height);
            onStrokeMove(point.x, point.y);
          }
        })
        .onEnd(() => {
          onStrokeEnd();
        }),
    [drawingEnabled, onStrokeStart, onStrokeMove, onStrokeEnd]
  );

  return (
    <View
      style={[styles.container, { backgroundColor: colors.canvasBackground }, shadows.md]}
      onLayout={handleLayout}
      testID="canvas-view"
    >
      <GestureDetector gesture={panGesture}>
        <View style={styles.canvasWrapper}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Idle animation - floating particles when canvas is empty and agent is idle */}
            <IdleParticles visible={showIdleAnimation} />

            {/* Completed strokes - render with effective style */}
            {strokes.map((stroke, index) => {
              const effectiveStyle = getEffectiveStyle(stroke, styleConfig);
              const isPaintMode = styleConfig.type === 'paint';
              return (
                <SvgPath
                  key={`stroke-${index}`}
                  d={pathToSvgD(stroke, isPaintMode)}
                  stroke={effectiveStyle.color}
                  strokeWidth={effectiveStyle.stroke_width}
                  fill="none"
                  strokeLinecap={effectiveStyle.stroke_linecap}
                  strokeLinejoin={effectiveStyle.stroke_linejoin}
                  opacity={effectiveStyle.opacity}
                />
              );
            })}

            {/* Current stroke in progress (human drawing) */}
            {currentStroke.length > 0 &&
              (styleConfig.type === 'paint' && currentStroke.length > 3 ? (
                // Paint mode: tapered brush stroke
                <SvgPath
                  d={createTaperedStrokePath(
                    currentStroke,
                    styleConfig.human_stroke.stroke_width * 1.5,
                    0.7
                  )}
                  fill={styleConfig.human_stroke.color}
                  opacity={styleConfig.human_stroke.opacity * 0.9}
                />
              ) : (
                // Plotter mode: simple polyline
                <SvgPath
                  d={pointsToSvgD(currentStroke)}
                  stroke={styleConfig.human_stroke.color}
                  strokeWidth={styleConfig.human_stroke.stroke_width}
                  fill="none"
                  strokeLinecap={styleConfig.human_stroke.stroke_linecap}
                  strokeLinejoin={styleConfig.human_stroke.stroke_linejoin}
                />
              ))}

            {/* Agent's in-progress stroke */}
            {agentStroke.length > 1 &&
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

                return styleConfig.type === 'paint' && agentStroke.length > 3 ? (
                  // Paint mode: tapered brush stroke
                  <SvgPath
                    d={createTaperedStrokePath(agentStroke, effectiveWidth * 1.5, 0.7)}
                    fill={effectiveColor}
                    opacity={effectiveOpacity * 0.9}
                  />
                ) : (
                  // Plotter mode: simple polyline
                  <SvgPath
                    d={pointsToSvgD(agentStroke)}
                    stroke={effectiveColor}
                    strokeWidth={effectiveWidth}
                    fill="none"
                    strokeLinecap={styleConfig.agent_stroke.stroke_linecap}
                    strokeLinejoin={styleConfig.agent_stroke.stroke_linejoin}
                  />
                );
              })()}

            {/* Pen position indicator - larger and more visible */}
            {penPosition && (
              <>
                {/* Outer ring */}
                <Circle
                  cx={penPosition.x}
                  cy={penPosition.y}
                  r={penDown ? 12 : 16}
                  fill="none"
                  stroke={colors.primary}
                  strokeWidth={2}
                  opacity={0.5}
                />
                {/* Inner dot */}
                <Circle
                  cx={penPosition.x}
                  cy={penPosition.y}
                  r={penDown ? 6 : 4}
                  fill={penDown ? colors.primary : 'none'}
                  stroke={colors.primary}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>

          {/* Drawing mode indicator */}
          {drawingEnabled && (
            <View style={[styles.drawingIndicator, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.drawingIndicatorText, { color: colors.textOnPrimary }]}>
                Drawing Mode
              </Text>
            </View>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: CANVAS_ASPECT_RATIO,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
  },
  drawingIndicator: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  drawingIndicatorText: {
    ...typography.small,
    fontWeight: '600',
  },
});
