import { useQueries, useQuery } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentCard } from '@/components/ContentCard';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { getContentDetail, getFavorites } from '@/lib/api/endpoints';
import { useAuth } from '@/lib/auth/AuthContext';

export default function MyListScreen() {
  const { session } = useAuth();
  const userId = session!.USER_ID;

  const { data: favorites, isLoading: loadingFavorites } = useQuery({
    queryKey: ['favorites', userId],
    queryFn: () => getFavorites(userId),
  });

  const detailQueries = useQueries({
    queries: (favorites ?? []).map((f) => ({
      queryKey: ['content', f.CONTENT_ID],
      queryFn: () => getContentDetail(f.CONTENT_ID, userId),
    })),
  });

  const isLoading = loadingFavorites || detailQueries.some((q) => q.isLoading);
  const items = detailQueries.map((q) => q.data).filter((item) => !!item);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My List</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={3}
          keyExtractor={(item) => String(item.CONTENT_ID)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => <ContentCard item={item} fill />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>Nothing saved yet.</Text>
              <Text style={styles.emptySub}>Tap the bookmark icon on any title to add it here.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  title: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '800' },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.xs },
  emptyText: { color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  emptySub: { color: Colors.textDim, fontSize: FontSize.sm },
  grid: { paddingHorizontal: Spacing.lg, gap: 8, paddingBottom: 110 },
  gridRow: { gap: 8, marginBottom: 8 },
});
