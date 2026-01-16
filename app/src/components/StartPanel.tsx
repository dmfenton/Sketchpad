/**
 * Hero start panel shown when canvas is empty.
 * Provides an inviting experience to begin drawing with inline suggestions.
 */

import React, { useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DrawingStyleType } from '@code-monet/shared';

import { spacing, borderRadius, typography, useTheme } from '../theme';

interface StartPanelProps {
  connected: boolean;
  drawingStyle: DrawingStyleType;
  onStyleChange: (style: DrawingStyleType) => void;
  onStart: (direction?: string) => void;
}

const QUICK_IDEAS = [
  { label: 'Landscape', icon: 'leaf-outline' as const },
  { label: 'Abstract', icon: 'shapes-outline' as const },
  { label: 'Playful', icon: 'happy-outline' as const },
  { label: 'Geometric', icon: 'triangle-outline' as const },
  { label: 'Flowing', icon: 'water-outline' as const },
  { label: 'Bold', icon: 'flash-outline' as const },
];

const MAX_LENGTH = 200;

export function StartPanel({
  connected,
  drawingStyle,
  onStyleChange,
  onStart,
}: StartPanelProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const [customText, setCustomText] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const handleQuickStart = (idea: string) => {
    onStart(idea);
  };

  const handleSurpriseMe = () => {
    onStart(undefined);
  };

  const handleCustomStart = () => {
    if (customText.trim()) {
      onStart(customText.trim());
      setCustomText('');
      setShowCustomInput(false);
    }
  };

  const remainingChars = MAX_LENGTH - customText.length;

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={dismissKeyboard}>
      <View style={[styles.container, { backgroundColor: colors.surface }, shadows.md]}>
        {/* Header - hidden when custom input is shown to save space for keyboard */}
        {!showCustomInput && (
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="brush" size={28} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Start Creating</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Choose an idea or describe your vision
            </Text>
          </View>
        )}

        {/* Style Selector - hidden when custom input is shown */}
        {!showCustomInput && (
          <View style={styles.styleSection}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Drawing style</Text>
            <View style={[styles.styleToggle, { backgroundColor: colors.surfaceElevated }]}>
              <Pressable
                testID="style-plotter-button"
                style={[
                  styles.styleOption,
                  drawingStyle === 'plotter' && [
                    styles.styleOptionActive,
                    { backgroundColor: colors.surface },
                  ],
                ]}
                onPress={() => onStyleChange('plotter')}
              >
                <Ionicons
                  name="create-outline"
                  size={18}
                  color={drawingStyle === 'plotter' ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.styleOptionText,
                    {
                      color: drawingStyle === 'plotter' ? colors.primary : colors.textSecondary,
                    },
                  ]}
                >
                  Plotter
                </Text>
              </Pressable>
              <Pressable
                testID="style-paint-button"
                style={[
                  styles.styleOption,
                  drawingStyle === 'paint' && [
                    styles.styleOptionActive,
                    { backgroundColor: colors.surface },
                  ],
                ]}
                onPress={() => onStyleChange('paint')}
              >
                <Ionicons
                  name="color-palette-outline"
                  size={18}
                  color={drawingStyle === 'paint' ? colors.primary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.styleOptionText,
                    {
                      color: drawingStyle === 'paint' ? colors.primary : colors.textSecondary,
                    },
                  ]}
                >
                  Paint
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Quick Ideas Grid - hidden when custom input is shown */}
        {!showCustomInput && (
          <View style={styles.ideasSection}>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Quick ideas</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ideasRow}
            >
              {QUICK_IDEAS.map((idea) => (
                <Pressable
                  key={idea.label}
                  style={({ pressed }) => [
                    styles.ideaChip,
                    { backgroundColor: colors.surfaceElevated },
                    pressed && { transform: [{ scale: 0.96 }], opacity: 0.8 },
                    !connected && styles.disabled,
                  ]}
                  onPress={() => handleQuickStart(idea.label.toLowerCase())}
                  disabled={!connected}
                >
                  <Ionicons
                    name={idea.icon}
                    size={18}
                    color={connected ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.ideaLabel,
                      { color: connected ? colors.textPrimary : colors.textMuted },
                    ]}
                  >
                    {idea.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Divider - hidden when custom input is shown */}
        {!showCustomInput && (
          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textMuted }]}>or</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>
        )}

        {/* Custom Input Section */}
        {showCustomInput ? (
          <View style={styles.customInputSection}>
            <Text style={[styles.inputTitle, { color: colors.textPrimary }]}>
              Describe your vision
            </Text>
            <View style={styles.inputWrapper}>
              <TextInput
                testID="start-panel-input"
                style={[
                  styles.textInput,
                  { backgroundColor: colors.surfaceElevated, color: colors.textPrimary },
                ]}
                value={customText}
                onChangeText={(t) => setCustomText(t.slice(0, MAX_LENGTH))}
                placeholder="Describe what you'd like to see..."
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={MAX_LENGTH}
                autoFocus
              />
              <Text
                style={[
                  styles.charCount,
                  { color: colors.textMuted },
                  remainingChars < 20 && { color: colors.warning },
                ]}
              >
                {remainingChars}
              </Text>
            </View>
            <View style={styles.customInputActions}>
              <Pressable
                style={[styles.cancelButton, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => {
                  setShowCustomInput(false);
                  setCustomText('');
                }}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textSecondary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                testID="start-panel-start-button"
                style={[
                  styles.startButton,
                  { backgroundColor: customText.trim() ? colors.primary : colors.surfaceElevated },
                ]}
                onPress={handleCustomStart}
                disabled={!customText.trim()}
              >
                <Ionicons
                  name="arrow-forward"
                  size={18}
                  color={customText.trim() ? colors.textOnPrimary : colors.textMuted}
                />
                <Text
                  style={[
                    styles.startButtonText,
                    { color: customText.trim() ? colors.textOnPrimary : colors.textMuted },
                  ]}
                >
                  Start
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.actionButtons}>
            <Pressable
              testID="describe-vision-button"
              style={({ pressed }) => [
                styles.customButton,
                { backgroundColor: colors.surfaceElevated },
                pressed && { transform: [{ scale: 0.98 }], opacity: 0.8 },
                !connected && styles.disabled,
              ]}
              onPress={() => setShowCustomInput(true)}
              disabled={!connected}
            >
              <Ionicons
                name="create-outline"
                size={20}
                color={connected ? colors.textSecondary : colors.textMuted}
              />
              <Text
                style={[
                  styles.customButtonText,
                  { color: connected ? colors.textSecondary : colors.textMuted },
                ]}
              >
                Describe your vision
              </Text>
            </Pressable>

            <Pressable
              testID="surprise-me-button"
              style={({ pressed }) => [
                styles.surpriseButton,
                { backgroundColor: colors.primary },
                pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
                !connected && { backgroundColor: colors.surfaceElevated },
              ]}
              onPress={handleSurpriseMe}
              disabled={!connected}
            >
              <Ionicons
                name="sparkles"
                size={20}
                color={connected ? colors.textOnPrimary : colors.textMuted}
              />
              <Text
                style={[
                  styles.surpriseButtonText,
                  { color: connected ? colors.textOnPrimary : colors.textMuted },
                ]}
              >
                Surprise Me
              </Text>
            </Pressable>
          </View>
        )}

        {/* Connection status hint */}
        {!connected && (
          <View style={styles.connectionHint}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.textMuted} />
            <Text style={[styles.connectionHintText, { color: colors.textMuted }]}>
              Connecting to server...
            </Text>
          </View>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    ...typography.heading,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    textAlign: 'center',
  },
  styleSection: {
    gap: spacing.sm,
  },
  styleToggle: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    padding: spacing.xs,
  },
  styleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
  },
  styleOptionActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  styleOptionText: {
    ...typography.body,
    fontWeight: '600',
  },
  ideasSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.small,
    fontWeight: '500',
    paddingLeft: spacing.xs,
  },
  ideasRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  ideaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
  },
  ideaLabel: {
    ...typography.body,
    fontWeight: '500',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    ...typography.small,
  },
  actionButtons: {
    gap: spacing.sm,
  },
  customButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  customButtonText: {
    ...typography.body,
    fontWeight: '500',
  },
  surpriseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  surpriseButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  customInputSection: {
    gap: spacing.md,
  },
  inputTitle: {
    ...typography.heading,
    fontSize: 18,
    textAlign: 'center',
  },
  inputWrapper: {
    position: 'relative',
  },
  textInput: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingBottom: spacing['2xl'],
    ...typography.body,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.md,
    ...typography.small,
  },
  customInputActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cancelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '500',
  },
  startButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  startButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  connectionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  connectionHintText: {
    ...typography.small,
  },
});
