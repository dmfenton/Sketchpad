/**
 * Renderer exports for web app.
 *
 * Available renderers:
 * - SvgRenderer: Basic SVG rendering (current default)
 * - FreehandSvgRenderer: SVG with perfect-freehand natural strokes
 * - SkiaRenderer: GPU-accelerated rendering (requires canvaskit-wasm)
 */

export { SvgRenderer } from './SvgRenderer';
export { FreehandSvgRenderer } from './FreehandSvgRenderer';

// SkiaRenderer will be exported here once implemented:
// export { SkiaRenderer } from './SkiaRenderer';
