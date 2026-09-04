import AsyncStorage from '@react-native-async-storage/async-storage';
import { withTimeout } from './withTimeout';

// A single volume/mute preference shared by every video in the app (main
// player + Shorts), kept in memory so new players can read it synchronously
// at creation time - if this were only loaded via an async effect per
// screen, every newly-opened video would briefly start at the default
// 100%/unmuted before snapping to the saved value once the promise resolved.
const VOLUME_KEY = 'dae.prefs.volume';
const MUTED_KEY = 'dae.prefs.muted';

export type VolumePref = { volume: number; muted: boolean };

let current: VolumePref = { volume: 1, muted: false };
let initPromise: Promise<VolumePref> | null = null;
const listeners = new Set<(pref: VolumePref) => void>();

async function readFromStorage(): Promise<VolumePref> {
  try {
    console.log('[volumeStore] readFromStorage: start');
    const [volumeRaw, mutedRaw] = await withTimeout(
      Promise.all([AsyncStorage.getItem(VOLUME_KEY), AsyncStorage.getItem(MUTED_KEY)]),
      5000,
      [null, null] as [string | null, string | null],
      'AsyncStorage.getItem(volume/muted)'
      );
    console.log('[volumeStore] readFromStorage: resolved');
    const volume = volumeRaw !== null ? Number(volumeRaw) : 1;
    return {
      volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1,
      muted: mutedRaw === 'true',
    };
  } catch {
    return { volume: 1, muted: false };
  }
}

/** Call once, as early as possible (root layout) - resolves once the saved
 * preference has been read, so getVolumePref() is accurate from then on. */
export function initVolumePref(): Promise<VolumePref> {
  if (!initPromise) {
    initPromise = readFromStorage().then((pref) => {
      current = pref;
      return pref;
    });
  }
  return initPromise;
}

/** Synchronous read - safe to call from a useVideoPlayer setup callback. */
export function getVolumePref(): VolumePref {
  return current;
}

/** Every player should call this on every volume/mute change so the next
 * video opened (on any screen) picks up the same value. */
export function setVolumePref(volume: number, muted: boolean) {
  current = { volume, muted };
  AsyncStorage.setItem(VOLUME_KEY, String(volume)).catch(() => {});
  AsyncStorage.setItem(MUTED_KEY, String(muted)).catch(() => {});
  listeners.forEach((l) => l(current));
}

export function subscribeVolumePref(fn: (pref: VolumePref) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Start loading immediately on first import (app startup) rather than
// waiting for a screen to mount.
initVolumePref();
