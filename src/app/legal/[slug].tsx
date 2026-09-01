import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { LEGAL_URLS } from '@/constants/legal';
import { Colors, FontSize, Spacing } from '@/constants/theme';

const PAGES = {
  privacy: { title: 'Privacy Policy', url: LEGAL_URLS.privacyPolicy },
  terms: { title: 'Terms of Service', url: LEGAL_URLS.termsOfService },
  disclaimer: { title: 'Disclaimer', url: LEGAL_URLS.disclaimer },
} as const;

export type LegalSlug = keyof typeof PAGES;

export default function LegalScreen() {
  const { slug } = useLocalSearchParams<{ slug: LegalSlug }>();
  const page = PAGES[slug as LegalSlug];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {page?.title ?? ''}
        </Text>
        <View style={styles.back} />
      </View>

      {page ? (
        <WebView
          source={{ uri: page.url }}
          style={styles.web}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={Colors.accent} />
            </View>
          )}
        />
      ) : null}
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', color: Colors.text, fontSize: FontSize.md, fontWeight: '700' },
  web: { flex: 1, backgroundColor: Colors.bg },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },
});
