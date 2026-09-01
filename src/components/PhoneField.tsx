import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

export function PhoneField({
  value,
  onChangeText,
  error,
  autoFocus,
}: {
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Mobile Number</Text>
      <View style={[styles.inputWrap, !!error && styles.inputError]}>
        <Text style={styles.cc}>+91</Text>
        <TextInput
          value={value}
          onChangeText={(v) => onChangeText(v.replace(/[^0-9]/g, '').slice(0, 10))}
          placeholder="98765 43210"
          placeholderTextColor={Colors.textDim}
          keyboardType="number-pad"
          maxLength={10}
          autoFocus={autoFocus}
          style={styles.input}
        />
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function validateMobile(v: string) {
  return /^\d{10}$/.test(v.trim());
}

const styles = StyleSheet.create({
  field: { gap: Spacing.sm },
  label: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  inputError: { borderColor: Colors.like },
  cc: {
    color: Colors.textDim,
    fontSize: 14,
    fontWeight: '700',
    marginRight: Spacing.sm,
    paddingRight: Spacing.sm,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  input: { flex: 1, color: Colors.text, fontSize: 14.5 },
  errorText: { color: Colors.like, fontSize: 11.5 },
});
