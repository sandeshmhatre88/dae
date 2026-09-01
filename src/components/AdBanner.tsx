import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Advertisement } from '@/lib/api/types';

export function AdBanner({ ad }: { ad: Advertisement }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <View style={styles.card}>
      <Image source={{ uri: ad.IMG_URL }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.tag}>
        <Text style={styles.tagText}>Sponsored</Text>
      </View>
      <Pressable onPress={() => setDismissed(true)} style={styles.close} hitSlop={8}>
        <Ionicons name="close" size={16} color={Colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: 120,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
    marginHorizontal: 18,
    marginTop: 4,
    marginBottom: 26,
  },
  tag: {
    position: 'absolute',
    left: Spacing.sm,
    bottom: Spacing.sm,
    backgroundColor: Colors.overlay,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  tagText: { color: Colors.text, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.pill,
  },
});
