/**
 * Code Monet Splash Screen
 * A bold, immersive splash with gradient orbs and dynamic animations,
 * matching the web homepage aesthetic.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { spacing, typography, useTheme } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish: () => void;
}

// Animated gradient orb
function GradientOrb({
  cx,
  cy,
  size,
  color1,
  color2,
  gradientId,
}: {
  cx: number;
  cy: number;
  size: number;
  color1: string;
  color2: string;
  gradientId: string;
}) {
  return (
    <G>
      <Defs>
        <LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={color1} stopOpacity="0.6" />
          <Stop offset="100%" stopColor={color2} stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Circle cx={cx} cy={cy} r={size} fill={`url(#${gradientId})`} />
    </G>
  );
}

// Paint splatter decoration
function PaintSplatter({
  x,
  y,
  size,
  color,
}: {
  x: number;
  y: number;
  size: number;
  color: string;
}) {
  return <Circle cx={x} cy={y} r={size} fill={color} opacity={0.15} />;
}

// Artistic brush stroke
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
  const height = width * 0.12;

  return (
    <Path
      d={`M ${x} ${y}
          Q ${x + width * 0.25} ${y - height * 0.8} ${x + width * 0.5} ${y}
          Q ${x + width * 0.75} ${y + height * 0.8} ${x + width} ${y}`}
      stroke={color}
      strokeWidth={height * 2}
      strokeLinecap="round"
      fill="none"
      opacity={0.4}
      transform={`rotate(${rotation}, ${x + width / 2}, ${y})`}
    />
  );
}

export function SplashScreen({ onFinish }: SplashScreenProps): React.JSX.Element {
  const { colors, shadows } = useTheme();

  // Animation values
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

  return (
    <Animated.View
      style={[styles.container, { backgroundColor: colors.background, opacity: fadeOut }]}
    >
      {/* Gradient orbs background */}
      <Animated.View
        style={[
          styles.orbContainer,
          {
            opacity: fadeIn,
            transform: [{ translateY: orb1Transform }],
          },
        ]}
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.svg}>
          {/* Large gradient orbs */}
          <GradientOrb
            cx={SCREEN_WIDTH * 0.2}
            cy={SCREEN_HEIGHT * 0.2}
            size={SCREEN_WIDTH * 0.6}
            color1={colors.primary}
            color2={colors.secondary}
            gradientId="orb1"
          />
          <GradientOrb
            cx={SCREEN_WIDTH * 0.85}
            cy={SCREEN_HEIGHT * 0.35}
            size={SCREEN_WIDTH * 0.5}
            color1={colors.secondary}
            color2={colors.accent}
            gradientId="orb2"
          />
          <GradientOrb
            cx={SCREEN_WIDTH * 0.3}
            cy={SCREEN_HEIGHT * 0.75}
            size={SCREEN_WIDTH * 0.45}
            color1={colors.accent}
            color2={colors.primary}
            gradientId="orb3"
          />

          {/* Paint splatters */}
          <PaintSplatter
            x={SCREEN_WIDTH * 0.1}
            y={SCREEN_HEIGHT * 0.15}
            size={30}
            color={colors.primary}
          />
          <PaintSplatter
            x={SCREEN_WIDTH * 0.85}
            y={SCREEN_HEIGHT * 0.1}
            size={25}
            color={colors.accent}
          />
          <PaintSplatter
            x={SCREEN_WIDTH * 0.7}
            y={SCREEN_HEIGHT * 0.8}
            size={35}
            color={colors.secondary}
          />
          <PaintSplatter
            x={SCREEN_WIDTH * 0.15}
            y={SCREEN_HEIGHT * 0.85}
            size={20}
            color={colors.gold}
          />

          {/* Brush strokes */}
          <BrushStroke
            x={30}
            y={SCREEN_HEIGHT * 0.25}
            width={100}
            color={colors.primary}
            rotation={-8}
          />
          <BrushStroke
            x={SCREEN_WIDTH - 130}
            y={SCREEN_HEIGHT * 0.18}
            width={90}
            color={colors.secondary}
            rotation={5}
          />
          <BrushStroke
            x={50}
            y={SCREEN_HEIGHT * 0.78}
            width={80}
            color={colors.accent}
            rotation={-3}
          />
          <BrushStroke
            x={SCREEN_WIDTH - 110}
            y={SCREEN_HEIGHT * 0.82}
            width={70}
            color={colors.coral}
            rotation={6}
          />
        </Svg>
      </Animated.View>

      {/* Second floating layer */}
      <Animated.View
        style={[
          styles.orbContainer,
          {
            opacity: fadeIn,
            transform: [{ translateY: orb2Transform }],
          },
        ]}
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.svg}>
          <GradientOrb
            cx={SCREEN_WIDTH * 0.7}
            cy={SCREEN_HEIGHT * 0.6}
            size={SCREEN_WIDTH * 0.4}
            color1={colors.lavender}
            color2={colors.primary}
            gradientId="orb4"
          />
        </Svg>
      </Animated.View>

      {/* Title content */}
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: fadeIn,
              transform: [{ translateY: titleSlide }, { scale: titleScale }],
            },
          ]}
        >
          <View style={styles.titleRow}>
            <Animated.Text style={[styles.titleCode, { color: colors.primary }]}>
              Code
            </Animated.Text>
            <Animated.Text style={[styles.titleMonet, { color: colors.textPrimary }]}>
              Monet
            </Animated.Text>
          </View>
          <View style={styles.titleUnderlineContainer}>
            <View style={[styles.titleUnderline, { backgroundColor: colors.primary }]} />
            <View
              style={[
                styles.titleUnderline,
                styles.titleUnderlineAccent,
                { backgroundColor: colors.accent },
              ]}
            />
          </View>
        </Animated.View>

        <Animated.Text
          style={[styles.subtitle, { color: colors.textSecondary, opacity: subtitleFade }]}
        >
          An autonomous AI artist
        </Animated.Text>

        <Animated.View style={[styles.iconContainer, { opacity: subtitleFade }]}>
          <View style={[styles.brushIcon, shadows.glow]}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              <Defs>
                <LinearGradient id="brushGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={colors.primary} />
                  <Stop offset="100%" stopColor={colors.coral} />
                </LinearGradient>
              </Defs>
              <Path
                d="M10 34 Q14 30 18 26 L30 14 Q34 10 36 8 Q38 10 36 14 L24 26 Q20 30 16 34 Q12 38 10 34Z"
                fill="url(#brushGradient)"
              />
              <Circle cx={12} cy={34} r={4} fill={colors.accent} />
            </Svg>
          </View>
        </Animated.View>
      </View>

      {/* Bottom attribution */}
      <Animated.Text
        style={[styles.attribution, { color: colors.textMuted, opacity: subtitleFade }]}
      >
        Powered by Claude
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
  orbContainer: {
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  titleCode: {
    ...typography.artistic,
    fontWeight: '300',
  },
  titleMonet: {
    ...typography.artistic,
    fontWeight: '200',
  },
  titleUnderlineContainer: {
    flexDirection: 'row',
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  titleUnderline: {
    width: 60,
    height: 3,
    borderRadius: 2,
  },
  titleUnderlineAccent: {
    width: 40,
  },
  subtitle: {
    ...typography.heading,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '400',
    letterSpacing: 1,
  },
  iconContainer: {
    marginTop: spacing['2xl'],
  },
  brushIcon: {
    padding: spacing.sm,
    borderRadius: 22,
  },
  attribution: {
    position: 'absolute',
    bottom: spacing['3xl'],
    ...typography.caption,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
