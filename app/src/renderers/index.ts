/**
 * Renderer exports for React Native app.
 *
 * Available renderers:
 * - SvgRenderer: Basic SVG rendering (current default)
 * - FreehandSvgRenderer: SVG with perfect-freehand natural strokes
 * - SkiaRenderer: GPU-accelerated rendering (requires @shopify/react-native-skia)
 */

export { SvgRenderer } from './SvgRenderer';
export { FreehandSvgRenderer } from './FreehandSvgRenderer';

// SkiaRenderer requires @shopify/react-native-skia to be installed.
// Uncomment when the dependency is available:
// export { SkiaRenderer } from './SkiaRenderer';
