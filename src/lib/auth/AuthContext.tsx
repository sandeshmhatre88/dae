import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';

import {
  deleteAccount as deleteAccountRequest,
  initiateOtpLogin,
  refreshLogin,
  signup as signupRequest,
  updateProfile as updateProfileRequest,
  verifyOtpLogin,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import type { LoginSuccess, OtpInitiateResult } from '../api/types';
import { clearSession, loadSession, saveSession } from './tokenStore';
import { decodeExp } from './jwt';

// How long before IdToken expiry to proactively refresh, and how often to
// check while the app is foregrounded. Wide margin + frequent checks so a
// refresh never lands mid-video - see backend/lambdas/LOGIN.py refresh_tokens().
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const REFRESH_CHECK_INTERVAL_MS = 60 * 1000;

function deviceId() {
  if (Platform.OS === 'android') {
    try {
      return Application.getAndroidId();
    } catch {
      // falls through
    }
  }
  return Constants.sessionId ?? 'unknown-device';
}

function deviceTitle() {
  return Constants.deviceName ?? `${Platform.OS} device`;
}

type AuthState = {
  session: LoginSuccess | null;
  isLoading: boolean;
  signup: (input: {
    fullName: string;
    phoneNumber: string;
    email?: string;
    dateOfBirth?: string;
  }) => Promise<void>;
  sendOtp: (phoneNumber: string) => Promise<OtpInitiateResult>;
  verifyOtp: (
    challenge: OtpInitiateResult,
    otp: string
  ) => Promise<{ success: true } | { success: false; retry: OtpInitiateResult }>;
  logout: () => Promise<void>;
  /** Permanently deletes the account (Google Play Account Deletion policy) -
   * see backend/lambdas/DELETE_ACCOUNT.py. The server revokes the session,
   * so this also clears local session state on success. Throws ApiError on
   * failure, leaving the session intact. */
  deleteAccount: () => Promise<void>;
  /** Updates the caller's own FULL_NAME / DATE_OF_BIRTH / GENDER (see
   * backend/lambdas/USERS.py PUT) and merges the change into the local
   * session immediately - the DB row is updated synchronously, but the
   * server's own USER_META cache (what a future refresh/re-login would read
   * back) only catches up on its own async cycle, so this optimistic merge
   * is what keeps the UI in sync in the meantime. Throws ApiError on failure. */
  updateProfile: (input: { fullName?: string; dateOfBirth?: string; gender?: string }) => Promise<void>;
  /** Silently re-issues tokens (+ CloudFront cookies) from the stored refresh
   * token. Safe to call anytime - a no-op if there's no session, and leaves
   * the current session alone on a transient/offline failure. Only clears
   * the session if the refresh token itself is dead. */
  refreshSession: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LoginSuccess | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // refreshSession() below is a stable callback (empty deps) so effects that
  // depend on it don't re-subscribe constantly - it reads the live session
  // through this ref instead of closing over the `session` state value.
  const sessionRef = useRef<LoginSuccess | null>(null);
  sessionRef.current = session;

  useEffect(() => {
    loadSession()
      .then(setSession)
      // A storage read failure (e.g. expo-secure-store has no web support -
      // see tokenStore.ts) must not leave this an unhandled rejection: that
      // crashes to Metro's full-screen error overlay, which blocks every tap
      // on the page, not just this effect.
      .catch(() => setSession(null))
      .finally(() => setIsLoading(false));
  }, []);

  const refreshSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.RefreshToken) return;
    try {
      const result = await refreshLogin(current.RefreshToken);
      await saveSession(result);
      setSession(result);
    } catch (e) {
      // Only a dead refresh token (expired/revoked, e.g. weeks of inactivity)
      // should sign the user out - any other failure (offline, 5xx) leaves
      // the existing session in place; the next scheduled check retries.
      if (e instanceof ApiError && /invalid or expired/i.test(e.message)) {
        await clearSession();
        setSession(null);
      }
    }
  }, []);

  // Proactive silent refresh: check on mount/session-load, on a foreground
  // interval, and whenever the app comes back to the foreground - covers
  // both "left the app open through a long video" and "backgrounded
  // overnight, reopened" without ever surfacing a login prompt mid-playback.
  useEffect(() => {
    if (!session) return;

    const maybeRefresh = () => {
      const expiresAt = decodeExp(sessionRef.current?.IdToken);
      if (expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        refreshSession();
      }
    };

    maybeRefresh();
    const interval = setInterval(maybeRefresh, REFRESH_CHECK_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') maybeRefresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [session, refreshSession]);

  const signup = useCallback(
    async (input: { fullName: string; phoneNumber: string; email?: string; dateOfBirth?: string }) => {
      await signupRequest({
        FULL_NAME: input.fullName,
        PHONE_NUMBER: input.phoneNumber,
        EMAIL: input.email,
        DATE_OF_BIRTH: input.dateOfBirth,
        DEVICE_TITLE: deviceTitle(),
        DEVICE_ID: deviceId(),
      });
    },
    []
  );

  const sendOtp = useCallback(async (phoneNumber: string) => {
    return initiateOtpLogin(phoneNumber);
  }, []);

  const verifyOtp = useCallback(async (challenge: OtpInitiateResult, otp: string) => {
    try {
      const result = (await verifyOtpLogin({
        userId: challenge.USER_ID,
        session: challenge.SESSION,
        otp,
      })) as LoginSuccess;
      await saveSession(result);
      setSession(result);
      return { success: true as const };
    } catch (e) {
      // A wrong-but-attempts-remaining code returns success:false with a fresh
      // SESSION to retry (see backend/API_CONTRACT.md) - the client throws for
      // any success:false, carrying that body on the error.
      if (e instanceof ApiError && e.body && typeof e.body === 'object' && 'SESSION' in e.body) {
        return { success: false as const, retry: e.body as OtpInitiateResult };
      }
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setSession(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await deleteAccountRequest();
    await clearSession();
    setSession(null);
  }, []);

  const updateProfile = useCallback(async (input: { fullName?: string; dateOfBirth?: string; gender?: string }) => {
    const current = sessionRef.current;
    if (!current) return;
    await updateProfileRequest({
      USER_ID: current.USER_ID,
      FULL_NAME: input.fullName,
      DATE_OF_BIRTH: input.dateOfBirth,
      GENDER: input.gender,
    });
    const updated: LoginSuccess = {
      ...current,
      ...(input.fullName !== undefined && { FULL_NAME: input.fullName, USER_NAME: input.fullName }),
      ...(input.dateOfBirth !== undefined && { DATE_OF_BIRTH: input.dateOfBirth }),
      ...(input.gender !== undefined && { GENDER: input.gender }),
    };
    await saveSession(updated);
    setSession(updated);
  }, []);

  const value = useMemo(
    () => ({ session, isLoading, signup, sendOtp, verifyOtp, logout, deleteAccount, updateProfile, refreshSession }),
    [session, isLoading, signup, sendOtp, verifyOtp, logout, deleteAccount, updateProfile, refreshSession]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
