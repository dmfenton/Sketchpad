/**
 * Renderer configuration defaults and utilities.
 */

import type { RendererConfig, RendererType } from './types';

/**
 * Default renderer configuration.
 * Starts with SVG (current behavior) with all Skia features disabled.
 */
export const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  renderer: 'svg',
  enablePerfectFreehand: false,
  enableBristles: false,
  enableBlur: false,
  enablePaperTexture: false,
};

/**
 * Skia renderer configuration with painterly features enabled.
 */
export const SKIA_PAINTERLY_CONFIG: RendererConfig = {
  renderer: 'skia',
  enablePerfectFreehand: true,
  enableBristles: true,
  enableBlur: true,
  enablePaperTexture: false,
};

/**
 * Get default config for a renderer type.
 */
export function getDefaultConfigForRenderer(type: RendererType): RendererConfig {
  switch (type) {
    case 'skia':
      return SKIA_PAINTERLY_CONFIG;
    case 'svg':
    default:
      return DEFAULT_RENDERER_CONFIG;
  }
}

/**
 * Check if a renderer type is available on the current platform.
 * SVG is always available. Skia requires react-native-skia to be installed.
 */
export function isRendererAvailable(type: RendererType): boolean {
  // SVG is always available
  if (type === 'svg') return true;

  // Skia availability is checked at runtime by the platform-specific code
  // This function is overridden in app/web to do actual checks
  return false;
}
