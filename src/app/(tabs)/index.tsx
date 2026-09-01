import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '@/components/AdBanner';
import { ContentRow } from '@/components/ContentRow';
import { Logo } from '@/components/Logo';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { bannerUrl, thumbnailUrl } from '@/lib/api/config';
import { getAdvertisements, getCategories, getLandingPage } from '@/lib/api/endpoints';
import type { ContentItem, LandingPageRows } from '@/lib/api/types';
import { prefetchHomeData } from '@/lib/prefetchHome';
import {
  getAllLocalProgress,
  guessFinishedFromPct,
  isContinueWatching,
  isWatchAgain,
  setLocalProgress,
  toContentItem,
} from '@/lib/watchProgressStore';

const ROW_ORDER = ['Continue Watching', 'Newly Added', 'Watch Again'];

// This device's own local progress wins over whatever the server's cache
// currently says for the same title (it updates the moment a video is
// paused/closed, the server-driven row only catches up on the next cache
// refresh) - server rows fill in anything local storage doesn't have yet.
function mergeLocalFirst(local: ContentItem[], serverRow?: ContentItem[]): ContentItem[] {
  if (!serverRow?.length) return local;
  const seen = new Set(local.map((i) => i.CONTENT_ID));
  return [...local, ...serverRow.filter((i) => !seen.has(i.CONTENT_ID))];
}

