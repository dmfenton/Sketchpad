/**
 * Gallery modal showing saved canvases as a grid of thumbnails.
 * Thumbnails are rendered server-side and loaded as images.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { SavedCanvas } from '@code-monet/shared';
import { getApiUrl } from '../config';
import { useAuth } from '../context';
import {
  spacing,
  borderRadius,
  typography,
  useTheme,
  type ColorScheme,
  type ShadowScheme,
} from '../theme';

interface GalleryModalProps {
  visible: boolean;
  canvases: SavedCanvas[];
  onClose: () => void;
  onSelect: (canvasId: string) => void;
}

// Grid configuration
const NUM_COLUMNS = 2;
const GRID_GAP = spacing.md;
const HORIZONTAL_PADDING = spacing.lg;

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

interface GalleryItemProps {
  canvas: SavedCanvas;
  thumbnailSize: number;
  thumbnailUrl: string;
  onPress: () => void;
  colors: ColorScheme;
  shadows: ShadowScheme;
}

function GalleryItem({
  canvas,
  thumbnailSize,
  thumbnailUrl,
  onPress,
  colors,
  shadows,
}: GalleryItemProps): React.JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const imageSize = thumbnailSize - spacing.sm * 2;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.item,
        { backgroundColor: colors.surface, width: thumbnailSize },
        shadows.sm,
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.thumbnailContainer,
          { width: imageSize, height: imageSize, backgroundColor: colors.canvasBackground },
        ]}
      >
        {loading && !error && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="small" color={colors.textMuted} />
          </View>
        )}
        {error ? (
          <View style={styles.errorOverlay}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          </View>
        ) : (
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ width: imageSize, height: imageSize }}
            resizeMode="contain"
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError(true);
            }}
          />
        )}
      </View>
      <View style={styles.itemInfo}>
        <Text style={[styles.itemTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          #{canvas.piece_number}
        </Text>
        <Text style={[styles.itemMeta, { color: colors.textMuted }]}>
          {formatDate(canvas.created_at)}
        </Text>
      </View>
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
  const { accessToken } = useAuth();

  // Calculate thumbnail size based on screen width
  const screenWidth = Dimensions.get('window').width;
  const availableWidth = screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1);
  const thumbnailSize = Math.floor(availableWidth / NUM_COLUMNS);

  // Reverse the order so newest is first
  const sortedCanvases = useMemo(() => [...canvases].reverse(), [canvases]);

  // Build thumbnail URL with auth token
  const getThumbnailUrl = useCallback(
    (pieceNumber: number) => {
      const baseUrl = getApiUrl();
      const url = `${baseUrl}/gallery/${pieceNumber}/thumbnail.png`;
      if (accessToken) {
        return `${url}?token=${encodeURIComponent(accessToken)}`;
      }
      return url;
    },
    [accessToken]
  );

  const renderItem = useCallback(
    ({ item }: { item: SavedCanvas }) => (
      <GalleryItem
        canvas={item}
        thumbnailSize={thumbnailSize}
        thumbnailUrl={getThumbnailUrl(item.piece_number)}
        onPress={() => onSelect(item.id)}
        colors={colors}
        shadows={shadows}
      />
    ),
    [thumbnailSize, getThumbnailUrl, onSelect, colors, shadows]
  );

  const keyExtractor = useCallback((item: SavedCanvas) => item.id, []);

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
            <Ionicons name="images-outline" size={64} color={colors.textMuted} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No saved artwork yet
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textMuted }]}>
              Tap &quot;New&quot; to save the current canvas and start fresh
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedCanvases}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.row}
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
  grid: {
    padding: HORIZONTAL_PADDING,
    paddingTop: spacing.lg,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  item: {
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    alignItems: 'center',
  },
  thumbnailContainer: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemInfo: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  itemTitle: {
    ...typography.caption,
    fontWeight: '600',
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
    marginTop: spacing.sm,
  },
  emptyHint: {
    ...typography.small,
    textAlign: 'center',
  },
});
