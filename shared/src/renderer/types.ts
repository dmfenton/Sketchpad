/**
 * Renderer abstraction types.
 * Platform-agnostic interface that both SVG and Skia renderers implement.
 */

import type { DrawingStyleConfig, Path, Point, StrokeStyle } from '../types';

/**
 * Available renderer types.
 */
export type RendererType = 'svg' | 'skia';

/**
 * Renderer configuration with feature flags.
 */
export interface RendererConfig {
  /** Which renderer to use */
  renderer: RendererType;
  /** Enable perfect-freehand for natural stroke outlines (Skia only) */
  enablePerfectFreehand: boolean;
  /** Enable bristle simulation for painterly effect (Skia only) */
  enableBristles: boolean;
  /** Enable soft blur on stroke edges (Skia only) */
  enableBlur: boolean;
  /** Enable paper texture overlay (Skia only) */
  enablePaperTexture: boolean;
}

/**
 * Props passed to renderer components.
 * Both SvgRenderer and SkiaRenderer accept these props.
 */
export interface RendererProps {
  /** Completed strokes to render */
  strokes: Path[];
  /** Current human stroke in progress */
  currentStroke: Point[];
  /** Agent's in-progress stroke */
  agentStroke: Point[];
  /** Style override for agent's in-progress stroke */
  agentStrokeStyle: Partial<StrokeStyle> | null;
  /** Current pen/cursor position */
  penPosition: Point | null;
  /** Whether pen is currently down (drawing) */
  penDown: boolean;
  /** Drawing style configuration */
  styleConfig: DrawingStyleConfig;
  /** Whether to show idle animation */
  showIdleAnimation: boolean;
  /** Canvas width in logical units */
  width: number;
  /** Canvas height in logical units */
  height: number;
  /** Primary color for UI elements (pen indicator) */
  primaryColor: string;
}

/**
 * Renderer context value for feature flag management.
 */
export interface RendererContextValue {
  /** Current renderer configuration */
  config: RendererConfig;
  /** Update the renderer type */
  setRenderer: (type: RendererType) => void;
  /** Update renderer config */
  setConfig: (config: Partial<RendererConfig>) => void;
}
