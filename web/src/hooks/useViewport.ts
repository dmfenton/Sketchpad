/**
 * Viewport size detection hook for responsive layouts.
 */

import { useCallback, useEffect, useState } from 'react';

export type ViewportSize = 'mobile' | 'tablet' | 'desktop';

interface UseViewportReturn {
  width: number;
  height: number;
  size: ViewportSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

const BREAKPOINTS = {
  mobile: 768,
  tablet: 1024,
} as const;

function getViewportSize(width: number): ViewportSize {
  if (width < BREAKPOINTS.mobile) return 'mobile';
  if (width < BREAKPOINTS.tablet) return 'tablet';
  return 'desktop';
}

export function useViewport(): UseViewportReturn {
  const [dimensions, setDimensions] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  const handleResize = useCallback(() => {
    setDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', handleResize);
    // Initial call to ensure correct state
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const size = getViewportSize(dimensions.width);

  return {
    width: dimensions.width,
    height: dimensions.height,
    size,
    isMobile: size === 'mobile',
    isTablet: size === 'tablet',
    isDesktop: size === 'desktop',
  };
}
