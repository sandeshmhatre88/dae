import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { thumbnailUrl } from '@/lib/api/config';
import type { ContentItem } from '@/lib/api/types';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { guessFinishedFromPct, setLocalProgress } from '@/lib/watchProgressStore';

// Mock: .card{width:122px} .card.wide{width:200px} .card-art{height:168px}
// .card.wide .card-art{height:112px} - "wide" cards (Continue Watching) are a
// genuinely different landscape shape, not just a wider poster.
const CARD_WIDTH = 122;
const CARD_ART_HEIGHT = 168;
const WIDE_WIDTH = 200;
const WIDE_ART_HEIGHT = 112;

export function ContentCard({ item, wide, fill }: { item: ContentItem; wide?: boolean; fill?: boolean }) {
  const { session } = useAuth();
  const progress = item.LAST_WATCHED_PROGRESS;
  const artHeight = wide ? WIDE_ART_HEIGHT : CARD_ART_HEIGHT;

  const onPress = () => {
    // The single-item detail fetch (getContentDetail) can't tell the detail
    // screen where to resume from - it serves a static per-content cache,
    // not a per-user query (see backend/lambdas/CONTENT.py, the query that
    // would join WATCH_HISTORY is dead/commented out there). This card's own
    // LAST_WATCHED_PROGRESS came from LANDING_PAGE, which does compute it
    // per-user - seed local storage with it here, before navigating, so the
    // detail screen (which only trusts local storage) actually has
    // something to resume from.
    if (progress !== undefined && session) {
      setLocalProgress({
        CONTENT_ID: item.CONTENT_ID,
        USER_ID: session.USER_ID,
        PROGRESS: progress,
        FINISHED: guessFinishedFromPct(progress),
        TITLE: item.TITLE,
        THUMBNAIL_URL: item.THUMBNAIL_URL,
        DURATION: item.DURATION,
        CATEGORY_ID: item.CATEGORY_ID,
        UPDATED_AT: Date.now(),
      });
    }
    router.push({ pathname: '/content/[id]', params: { id: String(item.CONTENT_ID) } });
  };

  return (
    <Pressable onPress={onPress} style={[styles.card, fill ? styles.fill : { width: wide ? WIDE_WIDTH : CARD_WIDTH }]}>
      <View style={[styles.artWrap, fill ? { aspectRatio: CARD_WIDTH / CARD_ART_HEIGHT } : { height: artHeight }]}>
        <Image source={{ uri: thumbnailUrl(item.THUMBNAIL_URL) }} style={styles.art} contentFit="cover" />
        <View style={styles.playBadge}>
          <Ionicons name="play" size={11} color={Colors.text} />
        </View>
        {!!progress && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
        )}
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {item.TITLE}
      </Text>
      {(!!item.GENRE || !!item.DURATION) && (
        <Text style={styles.meta} numberOfLines={1}>
          {[item.GENRE, item.DURATION].filter(Boolean).join(' · ')}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {},
  fill: { flex: 1 },
  artWrap: {
    width: '100%',
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
  },
  art: { width: '100%', height: '100%' },
  playBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.pill,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: { height: '100%', backgroundColor: Colors.accent },
  title: { color: Colors.text, fontSize: 12.5, fontWeight: '700', marginTop: Spacing.xs, marginBottom: 2 },
  meta: { color: Colors.textDim, fontSize: 11 },
});
