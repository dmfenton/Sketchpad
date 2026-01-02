/**
 * SVG canvas component with stroke rendering and touch handling.
 */

import React, { useCallback, useRef } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Path as SvgPath } from 'react-native-svg';

import { screenToCanvas } from '../hooks/useCanvas';
import type { Path, Point } from '../types';
import { CANVAS_ASPECT_RATIO, CANVAS_HEIGHT, CANVAS_WIDTH, COLORS } from '../types';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
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
  penPosition,
  penDown,
  drawingEnabled,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: CanvasProps): React.JSX.Element {
  const containerRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    containerRef.current = {
      width: event.nativeEvent.layout.width,
      height: event.nativeEvent.layout.height,
    };
  }, []);

  const panGesture = Gesture.Pan()
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
    });

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <GestureDetector gesture={panGesture}>
        <View style={styles.canvasWrapper}>
          <Svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Completed strokes */}
            {strokes.map((stroke, index) => (
              <SvgPath
                key={`stroke-${index}`}
                d={pathToSvgD(stroke)}
                stroke={COLORS.stroke}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* Current stroke in progress (human drawing) */}
            {currentStroke.length > 0 && (
              <SvgPath
                d={pointsToSvgD(currentStroke)}
                stroke={COLORS.humanPreviewStroke}
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Pen position indicator */}
            {penPosition && (
              <Circle
                cx={penPosition.x}
                cy={penPosition.y}
                r={4}
                fill={penDown ? COLORS.penIndicatorDown : 'none'}
                stroke={penDown ? COLORS.penIndicatorDown : COLORS.penIndicatorUp}
                strokeWidth={1}
              />
            )}
          </Svg>
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: CANVAS_ASPECT_RATIO,
    backgroundColor: COLORS.canvasBackground,
    borderRadius: 4,
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
  },
});
