/**
 * Floating particles animation for idle canvas state.
 * Shows gentle, drifting particles when there's nothing on the canvas.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Circle, G } from 'react-native-svg';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@code-monet/shared';

// Particle colors - soft, artistic palette
const PARTICLE_COLORS = [
  'rgba(123, 104, 238, 0.3)', // Lavender
  'rgba(78, 205, 196, 0.3)', // Teal
  'rgba(255, 107, 107, 0.25)', // Coral
  'rgba(255, 217, 61, 0.2)', // Gold
  'rgba(233, 69, 96, 0.25)', // Rose
];

const PARTICLE_COUNT = 12;
const ANIMATION_DURATION = 15000; // 15 seconds for a full cycle

interface Particle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  radius: number;
  color: string;
  delay: number;
}

// Create animated circle component
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function generateParticles(): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Start from random positions around the edges or within canvas
    const startX = Math.random() * CANVAS_WIDTH;
    const startY = Math.random() * CANVAS_HEIGHT;

    // Drift in a random direction
    const angle = Math.random() * Math.PI * 2;
    const distance = 100 + Math.random() * 200;

    particles.push({
      id: i,
      startX,
      startY,
      endX: startX + Math.cos(angle) * distance,
      endY: startY + Math.sin(angle) * distance,
      radius: 4 + Math.random() * 12, // 4-16 radius
      color: PARTICLE_COLORS[i % PARTICLE_COLORS.length]!,
      delay: Math.random() * ANIMATION_DURATION * 0.5, // Stagger start times
    });
  }
  return particles;
}

interface IdleParticlesProps {
  visible: boolean;
}

export function IdleParticles({ visible }: IdleParticlesProps): React.JSX.Element | null {
  const particles = useMemo(() => generateParticles(), []);
  const animatedValues = useRef(
    particles.map(() => ({
      progress: new Animated.Value(0),
      opacity: new Animated.Value(0),
    }))
  ).current;
  const runningAnimations = useRef<(Animated.CompositeAnimation | null)[]>([]);

  useEffect(() => {
    // Stop any existing animations first to prevent memory leaks
    runningAnimations.current.forEach((anim) => anim?.stop());
    runningAnimations.current = [];

    if (!visible) {
      // Fade out all particles and reset progress
      animatedValues.forEach(({ opacity, progress }) => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start();
        progress.setValue(0);
      });
      return;
    }

    // Start animations for each particle
    const animations = animatedValues.map(({ progress, opacity }, index) => {
      const particle = particles[index];
      if (!particle) return null;

      // Fade in
      const fadeIn = Animated.timing(opacity, {
        toValue: 1,
        duration: 1000,
        delay: particle.delay,
        useNativeDriver: true,
      });

      // Movement loop
      const movement = Animated.loop(
        Animated.sequence([
          Animated.timing(progress, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(progress, {
            toValue: 0,
            duration: ANIMATION_DURATION,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ])
      );

      return Animated.parallel([fadeIn, movement]);
    });

    runningAnimations.current = animations;
    animations.forEach((anim) => anim?.start());

    return () => {
      runningAnimations.current.forEach((anim) => anim?.stop());
      runningAnimations.current = [];
    };
  }, [visible, animatedValues, particles]);

  if (!visible) return null;

  return (
    <G>
      {particles.map((particle, index) => {
        const { progress, opacity } = animatedValues[index] || {};
        if (!progress || !opacity) return null;

        // Interpolate position
        const cx = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [particle.startX, particle.endX],
        });
        const cy = progress.interpolate({
          inputRange: [0, 1],
          outputRange: [particle.startY, particle.endY],
        });

        return (
          <AnimatedCircle
            key={particle.id}
            cx={cx}
            cy={cy}
            r={particle.radius}
            fill={particle.color}
            opacity={opacity}
          />
        );
      })}
    </G>
  );
}
