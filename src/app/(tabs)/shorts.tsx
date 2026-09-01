import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VerticalVolumeBar } from '@/components/VerticalVolumeBar';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { videoUrl } from '@/lib/api/config';
import { getContentDetail, getLandingPage } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';
import { getVolumePref, setVolumePref, subscribeVolumePref } from '@/lib/volumeStore';
import type { ContentItem } from '@/lib/api/types';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ShortsScreen() {
  const { session } = useAuth();
  const userId = session!.USER_ID;

  // The catalog/landing-page rows never carry VIDEO_URL (by design - it's a
  // heavier field listing endpoints skip), so get the candidate IDs from the
  // feed first, then fetch each one's full detail for the actual video URL.
  const { data: rows, isLoading: loadingIds } = useQuery({
    queryKey: ['landing-page', userId, null],
    queryFn: () => getLandingPage({ userId }),
  });
  const candidateIds = rows
    ? [...new Set(Object.values(rows).flat().map((c) => c.CONTENT_ID))]
    : [];

  const detailQueries = useQueries({
    queries: candidateIds.map((id) => ({
      queryKey: ['content', id],
      queryFn: () => getContentDetail(id, userId),
    })),
  });

  const isLoading = loadingIds || detailQueries.some((q) => q.isLoading);
  const items = detailQueries
    .map((q) => q.data)
    .filter((item): item is ContentItem => !!item?.VIDEO_URL);

  const [activeId, setActiveId] = useState<number | null>(null);
  // Tabs stay mounted when you switch away (expo-router doesn't unmount
  // backgrounded tab screens by default), so "is the visible item playing"
  // alone isn't enough - without this, a short kept playing its audio in the
  // background after navigating to Home/Search/etc. Track real screen focus
  // and gate playback on both.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  // Same one shared volume/mute preference the main player uses (see
  // src/lib/volumeStore.ts) - read synchronously so it's correct from the
  // first frame, and subscribed so a change made on the player screen is
  // reflected here too if this screen is still mounted underneath.
  const initialPref = getVolumePref();
  const [muted, setMuted] = useState(initialPref.muted);
  const [volume, setVolume] = useState(initialPref.volume);

  useEffect(() => {
    return subscribeVolumePref((pref) => {
      setVolume(pref.volume);
      setMuted(pref.muted);
    });
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.item) setActiveId((first.item as ContentItem).CONTENT_ID);
  }, []);

  // The volume bar sits on top of a paging vertical FlatList, so a drag on
  // it was being read as a page-swipe to the next short. Disable the list's
  // own scroll for the duration of a touch on the volume bar.
  const [volumeDragging, setVolumeDragging] = useState(false);
  const onVolumeDragStart = useCallback(() => setVolumeDragging(true), []);
  const onVolumeDragEnd = useCallback(() => setVolumeDragging(false), []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyText}>No shorts available yet.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <View style={styles.topbar} pointerEvents="none">
        <Text style={styles.topbarTab}>Following</Text>
        <Text style={[styles.topbarTab, styles.topbarTabActive]}>Shorts</Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.CONTENT_ID)}
        pagingEnabled
        scrollEnabled={!volumeDragging}
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
        renderItem={({ item }) => (
          <ShortItem
            item={item}
            isActive={focused && item.CONTENT_ID === activeId}
            muted={muted}
            volume={volume}
            onToggleMute={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              setVolumePref(volume, nextMuted);
            }}
            onVolumeChange={(next) => {
              const clamped = Math.min(1, Math.max(0, next));
              const nextMuted = clamped === 0 ? muted : false;
              setVolume(clamped);
              setMuted(nextMuted);
              setVolumePref(clamped, nextMuted);
            }}
            onVolumeDragStart={onVolumeDragStart}
            onVolumeDragEnd={onVolumeDragEnd}
          />
        )}
      />
    </View>
  );
}

function ShortItem({
  item,
  isActive,
  muted,
  volume,
  onToggleMute,
  onVolumeChange,
  onVolumeDragStart,
  onVolumeDragEnd,
}: {
  item: ContentItem;
  isActive: boolean;
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (next: number) => void;
  onVolumeDragStart: () => void;
  onVolumeDragEnd: () => void;
}) {
  const [liked, setLiked] = useState(false);
  const player = useVideoPlayer(videoUrl(item.VIDEO_URL) ?? null, (p) => {
    p.loop = true;
    p.muted = muted;
    p.volume = volume;
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- see content/[id].tsx
    player.muted = muted;
    player.volume = volume;
  }, [player, muted, volume]);

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [isActive, player]);

  return (
    <View style={styles.item}>
      <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} contentFit="cover" />
      <View style={styles.scrim} />

      {status === 'loading' && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Couldn&apos;t play this video</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {item.TITLE}
        </Text>
        {!!item.DESCRIPTION && (
          <Text style={styles.itemDesc} numberOfLines={2}>
            {item.DESCRIPTION}
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={() => setLiked((v) => !v)} style={styles.actionBtn}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? Colors.like : Colors.text} />
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="chatbubble-outline" size={26} color={Colors.text} />
        </Pressable>
        <Pressable style={styles.actionBtn}>
          <Ionicons name="share-social-outline" size={26} color={Colors.text} />
        </Pressable>
      </View>

      <View style={styles.volumeBar}>
        <VerticalVolumeBar
          volume={volume}
          muted={muted}
          onChange={onVolumeChange}
          onToggleMute={onToggleMute}
          onDragStart={onVolumeDragStart}
          onDragEnd={onVolumeDragEnd}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textDim, fontSize: FontSize.sm },
  item: { height: SCREEN_HEIGHT, backgroundColor: '#000', justifyContent: 'flex-end' },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  topbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
    paddingTop: 18,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 22,
  },
  topbarTab: { fontWeight: '700', fontSize: FontSize.md, color: 'rgba(255,255,255,0.5)' },
  topbarTabActive: { color: '#fff', borderBottomWidth: 2, borderBottomColor: Colors.accent, paddingBottom: 8 },
  info: { paddingHorizontal: Spacing.lg, paddingBottom: 116, paddingRight: 84 },
  itemTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  itemDesc: { color: Colors.text, fontSize: FontSize.sm, marginTop: Spacing.xs, opacity: 0.9 },
  actions: { position: 'absolute', right: Spacing.md, bottom: 116, gap: Spacing.lg, alignItems: 'center' },
  actionBtn: { alignItems: 'center' },
  // Left edge, vertically centered - matches where the phone's physical
  // volume rocker actually is, so the on-screen control sits under the same
  // thumb reach.
  volumeBar: {
    position: 'absolute',
    top: '50%',
    left: Spacing.lg,
    transform: [{ translateY: -81 }], // half of VerticalVolumeBar's own rendered height
  },
});
