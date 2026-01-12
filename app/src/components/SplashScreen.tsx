/**
 * Code Monet Splash Screen
 * An impressionist-inspired animated splash with floating water lilies,
 * gentle brush strokes, and dreamy color transitions.
 *
 * Uses Reanimated for smooth, spring-based animations with parallel execution.
 * Total duration: ~2.2 seconds (vs previous ~5 seconds)
 */

import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { spacing, typography, useTheme } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

// Water lily component - a stylized impressionist flower
function WaterLily({
  cx,
  cy,
  size,
  petalColor,
  rotation = 0,
  accent,
  accentMuted,
  gold,
}: {
  cx: number;
  cy: number;
  size: number;
  petalColor: string;
  rotation?: number;
  accent: string;
  accentMuted: string;
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
      {/* Lily pad (green circle beneath) */}
      <Circle cx={cx} cy={cy} r={size * 1.2} fill={accent} opacity={0.4} />
      <Circle cx={cx - size * 0.2} cy={cy} r={size * 1.1} fill={accentMuted} opacity={0.3} />
      {/* Petals */}
      {petals}
      {/* Center of flower */}
      <Circle cx={cx} cy={cy} r={size * 0.25} fill={gold} opacity={0.9} />
      <Circle cx={cx} cy={cy} r={size * 0.15} fill="#F0E0A0" />
    </G>
  );
}

// Floating brush stroke decoration
function BrushStroke({
  x,
  y,
  width,
  color,
  rotation = 0,
}: {
  x: number;
  y: number;
  width: number;
  color: string;
  rotation?: number;
}) {
  const height = width * 0.15;

  return (
    <Path
      d={`M ${x} ${y}
          Q ${x + width * 0.3} ${y - height} ${x + width * 0.5} ${y}
          Q ${x + width * 0.7} ${y + height} ${x + width} ${y}`}
      stroke={color}
      strokeWidth={height * 1.5}
      strokeLinecap="round"
      fill="none"
      opacity={0.6}
      transform={`rotate(${rotation}, ${x + width / 2}, ${y})`}
    />
  );
}

// Spring config for smooth, natural feel
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 100,
  mass: 0.8,
};

const FAST_SPRING = {
  damping: 20,
  stiffness: 150,
};

