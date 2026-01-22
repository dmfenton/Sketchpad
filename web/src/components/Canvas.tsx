/**
 * SVG canvas component for web - renders strokes and handles mouse input.
 */

import React, { useCallback, useRef, useState } from 'react';
import type { DrawingStyleConfig, Path, Point, StrokeStyle } from '@code-monet/shared';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  getEffectiveStyle,
  PLOTTER_STYLE,
  createTaperedStrokePath,
  pathToSvgD,
  pointsToSvgD,
} from '@code-monet/shared';
import { IdleParticles } from './IdleParticles';

interface CanvasProps {
  strokes: Path[];
  currentStroke: Point[];
  agentStroke: Point[];
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
        {/* Idle animation - floating particles when canvas is empty and agent is idle */}
        <IdleParticles visible={showIdleAnimation} />

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
              // Paint mode: tapered brush stroke with smooth curves
              <path
                d={createTaperedStrokePath(agentStroke, effectiveWidth * 1.5, 0.7)}
                fill={effectiveColor}
                opacity={effectiveOpacity * 0.9}
              />
            ) : (
              // Plotter mode: simple polyline
              <path
                d={pointsToSvgD(agentStroke)}
                stroke={effectiveColor}
                strokeWidth={effectiveWidth}
                fill="none"
                strokeLinecap={styleConfig.agent_stroke.stroke_linecap}
                strokeLinejoin={styleConfig.agent_stroke.stroke_linejoin}
              />
            );
          })()}

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
