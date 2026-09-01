import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentCard } from '@/components/ContentCard';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { getCategories, getLandingPage } from '@/lib/api/endpoints';
import type { ContentItem } from '@/lib/api/types';

export default function SearchScreen() {
  const { session } = useAuth();
  const userId = session!.USER_ID;

  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQuery(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  // Same category list Home filters by, so browsing feels like one consistent
  // catalog rather than two different sets of "categories".
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories });

  const { data: searchRows, isLoading: isSearching } = useQuery({
    queryKey: ['search', userId, query],
    queryFn: () => getLandingPage({ userId, search: query }),
    enabled: query.length > 0,
  });

  const { data: browseRows, isLoading: isBrowsing } = useQuery({
    queryKey: ['landing-page', userId, categoryId],
    queryFn: () => getLandingPage({ userId, categoryId: categoryId ?? undefined }),
    enabled: query.length === 0,
  });

  const searchResults: ContentItem[] = searchRows ? Object.values(searchRows).flat() : [];
  const browseResults: ContentItem[] = browseRows ? Object.values(browseRows).flat() : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textDim} />
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Search movies, shows, short films"
            placeholderTextColor={Colors.textDim}
            style={styles.input}
          />
        </View>
      </View>

      {query.length === 0 ? (
        isBrowsing ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        ) : (
          <FlatList
            data={browseResults}
            numColumns={3}
            keyExtractor={(item) => String(item.CONTENT_ID)}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridRow}
            ListHeaderComponent={
              !!categories?.length ? (
                <View style={styles.chipsWrap}>
                  <Text style={styles.sectionLabel}>Categories</Text>
                  <View style={styles.chipRow}>
                    <Pressable onPress={() => setCategoryId(null)}>
                      <Text style={[styles.chip, categoryId === null && styles.chipActive]}>All</Text>
                    </Pressable>
                    {categories.map((c) => (
                      <Pressable key={c.CATEGORY_ID} onPress={() => setCategoryId(c.CATEGORY_ID)}>
                        <Text style={[styles.chip, categoryId === c.CATEGORY_ID && styles.chipActive]}>
                          {c.CATEGORY_NAME}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>Browse All</Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => <ContentCard item={item} fill />}
          />
        )
      ) : isSearching ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          data={searchResults}
          numColumns={3}
          keyExtractor={(item) => String(item.CONTENT_ID)}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.gridRow}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.sectionLabel}>No results for &quot;{query}&quot;</Text>
            </View>
          }
          renderItem={({ item }) => <ContentCard item={item} fill />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  input: { flex: 1, color: Colors.text, fontSize: FontSize.sm },
  chipsWrap: { marginBottom: Spacing.sm },
  sectionLabel: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    color: Colors.textDim,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    fontSize: 12.5,
    fontWeight: '600',
    overflow: 'hidden',
  },
  chipActive: { backgroundColor: Colors.accent, color: Colors.accentInk },
  center: { alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  grid: { paddingHorizontal: Spacing.lg, gap: 10, paddingBottom: 110 },
  gridRow: { gap: 10, marginBottom: 10 },
});