export function SplashScreen({ onFinish }: SplashScreenProps): React.JSX.Element {
  const { colors, gradients, shadows } = useTheme();

  // Animation values - all running in parallel
  const containerOpacity = useSharedValue(1);
  const backgroundScale = useSharedValue(0.9);
  const svgOpacity = useSharedValue(0);
  const svgScale = useSharedValue(0.8);
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);
  const subtitleOpacity = useSharedValue(0);
  const brushOpacity = useSharedValue(0);
  const brushScale = useSharedValue(0.5);
  const attributionOpacity = useSharedValue(0);
  const floatOffset = useSharedValue(0);

  // Staggered lily animations
  const lily1 = useSharedValue(0);
  const lily2 = useSharedValue(0);
  const lily3 = useSharedValue(0);
  const lily4 = useSharedValue(0);
  const lily5 = useSharedValue(0);
  const lily6 = useSharedValue(0);

  useEffect(() => {
    // All animations start immediately and run in parallel
    // Phase 1: Background and decorations (0-400ms)
    backgroundScale.value = withSpring(1, FAST_SPRING);
    svgOpacity.value = withSpring(1, SPRING_CONFIG);
    svgScale.value = withSpring(1, SPRING_CONFIG);

    // Staggered lily reveals (each 50ms apart)
    lily1.value = withDelay(50, withSpring(1, SPRING_CONFIG));
    lily2.value = withDelay(100, withSpring(1, SPRING_CONFIG));
    lily3.value = withDelay(150, withSpring(1, SPRING_CONFIG));
    lily4.value = withDelay(200, withSpring(1, SPRING_CONFIG));
    lily5.value = withDelay(250, withSpring(1, SPRING_CONFIG));
    lily6.value = withDelay(300, withSpring(1, SPRING_CONFIG));

    // Phase 2: Title and subtitle (150ms delay, overlaps with lilies)
    titleOpacity.value = withDelay(150, withSpring(1, FAST_SPRING));
    titleTranslateY.value = withDelay(150, withSpring(0, SPRING_CONFIG));
    subtitleOpacity.value = withDelay(300, withSpring(1, SPRING_CONFIG));

    // Phase 3: Brush icon and attribution (400ms delay)
    brushOpacity.value = withDelay(400, withSpring(1, SPRING_CONFIG));
    brushScale.value = withDelay(400, withSpring(1, SPRING_CONFIG));
    attributionOpacity.value = withDelay(500, withSpring(1, SPRING_CONFIG));

    // Gentle floating animation (continuous)
    floatOffset.value = withDelay(
      300,
      withSequence(
        withTiming(-4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(4, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) })
      )
    );

    // Phase 4: Fade out (starts at 1800ms, completes by 2200ms)
    containerOpacity.value = withDelay(
      1800,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) }, (finished) => {
        if (finished) {
          runOnJS(onFinish)();
        }
      })
    );
  }, [
    backgroundScale,
    svgOpacity,
    svgScale,
    titleOpacity,
    titleTranslateY,
    subtitleOpacity,
    brushOpacity,
    brushScale,
    attributionOpacity,
    floatOffset,
    containerOpacity,
    lily1,
    lily2,
    lily3,
    lily4,
    lily5,
    lily6,
    onFinish,
  ]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const backgroundStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backgroundScale.value }],
  }));

  const svgStyle = useAnimatedStyle(() => ({
    opacity: svgOpacity.value,
    transform: [{ scale: svgScale.value }, { translateY: floatOffset.value }],
  }));

  const titleContainerStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const subtitleStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  const brushContainerStyle = useAnimatedStyle(() => ({
    opacity: brushOpacity.value,
    transform: [{ scale: brushScale.value }],
  }));

  const attributionStyle = useAnimatedStyle(() => ({
    opacity: attributionOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background }, containerStyle]}>
      {/* Gradient-like background with overlapping circles */}
      <Animated.View style={[styles.gradientBackground, backgroundStyle]}>
        <View
          style={[styles.gradientCircle, styles.gradientCircle1, { backgroundColor: gradients.mist[0] }]}
        />
        <View
          style={[
            styles.gradientCircle,
            styles.gradientCircle2,
            { backgroundColor: gradients.waterLilies[1] },
          ]}
        />
        <View
          style={[styles.gradientCircle, styles.gradientCircle3, { backgroundColor: gradients.garden[0] }]}
        />
        <View
          style={[styles.gradientCircle, styles.gradientCircle4, { backgroundColor: gradients.sunrise[0] }]}
        />
      </Animated.View>

      {/* SVG decorations */}
      <Animated.View style={[styles.svgContainer, svgStyle]}>
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.svg}>
          {/* Background brush strokes */}
          <BrushStroke
            x={20}
            y={SCREEN_HEIGHT * 0.15}
            width={120}
            color={gradients.waterLilies[0]}
            rotation={-5}
          />
          <BrushStroke
            x={SCREEN_WIDTH - 140}
            y={SCREEN_HEIGHT * 0.2}
            width={100}
            color={gradients.waterLilies[1]}
            rotation={8}
          />
          <BrushStroke
            x={40}
            y={SCREEN_HEIGHT * 0.75}
            width={80}
            color={gradients.garden[0]}
            rotation={-3}
          />
          <BrushStroke
            x={SCREEN_WIDTH - 100}
            y={SCREEN_HEIGHT * 0.8}
            width={70}
            color={gradients.sunset[0]}
            rotation={5}
          />

          {/* Water lilies */}
          <WaterLily
            cx={SCREEN_WIDTH * 0.2}
            cy={SCREEN_HEIGHT * 0.3}
            size={35}
            petalColor={colors.secondary}
            rotation={15}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.8}
            cy={SCREEN_HEIGHT * 0.25}
            size={28}
            petalColor={colors.lavender}
            rotation={-20}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.15}
            cy={SCREEN_HEIGHT * 0.72}
            size={32}
            petalColor={colors.coral}
            rotation={45}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.85}
            cy={SCREEN_HEIGHT * 0.68}
            size={40}
            petalColor={colors.secondary}
            rotation={-10}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />

          {/* Small accent lilies */}
          <WaterLily
            cx={SCREEN_WIDTH * 0.65}
            cy={SCREEN_HEIGHT * 0.15}
            size={18}
            petalColor={colors.lavender}
            rotation={30}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />
          <WaterLily
            cx={SCREEN_WIDTH * 0.35}
            cy={SCREEN_HEIGHT * 0.85}
            size={22}
            petalColor={colors.coral}
            rotation={-25}
            accent={colors.accent}
            accentMuted={colors.accentMuted}
            gold={colors.gold}
          />
        </Svg>
      </Animated.View>

      {/* Title content */}
      <View style={styles.content}>
        <Animated.View style={[styles.titleContainer, titleContainerStyle]}>
          <Animated.Text style={[styles.title, { color: colors.textPrimary }]}>Code Monet</Animated.Text>
          <View style={[styles.titleUnderline, { backgroundColor: colors.secondary }]} />
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { color: colors.textSecondary }, subtitleStyle]}>
          Where AI Meets Impressionism
        </Animated.Text>

        <Animated.View style={[styles.brushContainer, brushContainerStyle]}>
          <View style={[styles.brushIcon, shadows.glow]}>
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Path
                d="M8 32 Q12 28 16 24 L28 12 Q32 8 34 6 Q36 8 34 12 L22 24 Q18 28 14 32 Q10 36 8 32Z"
                fill={colors.primary}
                opacity={0.9}
              />
              <Circle cx={10} cy={32} r={4} fill={colors.secondary} />
            </Svg>
          </View>
        </Animated.View>
      </View>

      {/* Bottom attribution */}
      <Animated.Text style={[styles.attribution, { color: colors.textMuted }, attributionStyle]}>
        An AI Drawing Experience
      </Animated.Text>
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
    width: SCREEN_WIDTH * 1.5,
    height: SCREEN_WIDTH * 1.5,
    top: -SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.25,
    opacity: 0.5,
  },
  gradientCircle2: {
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    bottom: -SCREEN_WIDTH * 0.4,
    right: -SCREEN_WIDTH * 0.3,
    opacity: 0.3,
  },
  gradientCircle3: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    top: SCREEN_HEIGHT * 0.3,
    left: -SCREEN_WIDTH * 0.2,
    opacity: 0.25,
  },
  gradientCircle4: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    bottom: SCREEN_HEIGHT * 0.25,
    right: -SCREEN_WIDTH * 0.15,
    opacity: 0.3,
  },
  svgContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  svg: {
    position: 'absolute',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.artistic,
    textAlign: 'center',
    textShadowColor: 'rgba(123, 140, 222, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  titleUnderline: {
    width: 120,
    height: 3,
    marginTop: spacing.md,
    borderRadius: 2,
    opacity: 0.8,
  },
  subtitle: {
    ...typography.heading,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  brushContainer: {
    marginTop: spacing['2xl'],
  },
  brushIcon: {},
  attribution: {
    position: 'absolute',
    bottom: spacing['3xl'],
    ...typography.caption,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
