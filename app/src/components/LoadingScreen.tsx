/**
 * Loading Screen - A beautiful loading state matching splash aesthetic
 * Used during auth verification and initial loading states.
 */

import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G } from 'react-native-svg';
import { useTheme } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Single water lily for the loading animation
function LoadingLily({
  cx,
  cy,
  size,
  petalColor,
  rotation = 0,
  accent,
  gold,
}: {
  cx: number;
  cy: number;
  size: number;
  petalColor: string;
  rotation?: number;
  accent: string;
  gold: string;
}) {
  const petalCount = 8;
  const petals = [];

  for (let i = 0; i < petalCount; i++) {
    const angle = (i * 360) / petalCount + rotation;
    const radians = (angle * Math.PI) / 180;
    const petalLength = size * 0.8;
    const petalWidth = size * 0.35;

    petals.push(
      <Ellipse
        key={i}
        cx={cx + Math.cos(radians) * size * 0.3}
        cy={cy + Math.sin(radians) * size * 0.3}
        rx={petalWidth}
        ry={petalLength}
        fill={petalColor}
        opacity={0.85}
        transform={`rotate(${angle}, ${cx + Math.cos(radians) * size * 0.3}, ${cy + Math.sin(radians) * size * 0.3})`}
      />
    );
  }

  return (
    <G>
      <Circle cx={cx} cy={cy} r={size * 1.2} fill={accent} opacity={0.3} />
      {petals}
      <Circle cx={cx} cy={cy} r={size * 0.25} fill={gold} opacity={0.9} />
      <Circle cx={cx} cy={cy} r={size * 0.15} fill="#F0E0A0" />
    </G>
  );
}

export function LoadingScreen(): React.JSX.Element {
  const { colors, gradients } = useTheme();

  // Animation values
  const fadeIn = useSharedValue(0);
  const rotation = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const floatY = useSharedValue(0);

  useEffect(() => {
    // Fade in quickly
    fadeIn.value = withSpring(1, { damping: 20, stiffness: 100 });

    // Gentle scale pulse
    scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.95, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Gentle rotation
    rotation.value = withRepeat(
      withSequence(
        withTiming(5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(-5, { duration: 2000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );

    // Floating effect
    floatY.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(8, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, [fadeIn, rotation, scale, floatY]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const lilyStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
      { translateY: floatY.value },
    ],
  }));

  // Staggered dots animation
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const dotAnimation = (delay: number) =>
      withRepeat(
        withDelay(
          delay,
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.3, { duration: 400 })
          )
        ),
        -1,
        true
      );

    dot1.value = dotAnimation(0);
    dot2.value = dotAnimation(150);
    dot3.value = dotAnimation(300);
  }, [dot1, dot2, dot3]);

  const dotStyle1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const dotStyle2 = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const dotStyle3 = useAnimatedStyle(() => ({ opacity: dot3.value }));

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background }, containerStyle]}>
      {/* Gradient background circles */}
      <View style={styles.gradientBackground}>
        <View
          style={[styles.gradientCircle, styles.gradientCircle1, { backgroundColor: gradients.mist[0] }]}
        />
        <View
          style={[styles.gradientCircle, styles.gradientCircle2, { backgroundColor: gradients.waterLilies[1] }]}
        />
      </View>

      {/* Animated lily */}
      <Animated.View style={[styles.lilyContainer, lilyStyle]}>
        <Svg width={120} height={120} viewBox="0 0 120 120">
          <LoadingLily
            cx={60}
            cy={60}
            size={40}
            petalColor={colors.secondary}
            accent={colors.accent}
            gold={colors.gold}
          />
        </Svg>
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsContainer}>
        <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, dotStyle1]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.secondary }, dotStyle2]} />
        <Animated.View style={[styles.dot, { backgroundColor: colors.lavender }, dotStyle3]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  gradientBackground: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gradientCircle: {
    position: 'absolute',
    borderRadius: 9999,
  },
  gradientCircle1: {
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    top: -SCREEN_WIDTH * 0.4,
    left: -SCREEN_WIDTH * 0.2,
    opacity: 0.4,
  },
  gradientCircle2: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    bottom: -SCREEN_WIDTH * 0.3,
    right: -SCREEN_WIDTH * 0.2,
    opacity: 0.25,
  },
  lilyContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
