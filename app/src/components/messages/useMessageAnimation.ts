/**
 * Hook for message entry animation.
 */

import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export function useMessageAnimation(isNew: boolean) {
  const fadeAnim = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(isNew ? 20 : 0)).current;

  useEffect(() => {
    if (isNew) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isNew, fadeAnim, slideAnim]);

  return {
    opacity: fadeAnim,
    transform: [{ translateY: slideAnim }],
  };
}
