/**
 * SVG canvas component for web - renders strokes and handles mouse input.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { DrawingStyleConfig, Path, Point } from '@code-monet/shared';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  getEffectiveStyle,
  PLOTTER_STYLE,
  smoothPolylineToPath,
  createTaperedStrokePath,
} from '@code-monet/shared';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];
  penPosition: Point | null;
  penDown: boolean;
  drawingEnabled: boolean;
  styleConfig?: DrawingStyleConfig; // Current drawing style (defaults to plotter)
  onStrokeStart: (x: number, y: number) => void;
  onStrokeMove: (x: number, y: number) => void;
  onStrokeEnd: () => void;
}

/**
 * Convert screen coordinates to canvas coordinates.
 */
function screenToCanvas(clientX: number, clientY: number, rect: DOMRect): Point {
  const scaleX = CANVAS_WIDTH / rect.width;
  const scaleY = CANVAS_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

/**
 * Convert a path to SVG path 'd' attribute.
 * @param path - The path to convert
 * @param smooth - If true, use bezier smoothing for polylines (paint mode)
 */
function pathToSvgD(path: Path, smooth = false): string {
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
 * Convert points to SVG polyline path.
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
  penPosition,
  penDown,
  drawingEnabled,
  styleConfig = PLOTTER_STYLE,
  onStrokeStart,
  onStrokeMove,
  onStrokeEnd,
}: CanvasProps): React.ReactElement {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const getPoint = useCallback((e: React.MouseEvent): Point | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    return screenToCanvas(e.clientX, e.clientY, rect);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!drawingEnabled) return;
      const point = getPoint(e);
      if (point) {
        setIsDrawing(true);
        onStrokeStart(point.x, point.y);
      }
    },
    [drawingEnabled, getPoint, onStrokeStart]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawing || !drawingEnabled) return;
      const point = getPoint(e);
      if (point) {
        onStrokeMove(point.x, point.y);
      }
    },
    [isDrawing, drawingEnabled, getPoint, onStrokeMove]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      onStrokeEnd();
    }
  }, [isDrawing, onStrokeEnd]);

  const handleMouseLeave = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      onStrokeEnd();
    }
  }, [isDrawing, onStrokeEnd]);

  return (
    <div className="canvas-wrapper">
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: drawingEnabled ? 'crosshair' : 'default' }}
      >
        {/* Grid pattern */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <line x1="40" y1="0" x2="40" y2="40" stroke="#ddd" strokeWidth="0.5" />
            <line x1="0" y1="40" x2="40" y2="40" stroke="#ddd" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {/* Completed strokes - render with effective style */}
        {strokes.map((stroke, index) => {
          const effectiveStyle = getEffectiveStyle(stroke, styleConfig);
          const isPaintMode = styleConfig.type === 'paint';
          return (
            <path
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
            <path
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
            <path
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
          (styleConfig.type === 'paint' && agentStroke.length > 3 ? (
            // Paint mode: tapered brush stroke with smooth curves
            <path
              d={createTaperedStrokePath(
                agentStroke,
                styleConfig.agent_stroke.stroke_width * 1.5,
                0.7
              )}
              fill={styleConfig.agent_stroke.color}
              opacity={styleConfig.agent_stroke.opacity * 0.9}
            />
          ) : (
            // Plotter mode: simple polyline
            <path
              d={pointsToSvgD(agentStroke)}
              stroke={styleConfig.agent_stroke.color}
              strokeWidth={styleConfig.agent_stroke.stroke_width}
              fill="none"
              strokeLinecap={styleConfig.agent_stroke.stroke_linecap}
              strokeLinejoin={styleConfig.agent_stroke.stroke_linejoin}
            />
          ))}

        {/* Pen position indicator */}
        {penPosition && (
          <>
            {/* Outer ring */}
            <circle
              cx={penPosition.x}
              cy={penPosition.y}
              r={penDown ? 12 : 16}
              fill="none"
              stroke={styleConfig.human_stroke.color}
              strokeWidth={2}
              opacity={0.5}
            />
            {/* Inner dot */}
            <circle
              cx={penPosition.x}
              cy={penPosition.y}
              r={penDown ? 6 : 4}
              fill={penDown ? styleConfig.human_stroke.color : 'none'}
              stroke={styleConfig.human_stroke.color}
              strokeWidth={2}
            />
          </>
        )}
      </svg>

      {/* Drawing mode indicator */}
      {drawingEnabled && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '4px 8px',
            background: styleConfig.human_stroke.color,
            color: '#fff',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Drawing Mode
        </div>
      )}
    </div>
  );
}
