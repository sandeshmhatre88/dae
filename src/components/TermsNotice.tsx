import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Colors, FontSize, Spacing } from '@/constants/theme';

export function TermsNotice() {
  return (
    <Text style={styles.terms}>
      By continuing, you agree to our{' '}
      <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
        Terms of Service
      </Text>{' '}
      and{' '}
      <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

const styles = StyleSheet.create({
  terms: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    textAlign: 'center',
    paddingHorizontal: 26,
    marginTop: Spacing.xxl,
    marginBottom: Spacing.lg,
  },
  link: { color: Colors.textDim, fontWeight: '700', textDecorationLine: 'underline' },
});
