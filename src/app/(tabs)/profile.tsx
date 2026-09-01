import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { LegalSlug } from '@/app/legal/[slug]';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

const ROWS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'person-outline', label: 'My Profile' },
  { icon: 'bookmark-outline', label: 'My List' },
  { icon: 'notifications-outline', label: 'Notifications' },
];

// Temporarily hidden from the menu - flip back to true to restore it.
const SHOW_DELETE_ACCOUNT = false;

const LEGAL_LINKS: { icon: keyof typeof Ionicons.glyphMap; label: string; slug: LegalSlug }[] = [
  { icon: 'shield-checkmark-outline', label: 'Privacy Policy', slug: 'privacy' },
  { icon: 'document-text-outline', label: 'Terms of Service', slug: 'terms' },
  { icon: 'alert-circle-outline', label: 'Disclaimer', slug: 'disclaimer' },
];

export default function ProfileScreen() {
  const { session, logout, deleteAccount } = useAuth();
  const displayName = session?.USER_NAME || session?.FULL_NAME || `+91 ${session?.PHONE_NUMBER ?? ''}`;
  const initial = (displayName || 'U').trim().charAt(0).toUpperCase();

  const onLogout = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and personal data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAccount();
              router.replace('/(auth)/login');
            } catch (e) {
              Alert.alert('Could not delete account', e instanceof ApiError ? e.message : 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <LinearGradient colors={[Colors.accent, Colors.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </LinearGradient>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.plan}>{session?.PLAN ?? 'No active plan'}</Text>
        </View>

        <View style={styles.list}>
          {ROWS.map((r) => (
            <Row
              key={r.label}
              icon={r.icon}
              label={r.label}
              onPress={() => {
                if (r.label === 'My List') router.push('/(tabs)/my-list');
                else if (r.label === 'My Profile') router.push('/edit-profile');
              }}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.list}>
          {LEGAL_LINKS.map((r) => (
            <Row
              key={r.label}
              icon={r.icon}
              label={r.label}
              onPress={() => router.push(`/legal/${r.slug}`)}
            />
          ))}
          <Row icon="log-out-outline" label="Log Out" onPress={onLogout} destructive last={!SHOW_DELETE_ACCOUNT} />
          {SHOW_DELETE_ACCOUNT && (
            <Row icon="trash-outline" label="Delete Account" onPress={onDeleteAccount} destructive last />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.row, !last && styles.rowDivider]}>
      <Ionicons name={icon} size={19} color={destructive ? Colors.like : Colors.textDim} />
      <Text style={[styles.rowLabel, destructive && { color: Colors.like }]}>{label}</Text>
      {!destructive && <Ionicons name="chevron-forward" size={15} color={Colors.textDim} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scrollContent: { paddingBottom: 110 },
  header: { alignItems: 'center', paddingTop: 34, paddingHorizontal: 20, paddingBottom: 20 },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { color: '#101318', fontSize: 26, fontWeight: '800' },
  name: { color: Colors.text, fontSize: FontSize.lg, fontWeight: '700' },
  plan: { color: Colors.textDim, fontSize: 12, marginTop: 3 },
  sectionLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.lg + Spacing.xs,
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xs,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { flex: 1, color: Colors.text, fontSize: FontSize.md, fontWeight: '600' },
});
