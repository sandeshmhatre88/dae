import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

const logoSource = require('../../assets/images/logo.png');

export function Logo({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  // Matches mock's .auth-logo (27px) and .brand (21px) exactly.
  const fontSize = size === 'lg' ? 27 : 21;
  const markSize = size === 'lg' ? 32 : 24;
  return (
    <View style={styles.row}>
      <Image source={logoSource} style={{ width: markSize, height: markSize }} contentFit="contain" />
      <Text style={[styles.text, { fontSize }]}>
        DAE<Text style={styles.dot}>.</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { fontWeight: '800', color: Colors.text, letterSpacing: 0.5 },
  dot: { color: Colors.accent },
});
