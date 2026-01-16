/**
 * Bottom sheet modal for entering nudge text.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { spacing, borderRadius, typography, useTheme } from '../theme';

interface NudgeModalProps {
  visible: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
}

const QUICK_SUGGESTIONS = [
  'Add some curves',
  'Try something bold',
  'More detail please',
  'Experiment freely',
];

const MAX_LENGTH = 200;

export function NudgeModal({ visible, onClose, onSend }: NudgeModalProps): React.JSX.Element {
  const { colors, shadows } = useTheme();
  const [text, setText] = useState('');

  const handleSend = () => {
    if (text.trim()) {
      onSend(text.trim());
      setText('');
      onClose();
    }
  };

  const handleCancel = () => {
    setText('');
    onClose();
  };

  const handleSuggestion = (suggestion: string) => {
    setText(suggestion);
  };

  const remainingChars = MAX_LENGTH - text.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={handleCancel} />

        <View style={[styles.sheet, { backgroundColor: colors.surface }, shadows.lg]}>
          {/* Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Send a Nudge</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Suggest something to the agent
              </Text>
            </View>
            <Pressable
              testID="nudge-close-button"
              style={styles.closeButton}
              onPress={handleCancel}
            >
              <Ionicons name="close" size={24} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Quick suggestions */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.suggestionsContainer}
            contentContainerStyle={styles.suggestionsContent}
          >
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <Pressable
                key={suggestion}
                style={[styles.suggestionChip, { backgroundColor: colors.surfaceElevated }]}
                onPress={() => handleSuggestion(suggestion)}
              >
                <Text style={[styles.suggestionText, { color: colors.textSecondary }]}>
                  {suggestion}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.surfaceElevated, color: colors.textPrimary },
              ]}
              value={text}
              onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
              placeholder="Type your suggestion..."
              placeholderTextColor={colors.textMuted}
              multiline
              autoFocus
              maxLength={MAX_LENGTH}
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

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.sendButton,
                { backgroundColor: text.trim() ? colors.primary : colors.surfaceElevated },
                pressed && text.trim() && styles.sendButtonPressed,
              ]}
              onPress={handleSend}
              disabled={!text.trim()}
            >
              <Ionicons
                name="send"
                size={18}
                color={text.trim() ? colors.textOnPrimary : colors.textMuted}
              />
              <Text
                style={[
                  styles.sendButtonText,
                  { color: text.trim() ? colors.textOnPrimary : colors.textMuted },
                ]}
              >
                Send Nudge
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing['2xl'],
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.heading,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
  },
  closeButton: {
    padding: spacing.xs,
  },
  suggestionsContainer: {
    marginBottom: spacing.lg,
  },
  suggestionsContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  suggestionChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  suggestionText: {
    ...typography.caption,
  },
  inputContainer: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    position: 'relative',
  },
  input: {
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    paddingBottom: spacing['2xl'],
    ...typography.body,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: spacing.md,
    right: spacing.md,
    ...typography.small,
  },
  actions: {
    paddingHorizontal: spacing.xl,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.lg,
    gap: spacing.sm,
  },
  sendButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  sendButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
});
