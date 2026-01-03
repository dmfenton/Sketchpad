/**
 * Code Monet Splash Screen
 * An impressionist-inspired animated splash with floating water lilies,
 * gentle brush strokes, and dreamy color transitions.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { colors, gradients, shadows, spacing, typography } from '../theme';

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
}: {
  cx: number;
  cy: number;
  size: number;
  petalColor: string;
  rotation?: number;
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
      <Circle cx={cx} cy={cy} r={size * 1.2} fill={colors.accent} opacity={0.4} />
      <Circle cx={cx - size * 0.2} cy={cy} r={size * 1.1} fill={colors.accentMuted} opacity={0.3} />
      {/* Petals */}
      {petals}
      {/* Center of flower */}
      <Circle cx={cx} cy={cy} r={size * 0.25} fill={colors.gold} opacity={0.9} />
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

export function SplashScreen({ onFinish }: SplashScreenProps): React.JSX.Element {
  // Animation values
  const fadeIn = useRef(new Animated.Value(0)).current;
  const titleSlide = useRef(new Animated.Value(30)).current;
  const subtitleFade = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Orchestrated animation sequence
    Animated.sequence([
      // Phase 1: Fade in background and content
      Animated.parallel([
        Animated.timing(fadeIn, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),

      // Phase 2: Title slides in
      Animated.parallel([
        Animated.timing(titleSlide, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(subtitleFade, {
          toValue: 1,
          duration: 800,
          delay: 200,
          useNativeDriver: true,
        }),
      ]),

      // Phase 3: Gentle floating animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        { iterations: 1 }
      ),

      // Phase 4: Hold then fade out
      Animated.delay(300),
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, [fadeIn, titleSlide, subtitleFade, floatAnim, fadeOut, onFinish]);

  const floatTransform = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Gradient-like background with overlapping circles */}
      <View style={styles.gradientBackground}>
        <View style={[styles.gradientCircle, styles.gradientCircle1]} />
        <View style={[styles.gradientCircle, styles.gradientCircle2]} />
        <View style={[styles.gradientCircle, styles.gradientCircle3]} />
        <View style={[styles.gradientCircle, styles.gradientCircle4]} />
      </View>

      {/* SVG decorations */}
      <Animated.View
        style={[
          styles.svgContainer,
          {
            opacity: fadeIn,
            transform: [{ translateY: floatTransform }],
          },
        ]}
      >
        <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={styles.svg}>
          {/* Background brush strokes */}
          <BrushStroke x={20} y={SCREEN_HEIGHT * 0.15} width={120} color={gradients.waterLilies[0]} rotation={-5} />
          <BrushStroke x={SCREEN_WIDTH - 140} y={SCREEN_HEIGHT * 0.2} width={100} color={gradients.waterLilies[1]} rotation={8} />
          <BrushStroke x={40} y={SCREEN_HEIGHT * 0.75} width={80} color={gradients.garden[0]} rotation={-3} />
          <BrushStroke x={SCREEN_WIDTH - 100} y={SCREEN_HEIGHT * 0.8} width={70} color={gradients.sunset[0]} rotation={5} />

          {/* Water lilies */}
          <WaterLily
            cx={SCREEN_WIDTH * 0.2}
            cy={SCREEN_HEIGHT * 0.3}
            size={35}
            petalColor={colors.secondary}
            rotation={15}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.8}
            cy={SCREEN_HEIGHT * 0.25}
            size={28}
            petalColor={colors.lavender}
            rotation={-20}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.15}
            cy={SCREEN_HEIGHT * 0.72}
            size={32}
            petalColor={colors.coral}
            rotation={45}
          />

          <WaterLily
            cx={SCREEN_WIDTH * 0.85}
            cy={SCREEN_HEIGHT * 0.68}
            size={40}
            petalColor={colors.secondary}
            rotation={-10}
          />

          {/* Small accent lilies */}
          <WaterLily
            cx={SCREEN_WIDTH * 0.65}
            cy={SCREEN_HEIGHT * 0.15}
            size={18}
            petalColor={colors.lavender}
            rotation={30}
          />
          <WaterLily
            cx={SCREEN_WIDTH * 0.35}
            cy={SCREEN_HEIGHT * 0.85}
            size={22}
            petalColor={colors.coral}
            rotation={-25}
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
              transform: [{ translateY: titleSlide }],
            },
          ]}
        >
          <Animated.Text style={styles.title}>Code Monet</Animated.Text>
          <View style={styles.titleUnderline} />
        </Animated.View>

        <Animated.Text style={[styles.subtitle, { opacity: subtitleFade }]}>
          Where AI Meets Impressionism
        </Animated.Text>

        <Animated.View style={[styles.brushContainer, { opacity: subtitleFade }]}>
          <View style={styles.brushIcon}>
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
      <Animated.Text style={[styles.attribution, { opacity: subtitleFade }]}>
        An AI Drawing Experience
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
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
    backgroundColor: gradients.mist[0],
    top: -SCREEN_WIDTH * 0.5,
    left: -SCREEN_WIDTH * 0.25,
    opacity: 0.5,
  },
  gradientCircle2: {
    width: SCREEN_WIDTH * 1.2,
    height: SCREEN_WIDTH * 1.2,
    backgroundColor: gradients.waterLilies[1],
    bottom: -SCREEN_WIDTH * 0.4,
    right: -SCREEN_WIDTH * 0.3,
    opacity: 0.3,
  },
  gradientCircle3: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    backgroundColor: gradients.garden[0],
    top: SCREEN_HEIGHT * 0.3,
    left: -SCREEN_WIDTH * 0.2,
    opacity: 0.25,
  },
  gradientCircle4: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: gradients.sunrise[0],
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
    color: colors.textPrimary,
    textAlign: 'center',
    textShadowColor: 'rgba(123, 140, 222, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  titleUnderline: {
    width: 120,
    height: 3,
    backgroundColor: colors.secondary,
    marginTop: spacing.md,
    borderRadius: 2,
    opacity: 0.8,
  },
  subtitle: {
    ...typography.heading,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  brushContainer: {
    marginTop: spacing['2xl'],
  },
  brushIcon: {
    ...shadows.glow,
  },
  attribution: {
    position: 'absolute',
    bottom: spacing['3xl'],
    ...typography.caption,
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});
