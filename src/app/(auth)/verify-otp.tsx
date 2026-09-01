import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/PrimaryButton';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';

export default function VerifyOtpScreen() {
  const {
    userId: initialUserId,
    session: initialSession,
    debug: initialDebug,
  } = useLocalSearchParams<{ userId: string; session: string; debug?: string }>();
  const { verifyOtp, sendOtp } = useAuth();

  const [userId] = useState(initialUserId);
  const [session, setSession] = useState(initialSession);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  // SMS_DEBUG (see lib/api/types.ts) carries the raw gateway response so we
  // can tell a real send failure apart from a normal successful send -
  // "sent ok" prefix means it went out fine, anything else (send failure, or
  // no phone_number backing this login attempt) means no code was actually
  // texted. Only the latter is worth telling the user about, and only in
  // plain language - never surface the raw gateway text itself.
  const [smsDebug, setSmsDebug] = useState(initialDebug ?? '');
  const sendFailed = !!smsDebug && !smsDebug.startsWith('sent ok');

  const onVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await verifyOtp({ USER_ID: userId, SESSION: session }, code);
      if (!result.success) {
        setSession(result.retry.SESSION);
        setCode('');
        setError('Incorrect code, please try again');
      }
      // On success, the root layout's Stack.Protected guard swaps to (tabs)
      // automatically - no extra navigation needed here.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit the moment the 6th digit lands, so the button is a fallback
  // rather than a required tap.
  useEffect(() => {
    if (code.length === 6 && !loading) {
      onVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onResend = async () => {
    setResending(true);
    setError('');
    try {
      const challenge = await sendOtp(userId);
      setSession(challenge.SESSION);
      setSmsDebug(challenge.SMS_DEBUG ?? '');
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={styles.heading}>Enter the code</Text>
          <Text style={styles.sub}>We sent a 6-digit code by SMS to +91 {userId}</Text>

          <View style={styles.field}>
            <View style={[styles.inputWrap, !!error && styles.inputError]}>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                placeholderTextColor={Colors.textDim}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                // Centered once there's something to center - but an empty
                // centered TextInput puts the caret at an unexpected spot
                // (see the earlier fix); left-align just for the empty state
                // so it starts exactly where the first digit will land, then
                // switch to center the moment typing begins.
                style={[styles.input, code.length === 0 && styles.inputEmpty]}
              />
            </View>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <PrimaryButton title="Verify & Continue" onPress={onVerify} loading={loading} />

          <Pressable onPress={onResend} disabled={resending} style={styles.resendRow}>
            <Text style={styles.resendText}>{resending ? 'Sending...' : "Didn't get a code? Resend"}</Text>
          </Pressable>

          {sendFailed && (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>
                We couldn&apos;t send your code just now. Please tap Resend, or double-check your number.
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  content: { flex: 1, padding: Spacing.xl, paddingTop: Spacing.xxl * 1.5, gap: Spacing.lg },
  heading: { color: Colors.text, fontSize: FontSize.xl, fontWeight: '800' },
  sub: { color: Colors.textDim, fontSize: FontSize.sm, marginBottom: Spacing.md },
  field: { gap: Spacing.xs },
  inputWrap: {
    backgroundColor: Colors.surface2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  inputError: { borderColor: Colors.like },
  input: { color: Colors.text, fontSize: FontSize.xl, letterSpacing: 8, textAlign: 'center' },
  // Empty-state-only override - see the comment on the TextInput itself.
  inputEmpty: { textAlign: 'left' },
  errorText: { color: Colors.like, fontSize: FontSize.xs },
  resendRow: { alignItems: 'center', marginTop: Spacing.sm },
  resendText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '600' },
  noticeBox: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.like,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  noticeText: { color: Colors.text, fontSize: FontSize.xs },
});
