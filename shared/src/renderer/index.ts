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
  SKIA_PAINTERLY_CONFIG,
  getDefaultConfigForRenderer,
  isRendererAvailable,
} from './config';
