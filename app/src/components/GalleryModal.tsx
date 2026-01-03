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
import { spacing, borderRadius, typography, useTheme, type ColorScheme, type ShadowScheme } from '../theme';

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
  colors: ColorScheme;
  shadows: ShadowScheme;
}

function GalleryItem({ canvas, onPress, colors, shadows }: GalleryItemProps): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: colors.surface },
        shadows.sm,
        pressed && { backgroundColor: colors.surfaceElevated, transform: [{ scale: 0.98 }] },
      ]}
      onPress={onPress}
    >
      <View style={styles.itemHeader}>
        <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>Piece #{canvas.piece_number}</Text>
        <Text style={[styles.itemDate, { color: colors.textMuted }]}>{formatDate(canvas.created_at)}</Text>
      </View>
      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
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
  const { colors, shadows } = useTheme();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Gallery</Text>
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {canvases.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="images-outline" size={48} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No saved canvases yet</Text>
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
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
                colors={colors}
                shadows={shadows}
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.heading,
  },
  closeButton: {
    padding: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  item: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  itemTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  itemDate: {
    ...typography.small,
  },
  itemMeta: {
    ...typography.small,
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
  },
  emptyHint: {
    ...typography.small,
    textAlign: 'center',
  },
});
