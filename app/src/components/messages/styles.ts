/**
 * Shared styles for message components.
 */

import { StyleSheet } from 'react-native';
import { spacing, borderRadius, typography } from '../../theme';

export const messageStyles = StyleSheet.create({
  messageBubble: {
    borderRadius: borderRadius.md,
    padding: spacing.md,
    paddingVertical: spacing.lg,
    borderLeftWidth: 3,
  },
  messageText: {
    ...typography.body,
    lineHeight: 24,
  },
  timestamp: {
    ...typography.small,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  iterationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    opacity: 0.7,
  },
  iterationText: {
    ...typography.small,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorDetails: {
    ...typography.small,
    marginTop: spacing.sm,
    fontFamily: 'monospace',
  },
  codeOutput: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    maxHeight: 200,
  },
  codeScrollView: {
    maxHeight: 150,
  },
  codeOutputError: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  codeOutputText: {
    ...typography.small,
    fontFamily: 'monospace',
  },
  codePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  codePreviewLabel: {
    ...typography.small,
    fontWeight: '500',
  },
});
