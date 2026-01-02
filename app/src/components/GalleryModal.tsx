/**
 * Gallery modal showing saved canvases.
 */

import React from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SavedCanvas } from '../types';
import { colors, spacing, borderRadius, typography, shadows } from '../theme';

interface GalleryModalProps {
  visible: boolean;
  canvases: SavedCanvas[];
  onClose: () => void;
  onSelect: (canvasId: string) => void;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface GalleryItemProps {
  canvas: SavedCanvas;
  onPress: () => void;
}

function GalleryItem({ canvas, onPress }: GalleryItemProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.item,
        pressed && styles.itemPressed,
      ]}
      onPress={onPress}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle}>Piece #{canvas.piece_number}</Text>
        <Text style={styles.itemDate}>{formatDate(canvas.created_at)}</Text>
      </View>
      <Text style={styles.itemMeta}>
        {canvas.stroke_count} strokes
      </Text>
    </Pressable>
  );
}

export function GalleryModal({
  visible,
  canvases,
  onClose,
  onSelect,
}: GalleryModalProps): React.JSX.Element {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Gallery</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {canvases.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No saved canvases yet</Text>
            <Text style={styles.emptyHint}>
              Tap &quot;New&quot; to save the current canvas and start fresh
            </Text>
          </View>
        ) : (
          <FlatList
            data={[...canvases].reverse()}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <GalleryItem
                canvas={item}
                onPress={() => onSelect(item.id)}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  item: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  itemPressed: {
    backgroundColor: colors.surfaceElevated,
    transform: [{ scale: 0.98 }],
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  itemTitle: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  itemDate: {
    ...typography.small,
    color: colors.textMuted,
  },
  itemMeta: {
    ...typography.small,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  emptyHint: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
