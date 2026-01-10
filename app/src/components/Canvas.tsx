/**
 * SVG canvas component with stroke rendering and touch handling.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Defs, Line, Pattern, Path as SvgPath, Rect } from 'react-native-svg';

import { screenToCanvas } from '../hooks/useCanvas';
import type { Path, Point } from '@drawing-agent/shared';
import { CANVAS_ASPECT_RATIO, CANVAS_HEIGHT, CANVAS_WIDTH } from '@drawing-agent/shared';
import { borderRadius, spacing, typography, useTheme } from '../theme';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];  // Agent's in-progress stroke
  penPosition: Point | null;
  penDown: boolean;
  drawingEnabled: boolean;
  onStrokeStart: (x: number, y: number) => void;
  onStrokeMove: (x: number, y: number) => void;
  onStrokeEnd: () => void;
}

/**
 * Convert a path to SVG path 'd' attribute.
 */
function pathToSvgD(path: Path): string {
  // SVG paths already have their d-string
  if (path.type === 'svg') {
    return path.d || '';
  }

  if (path.points.length === 0) return '';

  const points = path.points;
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
 */
function pointsToSvgD(points: Point[]): string {
  if (points.length === 0) return '';

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
  penPosition,
  penDown,
  drawingEnabled,
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
    <View style={[styles.container, { backgroundColor: colors.canvasBackground }, shadows.md]} onLayout={handleLayout}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.canvasWrapper}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid pattern */}
            <Defs>
              <Pattern
                id="grid"
                width="40"
                height="40"
                patternUnits="userSpaceOnUse"
              >
                <Line x1="40" y1="0" x2="40" y2="40" stroke={colors.border} strokeWidth="0.5" />
                <Line x1="0" y1="40" x2="40" y2="40" stroke={colors.border} strokeWidth="0.5" />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#grid)" />

            {/* Completed strokes */}
            {strokes.map((stroke, index) => (
              <SvgPath
                key={`stroke-${index}`}
                d={pathToSvgD(stroke)}
                stroke={colors.stroke}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Current stroke in progress (human drawing) */}
            {currentStroke.length > 0 && (
              <SvgPath
                d={pointsToSvgD(currentStroke)}
                stroke={colors.secondary}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Agent's in-progress stroke */}
            {agentStroke.length > 1 && (
              <SvgPath
                d={pointsToSvgD(agentStroke)}
                stroke={colors.stroke}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

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
              <Text style={[styles.drawingIndicatorText, { color: colors.textOnPrimary }]}>Drawing Mode</Text>
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
