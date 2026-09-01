import { Link, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { PhoneField, validateMobile } from '@/components/PhoneField';
import { PrimaryButton } from '@/components/PrimaryButton';
import { TermsNotice } from '@/components/TermsNotice';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';

// Exact SMS_DEBUG string CREATE_AUTH_CHALLENGE.py sends when Cognito found no
// phone_number on userAttributes - the only way to tell "not registered" apart
// from a real send failure, since PreventUserExistenceErrors otherwise makes
// this login attempt look identical to a normal one. See
// backend/lambdas/CREATE_AUTH_CHALLENGE.py.
const NOT_REGISTERED_DEBUG = 'no phone_number on userAttributes - nothing sent';

export default function LoginScreen() {
  const { sendOtp } = useAuth();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notRegistered, setNotRegistered] = useState(false);

  const onContinue = async () => {
    if (!validateMobile(mobile)) {
      setError('Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setNotRegistered(false);
    setLoading(true);
    try {
      const challenge = await sendOtp(mobile);
      if (challenge.SMS_DEBUG === NOT_REGISTERED_DEBUG) {
        setNotRegistered(true);
        return;
      }
      router.push({
        pathname: '/(auth)/verify-otp',
        params: { userId: challenge.USER_ID, session: challenge.SESSION, debug: challenge.SMS_DEBUG ?? '' },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
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
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.sub}>Log in with your mobile number - we&apos;ll text you a code</Text>

            <View style={styles.form}>
              <PhoneField value={mobile} onChangeText={setMobile} error={error} autoFocus />
              <PrimaryButton title="Send OTP" onPress={onContinue} loading={loading} />

              {notRegistered && (
                <View style={styles.noticeBox}>
                  <Text style={styles.noticeText}>This number isn&apos;t registered yet.</Text>
                  <Pressable
                    onPress={() => router.push({ pathname: '/(auth)/signup', params: { mobile } })}
                    hitSlop={8}
                  >
                    <Text style={styles.noticeLink}>Register Now</Text>
                  </Pressable>
                </View>
              )}

              <Link href="/(auth)/signup" replace asChild>
                <Pressable style={styles.switchRow} hitSlop={12}>
                  <Text style={styles.switchText}>New to DAE? </Text>
                  <Text style={styles.switchLink}>Create account</Text>
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
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.sm, paddingVertical: Spacing.sm },
  switchText: { color: Colors.textDim, fontSize: FontSize.sm },
  switchLink: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
  noticeBox: {
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.like,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  noticeText: { color: Colors.text, fontSize: FontSize.xs, textAlign: 'center' },
  noticeLink: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
});
