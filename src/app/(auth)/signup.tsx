import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateOfBirthField, toIsoDob } from '@/components/DateOfBirthField';
import { Logo } from '@/components/Logo';
import { PhoneField, validateMobile } from '@/components/PhoneField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TermsNotice } from '@/components/TermsNotice';
import { Colors, FontSize, Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

export default function SignupScreen() {
  const { mobile: initialMobile } = useLocalSearchParams<{ mobile?: string }>();
  const { signup, sendOtp } = useAuth();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState(initialMobile ?? '');
  const [dob, setDob] = useState<Date | null>(null);
  const [nameError, setNameError] = useState('');
  const [mobileError, setMobileError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const onCreate = async () => {
    let ok = true;
    if (name.trim().length < 2) {
      setNameError('Please enter your name');
      ok = false;
    } else setNameError('');

    if (!validateMobile(mobile)) {
      setMobileError('Enter a valid 10-digit mobile number');
      ok = false;
    } else setMobileError('');

    if (!ok) return;
    setFormError('');
    setLoading(true);
    try {
      await signup({ fullName: name.trim(), phoneNumber: mobile, dateOfBirth: toIsoDob(dob) });
      const challenge = await sendOtp(mobile);
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { userId: challenge.USER_ID, session: challenge.SESSION, debug: challenge.SMS_DEBUG ?? '' },
      });
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Logo />
            <Text style={styles.tagline}>Movies, shows & short films. All in one place.</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.heading}>Create your account</Text>
            <Text style={styles.sub}>A few details to get you started - we&apos;ll text you a code to verify</Text>

            <View style={styles.form}>
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

              <PhoneField value={mobile} onChangeText={setMobile} error={mobileError} />

              <DateOfBirthField value={dob} onChange={setDob} />

              {!!formError && <Text style={styles.errorText}>{formError}</Text>}

              <PrimaryButton title="Create Account" onPress={onCreate} loading={loading} />

              <Link href="/(auth)/login" replace asChild>
                <Pressable style={styles.switchRow} hitSlop={12}>
                  <Text style={styles.switchText}>Already have an account? </Text>
                  <Text style={styles.switchLink}>Log in</Text>
                </Pressable>
              </Link>
            </View>
          </View>

          <TermsNotice />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { flexGrow: 1 },
  top: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 26, paddingBottom: 10 },
  tagline: { color: Colors.textDim, marginTop: Spacing.sm, fontSize: FontSize.sm, textAlign: 'center' },
  body: { paddingHorizontal: 26 },
  heading: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '800', marginBottom: Spacing.xs },
  sub: { color: Colors.textDim, fontSize: FontSize.sm, marginBottom: Spacing.xl },
  form: { gap: Spacing.lg },
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
  errorText: { color: Colors.like, fontSize: FontSize.xs },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm, paddingVertical: Spacing.sm },
  switchText: { color: Colors.textDim, fontSize: FontSize.sm },
  switchLink: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
});
