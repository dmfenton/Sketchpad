/**
 * LiveCanvas - Real-time drawing preview with WebSocket or simulation fallback
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getWebSocketUrl } from '../../config';
import { PathData, SimulatedStroke, ALL_COLORS } from './types';
import { generateArtisticPath, pointsToPath, pathDataToSvg } from './utils';

export function LiveCanvas(): React.ReactElement {
  const [realStrokes, setRealStrokes] = useState<PathData[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [simStrokes, setSimStrokes] = useState<SimulatedStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<SimulatedStroke | null>(null);
  const strokeIdRef = useRef(0);
  const animationRef = useRef<number>();
  const wsRef = useRef<WebSocket | null>(null);

  // Try to connect to WebSocket for live strokes
  useEffect(() => {
    const connectWs = (): void => {
      try {
        const ws = new WebSocket(getWebSocketUrl());

        ws.onopen = (): void => {
          setWsConnected(true);
        };

        ws.onmessage = (event): void => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'canvas_state' && msg.strokes) {
              setRealStrokes(msg.strokes);
            } else if (msg.type === 'stroke' || msg.type === 'new_stroke') {
              setRealStrokes((prev) => [...prev.slice(-50), msg.path || msg]);
            }
          } catch (e) {
            if (import.meta.env.DEV) {
              console.warn('[LiveCanvas] Failed to parse WebSocket message:', e);
            }
          }
        };

        ws.onclose = (): void => {
          setWsConnected(false);
          wsRef.current = null;
        };

        ws.onerror = (): void => {
          setWsConnected(false);
        };

        wsRef.current = ws;
      } catch {
        setWsConnected(false);
      }
    };

    connectWs();

    return (): void => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Fallback simulation when no WebSocket
  const createNewStroke = useCallback((): void => {
    const newStroke: SimulatedStroke = {
      id: strokeIdRef.current++,
      points: generateArtisticPath(),
      color: ALL_COLORS[Math.floor(Math.random() * ALL_COLORS.length)],
      width: Math.random() * 6 + 2,
      progress: 0,
    };
    setCurrentStroke(newStroke);
  }, []);

  useEffect(() => {
    if (wsConnected && realStrokes.length > 0) {
      return;
    }

    createNewStroke();

    const animate = (): void => {
      setCurrentStroke((prev) => {
        if (!prev) return prev;

        const newProgress = prev.progress + 0.02;

        if (newProgress >= 1) {
          setSimStrokes((s) => [...s.slice(-15), { ...prev, progress: 1 }]);
          setTimeout(createNewStroke, 500 + Math.random() * 1000);
          return null;
        }

        return { ...prev, progress: newProgress };
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return (): void => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [createNewStroke, wsConnected, realStrokes.length]);

  const showReal = wsConnected && realStrokes.length > 0;

  return (
    <svg viewBox="0 0 400 300" className="live-canvas-svg">
      <defs>
        <filter id="pencilTexture">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1" />
        </filter>
      </defs>

      <rect width="400" height="300" fill="#fefefe" />

      {showReal ? (
        realStrokes.slice(-30).map((stroke, i) => (
          <path
            key={i}
            d={pathDataToSvg(stroke, 0.5)}
            fill="none"
            stroke={stroke.author === 'human' ? '#3b82f6' : '#2d3436'}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        ))
      ) : (
        <>
          {simStrokes.map((stroke) => (
            <path
              key={stroke.id}
              d={pointsToPath(stroke.points, stroke.progress)}
              fill="none"
              stroke={stroke.color}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
              filter="url(#pencilTexture)"
            />
          ))}

          {currentStroke && (
            <path
              d={pointsToPath(currentStroke.points, currentStroke.progress)}
              fill="none"
              stroke={currentStroke.color}
              strokeWidth={currentStroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#pencilTexture)"
            />
          )}

          {currentStroke && currentStroke.progress > 0 && (
            <g
              transform={`translate(${currentStroke.points[Math.floor(currentStroke.points.length * currentStroke.progress)]?.x || 0}, ${currentStroke.points[Math.floor(currentStroke.points.length * currentStroke.progress)]?.y || 0})`}
            >
              <circle r="4" fill={currentStroke.color} opacity="0.8">
                <animate attributeName="r" values="4;6;4" dur="0.5s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </>
      )}

      {showReal && (
        <g transform="translate(370, 20)">
          <circle r="6" fill="#4ade80">
            <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  );
}
