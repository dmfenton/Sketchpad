/**
 * Renderer abstraction module.
 *
 * Provides a common interface for SVG and Skia renderers,
 * allowing blue-green deployment between rendering backends.
 */

// Types
export type { RendererType, RendererConfig, RendererProps, RendererContextValue } from './types';

// Configuration
export {
  DEFAULT_RENDERER_CONFIG,
  FREEHAND_SVG_CONFIG,
  SKIA_PAINTERLY_CONFIG,
  getDefaultConfigForRenderer,
  isRendererAvailable,
} from './config';

// Perfect-freehand stroke processing
export type { FreehandStrokeOptions } from './freehand';
export {
  DEFAULT_FREEHAND_OPTIONS,
  PAINTERLY_FREEHAND_OPTIONS,
  brushPresetToFreehandOptions,
  getFreehandOutline,
  outlineToSvgPath,
  pointsToFreehandPath,
  getBristleOutlines,
} from './freehand';