export default function HomeScreen() {
  const { session } = useAuth();
  const userId = session!.USER_ID;
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });
  const { data: ads } = useQuery({ queryKey: ['advertisements'], queryFn: getAdvertisements });

  const { data: rows, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['landing-page', userId, categoryId],
    queryFn: () => getLandingPage({ userId, categoryId: categoryId ?? undefined }),
  });

  // Refresh Home's data only while it's NOT the focused screen (this
  // cleanup fires on blur - opening a video, switching tabs) so it's
  // already fresh by the time the user comes back, instead of visibly
  // swapping content right as Home reappears or mid-scroll.
  useFocusEffect(
    useCallback(() => {
      return () => prefetchHomeData(queryClient, userId, categoryId);
    }, [queryClient, userId, categoryId])
  );

  // Local watch-progress snapshot, re-read every time Home gains focus (e.g.
  // coming straight back from a video) - the store itself is already loaded
  // in memory (see watchProgressStore's module-level init), so this is a
  // synchronous, instant read, not a fetch.
  const [localProgressSnapshot, setLocalProgressSnapshot] = useState(getAllLocalProgress);
  useFocusEffect(
    useCallback(() => {
      setLocalProgressSnapshot(getAllLocalProgress());
    }, [])
  );
  const myLocalEntries = Object.values(localProgressSnapshot).filter((e) => e.USER_ID === userId);
  const continueWatchingLocal = myLocalEntries
    .filter(isContinueWatching)
    .sort((a, b) => b.UPDATED_AT - a.UPDATED_AT)
    .map(toContentItem);
  const watchAgainLocal = myLocalEntries
    .filter(isWatchAgain)
    .sort((a, b) => b.UPDATED_AT - a.UPDATED_AT)
    .map(toContentItem);
  const mergedRows: LandingPageRows | undefined = rows && {
    ...rows,
    'Continue Watching': mergeLocalFirst(continueWatchingLocal, rows['Continue Watching']),
    'Watch Again': mergeLocalFirst(watchAgainLocal, rows['Watch Again']),
  };

  const entries = mergedRows ? Object.entries(mergedRows) : [];
  const ordered = [
    ...ROW_ORDER.filter((k) => mergedRows?.[k]?.length).map((k) => [k, mergedRows![k]] as const),
    ...entries.filter(([k]) => !ROW_ORDER.includes(k)),
  ];
  const hero = ordered[0]?.[1]?.[0];
  const ad = ads?.[0];

  // Same reasoning as ContentCard's onPress - the hero can itself be a
  // Continue Watching title (it's ordered[0], and that row comes first),
  // but this Pressable doesn't go through ContentCard, so it needs its own
  // copy of the seed-before-navigate step. useCallback (rather than a plain
  // function) since it calls Date.now() - the lint rule that flags impure
  // calls "during render" doesn't know this only ever runs from onPress.
  const onOpenHero = useCallback(() => {
    if (!hero) return;
    if (hero.LAST_WATCHED_PROGRESS !== undefined) {
      setLocalProgress({
        CONTENT_ID: hero.CONTENT_ID,
        USER_ID: userId,
        PROGRESS: hero.LAST_WATCHED_PROGRESS,
        FINISHED: guessFinishedFromPct(hero.LAST_WATCHED_PROGRESS),
        TITLE: hero.TITLE,
        THUMBNAIL_URL: hero.THUMBNAIL_URL,
        DURATION: hero.DURATION,
        CATEGORY_ID: hero.CATEGORY_ID,
        UPDATED_AT: Date.now(),
      });
    }
    router.push({ pathname: '/content/[id]', params: { id: String(hero.CONTENT_ID) } });
  }, [hero, userId]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Logo size="sm" />
        <View style={styles.headerIcons}>
          <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.iconBtn}>
            <Ionicons name="search" size={22} color={Colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.iconBtn}>
            <Ionicons name="person-circle-outline" size={24} color={Colors.text} />
          </Pressable>
        </View>
      </View>

      {!!categories?.length && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
          <Pressable onPress={() => setCategoryId(null)} style={[styles.chip, categoryId === null && styles.chipActive]}>
            <Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>All</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c.CATEGORY_ID}
              onPress={() => setCategoryId(c.CATEGORY_ID)}
              style={[styles.chip, categoryId === c.CATEGORY_ID && styles.chipActive]}
            >
              <Text style={[styles.chipText, categoryId === c.CATEGORY_ID && styles.chipTextActive]}>
                {c.CATEGORY_NAME}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error instanceof Error ? error.message : 'Could not load your home feed.'}</Text>
          <Pressable onPress={() => refetch()}>
            <Text style={styles.retry}>Tap to retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.accent} />}
        >
          {hero && (
            <Pressable onPress={onOpenHero} style={styles.hero}>
              <Image
                source={{ uri: bannerUrl(hero.BANNER_URL) ?? thumbnailUrl(hero.THUMBNAIL_URL) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              <LinearGradient
                colors={['transparent', 'rgba(25,27,33,0.6)', Colors.bg]}
                locations={[0.35, 0.75, 1]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.heroInfo}>
                <Text style={styles.heroBadge}>Featured</Text>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {hero.TITLE}
                </Text>
                {(!!hero.GENRE || !!hero.DURATION) && (
                  <Text style={styles.heroMeta}>{[hero.GENRE, hero.DURATION].filter(Boolean).join(' · ')}</Text>
                )}
                <View style={styles.heroActions}>
                  <View style={styles.playBtn}>
                    <Ionicons name="play" size={16} color={Colors.accentInk} />
                    <Text style={styles.playText}>Play</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          )}

          {ordered.length === 0 && (
            <View style={styles.center}>
              <Ionicons name="sparkles-outline" size={32} color={Colors.accent} />
              <Text style={styles.emptyTitle}>We're making nice content for you</Text>
              <Text style={styles.emptyText}>Stay tuned!</Text>
            </View>
          )}

          {ordered.map(([label, items], index) => (
            <View key={label}>
              <ContentRow title={label} items={items} wide={label === 'Continue Watching'} />
              {index === 0 && ad && <AdBanner ad={ad} />}
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  headerIcons: { flexDirection: 'row', gap: Spacing.md },
  iconBtn: { padding: Spacing.xs },
  chipScroll: { flexGrow: 0 },
  chipRow: { paddingHorizontal: Spacing.lg, gap: Spacing.sm, paddingBottom: Spacing.xs },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.accent },
  chipText: { color: Colors.textDim, fontSize: FontSize.sm, fontWeight: '600' },
  chipTextActive: { color: Colors.accentInk },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingTop: 80 },
  errorText: { color: Colors.textDim, fontSize: FontSize.sm },
  retry: { color: Colors.accent, fontWeight: '700', fontSize: FontSize.sm },
  emptyTitle: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700', textAlign: 'center', marginTop: Spacing.xs },
  emptyText: { color: Colors.textDim, fontSize: FontSize.sm },
  scrollContent: { paddingBottom: 110 },
  hero: {
    height: 400,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  heroInfo: { position: 'absolute', left: Spacing.lg, right: Spacing.lg, bottom: Spacing.lg },
  heroBadge: {
    color: Colors.accent,
    backgroundColor: 'rgba(45,212,191,0.16)',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    fontSize: 10.5,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.xs,
    overflow: 'hidden',
  },
  heroTitle: { color: Colors.text, fontSize: FontSize.xxl, fontWeight: '800' },
  heroMeta: { color: Colors.textDim, fontSize: FontSize.sm, marginTop: 2 },
  heroActions: { flexDirection: 'row', marginTop: Spacing.md },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  playText: { color: Colors.accentInk, fontWeight: '700' },
});
