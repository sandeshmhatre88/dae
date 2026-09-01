import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { LoginSuccess } from '../api/types';

const KEY = 'dae.session';

// expo-secure-store has no web implementation (confirmed against Expo's own
// docs) - calls there reject, which previously surfaced as a hard login/logout
// failure on web even though the API call itself succeeded. Use localStorage
// on web instead so a session actually persists there too.
export async function saveSession(session: LoginSuccess) {
  const raw = JSON.stringify(session);
  if (Platform.OS === 'web') {
    localStorage.setItem(KEY, raw);
    return;
  }
  await SecureStore.setItemAsync(KEY, raw);
}

export async function loadSession(): Promise<LoginSuccess | null> {
  const raw = Platform.OS === 'web' ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LoginSuccess;
  } catch {
    return null;
  }
}

export async function clearSession() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}
