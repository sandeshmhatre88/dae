import { FlatList, StyleSheet, Text, View } from 'react-native';

import { ContentCard } from '@/components/ContentCard';
import { Colors, Spacing } from '@/constants/theme';
import type { ContentItem } from '@/lib/api/types';

export function ContentRow({ title, items, wide }: { title: string; items: ContentItem[]; wide?: boolean }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => String(item.CONTENT_ID)}
        renderItem={({ item }) => <ContentCard item={item} wide={wide} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.track}
        // Rows can run to dozens of items (catalog-sized categories) - windowing
        // avoids mounting every off-screen thumbnail up front like the old
        // ScrollView+map did.
        initialNumToRender={6}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  head: { paddingHorizontal: Spacing.lg, marginBottom: 10 },
  title: { color: Colors.text, fontSize: 15.5, fontWeight: '700' },
  track: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
});
