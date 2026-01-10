/**
 * SVG canvas component for web - renders strokes and handles mouse input.
 */

import { useCallback, useRef, useState } from 'react';
import type { Path, Point } from '@drawing-agent/shared';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@drawing-agent/shared';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];
  penPosition: Point | null;
  penDown: boolean;
  drawingEnabled: boolean;
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
 */
function pathToSvgD(path: Path): string {
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
 * Convert points to SVG polyline path.
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
}: CanvasProps) {
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

        {/* Completed strokes */}
        {strokes.map((stroke, index) => (
          <path
            key={`stroke-${index}`}
            d={pathToSvgD(stroke)}
            stroke="#1a1a2e"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Current stroke in progress (human drawing) */}
        {currentStroke.length > 0 && (
          <path
            d={pointsToSvgD(currentStroke)}
            stroke="#e94560"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Agent's in-progress stroke */}
        {agentStroke.length > 1 && (
          <path
            d={pointsToSvgD(agentStroke)}
            stroke="#1a1a2e"
            strokeWidth={2.5}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Pen position indicator */}
        {penPosition && (
          <>
            {/* Outer ring */}
            <circle
              cx={penPosition.x}
              cy={penPosition.y}
              r={penDown ? 12 : 16}
              fill="none"
              stroke="#e94560"
              strokeWidth={2}
              opacity={0.5}
            />
            {/* Inner dot */}
            <circle
              cx={penPosition.x}
              cy={penPosition.y}
              r={penDown ? 6 : 4}
              fill={penDown ? '#e94560' : 'none'}
              stroke="#e94560"
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
            background: '#e94560',
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
