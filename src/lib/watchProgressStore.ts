import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncWatchProgress } from './api/endpoints';
import type { ContentItem } from './api/types';

// Local-first "continue watching" state, mirroring volumeStore.ts's pattern.
// There is NO periodic network sync while playing - every tick just writes
// here (cheap, no network). The server only ever hears about progress on a
// real event: pause, finish, or closing the video/app (see content/[id].tsx
// and the AppState hook below). SYNCED tracks whether the last one of those
// events actually reached the server; flushPendingWatchProgress() is the
// catch-up path for when it didn't (app crashed, no signal, killed mid-call)
// - it re-tries on next app start and on returning to the foreground, using
// whatever this device last saw locally instead of losing that position.
const STORAGE_KEY = 'dae.watchProgress';

export type LocalWatchProgress = {
  CONTENT_ID: number;
  USER_ID: number;
  PROGRESS: number; // 0-100 - where to seek to. Kept even once FINISHED, so
  // reopening a finished title (without tapping the explicit "Watch Again"
  // button) still lands back where it was, not a silent reset to 0.
  FINISHED: boolean; // set only by the real playToEnd event - never inferred
  // from PROGRESS alone, so "paused at 96%" and "actually played to the end"
  // aren't confused. Only an explicit "Watch Again" tap (or a rewatch
  // actually reaching the end again) changes this back.
  TITLE?: string;
  THUMBNAIL_URL?: string;
  DURATION?: string;
  CATEGORY_ID?: number;
  UPDATED_AT: number; // Date.now()
  SYNCED: boolean;
};

type Store = Record<number, LocalWatchProgress>;

// Home screen bucketing: Watch Again is exactly "the real playToEnd event
// fired for this title" (entry.FINISHED) - never a percentage guess. Continue
// Watching is anything else with a meaningful amount of progress.
const MIN_RESUME_PCT = 2;

export function hasMeaningfulProgress(pct: number | undefined): boolean {
  return pct !== undefined && pct > MIN_RESUME_PCT;
}

export function isContinueWatching(entry: LocalWatchProgress): boolean {
  return !entry.FINISHED && hasMeaningfulProgress(entry.PROGRESS);
}

export function isWatchAgain(entry: LocalWatchProgress): boolean {
  return entry.FINISHED;
}

/** Heuristic only - for seeding a local entry from a plain percentage number
 * that has no real FINISHED signal behind it (e.g. a server-provided
 * LAST_WATCHED_PROGRESS on a card/hero this device has no local entry for
 * yet - see ContentCard.tsx). Never used for entries this device already
 * tracks itself; those carry the authoritative FINISHED flag from
 * content/[id].tsx's own playToEnd handler. */
export function guessFinishedFromPct(pct: number | undefined): boolean {
  return pct !== undefined && pct >= 95;
}

/** Shapes a local progress entry as a ContentItem so it can drop straight
 * into a ContentRow/ContentCard - LAST_WATCHED_PROGRESS drives the little
 * progress bar on the card. */
export function toContentItem(entry: LocalWatchProgress): ContentItem {
  return {
    CONTENT_ID: entry.CONTENT_ID,
    TITLE: entry.TITLE ?? '',
    THUMBNAIL_URL: entry.THUMBNAIL_URL,
    DURATION: entry.DURATION,
    CATEGORY_ID: entry.CATEGORY_ID,
    LAST_WATCHED_PROGRESS: entry.PROGRESS,
  };
}

let current: Store = {};
let loaded = false;
let loadPromise: Promise<Store> | null = null;

async function readFromStorage(): Promise<Store> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function persist() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)).catch(() => {});
}

/** Call once (root layout) so getLocalProgress() is populated before first render. */
export function initWatchProgressStore(): Promise<Store> {
  if (!loadPromise) {
    loadPromise = readFromStorage().then((store) => {
      current = store;
      loaded = true;
      return store;
    });
  }
  return loadPromise;
}

export function isWatchProgressStoreLoaded() {
  return loaded;
}

export function getLocalProgress(contentId: number): LocalWatchProgress | undefined {
  return current[contentId];
}

export function getAllLocalProgress(): Store {
  return current;
}

/** Called every playback tick - always unsynced, since this is just this
 * device's live position, not something the server has heard yet. */
export function setLocalProgress(entry: Omit<LocalWatchProgress, 'SYNCED'>) {
  current = { ...current, [entry.CONTENT_ID]: { ...entry, SYNCED: false } };
  persist();
}

/** Call after a pause/close sync to the server actually succeeds. */
export function markSynced(contentId: number) {
  const entry = current[contentId];
  if (!entry || entry.SYNCED) return;
  current = { ...current, [contentId]: { ...entry, SYNCED: true } };
  persist();
}

/** Drops a title from local tracking entirely (no Continue Watching / Watch
 * Again entry at all) - not used on finish (see content/[id].tsx, which
 * persists PROGRESS=100 there instead so it shows under Watch Again).
 * Available for an explicit "remove from history" action if one gets added. */
export function clearLocalProgress(contentId: number) {
  if (!(contentId in current)) return;
  const next = { ...current };
  delete next[contentId];
  current = next;
  persist();
}

/** Re-tries any progress the server never got confirmation of - a pause/
 * close/finish sync that never fired (crash) or failed (no connection at the
 * time). Safe to call often: entries already SYNCED are skipped instantly,
 * and this never runs on a timer, only on app start and on returning to the
 * foreground (see _layout.tsx). */
export async function flushPendingWatchProgress(): Promise<void> {
  await initWatchProgressStore();
  const pending = Object.values(current).filter((e) => !e.SYNCED);
  for (const entry of pending) {
    try {
      await syncWatchProgress({
        CONTENT_ID: entry.CONTENT_ID,
        USER_ID: entry.USER_ID,
        PROGRESS: entry.PROGRESS,
        refreshCache: true,
      });
      markSynced(entry.CONTENT_ID);
    } catch {
      // Still offline or the request failed - leave unsynced, the next
      // flush (next app start / next foreground) will try again.
    }
  }
}

initWatchProgressStore();
