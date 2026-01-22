/**
 * useSplashAnimation - Manages splash screen animation sequence.
 */

import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

interface SplashAnimationValues {
  fadeIn: Animated.Value;
  titleSlide: Animated.Value;
  titleScale: Animated.Value;
  subtitleFade: Animated.Value;
  orbFloat1: Animated.Value;
  orbFloat2: Animated.Value;
  fadeOut: Animated.Value;
  orb1Transform: Animated.AnimatedInterpolation<number>;
  orb2Transform: Animated.AnimatedInterpolation<number>;
}

export function useSplashAnimation(onFinish: () => void): SplashAnimationValues {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(40)).current;
  const titleScale = useRef(new Animated.Value(0.9)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const orbFloat1 = useRef(new Animated.Value(0)).current;
  const orbFloat2 = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start orb floating animations
    const orbAnimation1 = Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat1, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat1, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    );

    const orbAnimation2 = Animated.loop(
      Animated.sequence([
        Animated.timing(orbFloat2, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(orbFloat2, {
          toValue: 0,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    );

    orbAnimation1.start();
    orbAnimation2.start();

    // Main animation sequence
    Animated.sequence([
      // Phase 1: Fade in background
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),

      // Phase 2: Title animates in
      Animated.parallel([
        Animated.spring(titleSlide, {
          toValue: 0,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          tension: 40,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),

      // Phase 3: Subtitle fades in
      Animated.timing(subtitleFade, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),

      // Phase 4: Hold
      Animated.delay(800),

      // Phase 5: Fade out
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      orbAnimation1.stop();
      orbAnimation2.stop();
      onFinish();
    });
  }, [fadeIn, titleSlide, titleScale, subtitleFade, orbFloat1, orbFloat2, fadeOut, onFinish]);

  const orb1Transform = orbFloat1.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -20],
  });

  const orb2Transform = orbFloat2.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 15],
  });

  return {
    fadeIn,
    titleSlide,
    titleScale,
    subtitleFade,
    orbFloat1,
    orbFloat2,
    fadeOut,
    orb1Transform,
    orb2Transform,
  };
}
