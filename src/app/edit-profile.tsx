import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateOfBirthField, toIsoDob } from '@/components/DateOfBirthField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

const GENDERS = ['Male', 'Female', 'Other'] as const;

function parseIsoDob(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const [, yyyy, mm, dd] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

export default function EditProfileScreen() {
  const { session, updateProfile } = useAuth();
  const [name, setName] = useState(session?.FULL_NAME || session?.USER_NAME || '');
  const [gender, setGender] = useState<string | undefined>(session?.GENDER ?? undefined);
  const [dob, setDob] = useState<Date | null>(parseIsoDob(session?.DATE_OF_BIRTH));
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSave = async () => {
    if (name.trim().length < 2) {
      setNameError('Please enter your name');
      return;
    }
    setNameError('');
    setFormError('');
    setLoading(true);
    try {
      await updateProfile({ fullName: name.trim(), dateOfBirth: toIsoDob(dob), gender });
      router.back();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>My Profile</Text>
        <View style={styles.back} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label}>Full Name</Text>
            <View style={[styles.inputWrap, !!nameError && styles.inputError]}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your Name"
                placeholderTextColor={Colors.textDim}
                style={styles.input}
              />
            </View>
            {!!nameError && <Text style={styles.errorText}>{nameError}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Gender</Text>
            <View style={styles.genderRow}>
              {GENDERS.map((g) => {
                const selected = gender === g;
                return (
                  <Pressable
                    key={g}
                    onPress={() => setGender(g)}
                    style={[styles.genderPill, selected && styles.genderPillSelected]}
                  >
                    <Text style={[styles.genderPillText, selected && styles.genderPillTextSelected]}>{g}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <DateOfBirthField value={dob} onChange={setDob} />

          <View style={styles.field}>
            <Text style={styles.label}>Mobile Number</Text>
            <View style={[styles.inputWrap, styles.readOnlyWrap]}>
              <Text style={styles.readOnlyText}>+91 {session?.PHONE_NUMBER ?? ''}</Text>
            </View>
          </View>

          {!!formError && <Text style={styles.errorText}>{formError}</Text>}

          <PrimaryButton title="Save Changes" onPress={onSave} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  scroll: { padding: Spacing.lg, gap: Spacing.lg },
  field: { gap: Spacing.sm },
  label: {
    color: Colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inputWrap: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: Spacing.md,
    height: 52,
    justifyContent: 'center',
  },
  inputError: { borderColor: Colors.like },
  input: { color: Colors.text, fontSize: FontSize.md },
  readOnlyWrap: { opacity: 0.6 },
  readOnlyText: { color: Colors.textDim, fontSize: FontSize.md },
  errorText: { color: Colors.like, fontSize: FontSize.xs },
  genderRow: { flexDirection: 'row', gap: Spacing.sm },
  genderPill: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  genderPillSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  genderPillText: { color: Colors.textDim, fontSize: FontSize.sm, fontWeight: '600' },
  genderPillTextSelected: { color: Colors.accentInk },
});
