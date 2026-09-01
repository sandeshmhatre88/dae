import { useEvent, useEventListener } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ContentRow } from '@/components/ContentRow';
import { FlyToListIcon } from '@/components/FlyToListIcon';
import { VerticalVolumeBar } from '@/components/VerticalVolumeBar';
import { Colors, FontSize, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth/AuthContext';
import { bannerUrl, thumbnailUrl, trailerUrl, videoHeaders, videoUrl } from '@/lib/api/config';
import type { ContentItem } from '@/lib/api/types';
import { getVolumePref, setVolumePref } from '@/lib/volumeStore';
import {
  clearLocalProgress,
  getLocalProgress,
  hasMeaningfulProgress,
  markSynced,
  setLocalProgress,
} from '@/lib/watchProgressStore';
import {
  addFavorite,
  getContentDetail,
  getFavorites,
  getLandingPage,
  markWatchFinished,
  removeFavorite,
  startWatchSession,
  syncWatchProgress,
  type FavoriteRow,
} from '@/lib/api/endpoints';

// No periodic network sync while playing - progress only ever goes to the
// server on a real event (pause, finish, closing the video, backgrounding
// the app). watchProgressStore keeps this device's live position locally in
// between; flushPendingWatchProgress (see _layout.tsx) catches up anything
// that never made it out (crash, no connection at the time). This only
// throttles the LOCAL write (AsyncStorage, no network) - it has no effect
// on how often the server is contacted, that's still purely event-driven.
const LOCAL_SAVE_MS = 2000;

const CONTROLS_HIDE_MS = 3000;
const SEEK_SECONDS = 10;
const DOUBLE_TAP_MS = 300;

const logoSource = require('../../../assets/images/logo.png');

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Wrapper only: forces a full remount whenever `id` changes. Without this,
// navigating from one video straight into another for the same route (e.g.
// "Watch Next"/"Watch Again" using router.replace) reuses this screen's
// existing component instance instead of mounting a fresh one - every local
// useState here (videoFinished, controlsVisible, stage, etc.) would then
// carry over from the video that was just playing, so a brand-new video
// could open already showing the previous one's "finished" overlay, or with
// its control-visibility timers still running.
export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ContentDetailScreenInner key={id} />;
}

function ContentDetailScreenInner() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contentId = Number(id);
  const { session, refreshSession } = useAuth();
  const userId = session!.USER_ID;
  const queryClient = useQueryClient();

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['content', contentId],
    queryFn: () => getContentDetail(contentId, userId),
    retry: false,
  });

  // A deleted title 404s here (see backend/lambdas/CONTENT.py) - drop any
  // stale local Continue Watching / Watch Again entry for it so Home stops
  // showing a tile that only ever leads back to this same dead end.
  useEffect(() => {
    if (isError) clearLocalProgress(contentId);
  }, [isError, contentId]);

  const { data: moreLikeThis } = useQuery({
    queryKey: ['content-related', item?.CATEGORY_ID],
    queryFn: () => getLandingPage({ userId, categoryId: item!.CATEGORY_ID }),
    enabled: !!item?.CATEGORY_ID,
  });

  const { data: favorites } = useQuery({ queryKey: ['favorites', userId], queryFn: () => getFavorites(userId) });
  const favorite = favorites?.find((f) => f.CONTENT_ID === contentId);

  // Whatever was left locally the last time this content was closed
  // mid-playback (back button, pause-then-back, backgrounding - anything,
  // see flushOnClose below). Falls back to the server's own
  // LAST_WATCHED_PROGRESS (from the same LANDING_PAGE/CONTENT data Home's
  // Continue Watching row is built from) when this device has no local
  // entry yet - otherwise a title that only Home knows about (fresh
  // install, or progress made on another device) would show up in Continue
  // Watching but land on the trailer/banner instead of resuming when opened.
  const savedProgress = getLocalProgress(contentId);
  const forThisUser = !!savedProgress && savedProgress.USER_ID === userId;
  const resumePct = forThisUser ? savedProgress!.PROGRESS : item?.LAST_WATCHED_PROGRESS;
  // Only this device's own authoritative FINISHED flag counts (set
  // exclusively by playToEnd) - server-only progress has no equivalent
  // signal, so it's never guessed as finished from that fallback.
  const isFinished = forThisUser && savedProgress!.FINISHED;
  // Seek-worthy - deliberately excludes finished titles AND anything already
  // essentially at the end: resumePct is a *percentage of duration*, so
  // seeking a ~100% title would put currentTime at the literal last instant
  // of the video and just sit there showing nothing - not a resume, a dead
  // end. The explicit `< 98` bound is belt-and-suspenders on top of
  // `!isFinished` - a stray near-100% reading (from any source, not just a
  // genuine finish) should never be trusted as a seek target either way. A
  // title this far along restarts from 0 instead (real "Watch Again"
  // semantics), same as tapping the explicit Watch Again button.
  const hasResume = !isFinished && hasMeaningfulProgress(resumePct) && resumePct! < 98;
  // Same list backs both the "More Like This" row and the random "Watch
  // Next" pick on the finished screen - computed here (not after the
  // loading early-return) so the playToEnd handler's closure can see it.
  const relatedAll = moreLikeThis
    ? Object.values(moreLikeThis).flat().filter((c) => c.CONTENT_ID !== contentId)
    : [];
  const [liked, setLiked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [videoFinished, setVideoFinished] = useState(false);
  const [watchNextItem, setWatchNextItem] = useState<ContentItem | null>(null);

  useEffect(() => {
    if (!isFullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsFullscreen(false);
      return true;
    });
    return () => sub.remove();
  }, [isFullscreen]);

  useEffect(() => {
    // The app is portrait-locked by default (app.json); rotate to landscape
    // just for fullscreen playback and restore portrait on the way out.
    ScreenOrientation.lockAsync(
      isFullscreen ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
    return () => {
      if (isFullscreen) ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [isFullscreen]);

  const videoUri = item?.VIDEO_URL ? videoUrl(item.VIDEO_URL) : undefined;
  const trailerUri = item?.TRAILER_URL ? trailerUrl(item.TRAILER_URL) : undefined;
  const bannerUri = item?.BANNER_URL ? bannerUrl(item.BANNER_URL) : undefined;

  // The play-area stage the content would open on. A title with local
  // progress (resuming or rewatching from Home's Continue Watching / Watch
  // Again row, or coming back to this same detail page) skips straight to
  // the video - trailer/banner intros are only for a title being opened for
  // the first time. `stage` below stays in sync with this automatically
  // until something explicitly overrides it (trailer ending, banner tap,
  // "Watch Now").
  const autoStage: 'trailer' | 'banner' | 'video' =
    hasResume || isFinished ? 'video' : trailerUri ? 'trailer' : bannerUri ? 'banner' : 'video';
  const [stageOverride, setStage] = useState<'trailer' | 'banner' | 'video' | null>(null);
  const stage = stageOverride ?? (item ? autoStage : null);
  // Every "play" entry point goes through this rather than setStage('video')
  // directly - a Play tap should always play, never land on the finished
  // (Watch Again/Home) screen. Belt-and-suspenders on top of the key={id}
  // remount above: explicitly clears videoFinished the moment playback is
  // (re)started, rather than relying on it already being false.
  const startVideo = () => {
    setVideoFinished(false);
    setStage('video');
  };

  // videoHeaders() returns undefined until the backend's CloudFront key
  // group is configured - Cookie is optional here on purpose, playback just
  // stays unauthenticated (public CDN) until then.
  const cookieHeader = videoHeaders(session)?.Cookie;
  // Memoized: this component re-renders every 500ms from the position-poll
  // interval below, and useVideoPlayer treats a new `source` object identity
  // as "load a new video" - without this, playback would restart constantly.
  // It only actually changes when the URL or the signed cookie value changes
  // (e.g. after a silent token refresh re-mints the cookie), or once the
  // stage actually reaches 'video' - the real video never loads/plays while
  // the trailer or banner is showing.
  const source = useMemo(
    () =>
      stage === 'video' && videoUri
        ? { uri: videoUri, headers: cookieHeader ? { Cookie: cookieHeader } : undefined }
        : undefined,
    [stage, videoUri, cookieHeader]
  );

  // Light fade-in for the real video, most noticeable when it starts
  // directly (no trailer/banner in front of it), but applied on every
  // transition into the 'video' stage for a consistent feel.
  const [videoFade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (stage !== 'video') return;
    videoFade.setValue(0);
    Animated.timing(videoFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [stage, videoFade]);
  // Read by the unmount-flush effect below, which only runs once (deps are
  // just contentId/userId) - a plain closure over `source` would freeze on
  // whatever it was on that first render (often undefined, pre-fetch).
  const sourceRef = useRef(source);
  sourceRef.current = source;
  // Same reasoning, for flushOnClose below: without this, leaving the
  // finished/Watch Again screen (not mid-playback) would overwrite the
  // FINISHED:true that playToEnd just set with a stale FINISHED:false from
  // this frozen closure, silently moving the title back to Continue
  // Watching the moment you navigate away from it.
  const videoFinishedRef = useRef(videoFinished);
  videoFinishedRef.current = videoFinished;
  const player = useVideoPlayer(source ?? null, (p) => {
    p.loop = false;
    // Apply the shared saved volume synchronously at creation - reading it
    // via an async effect after the fact meant every video briefly played
    // at the 100%/unmuted default before snapping to the real value.
    const pref = getVolumePref();
    p.volume = pref.volume;
    p.muted = pref.muted;
    // Drives the seek bar / local-progress tracking below via the native
    // `timeUpdate` event instead of a JS-side setInterval poll - tied to
    // actual playback progress, not a generic timer running regardless of
    // player state.
    p.timeUpdateEventInterval = 1;
    // Resume from resumePct (local progress, or the server's
    // LAST_WATCHED_PROGRESS when this device has none - see above) -
    // `sourceLoad` is the first point the real duration is known (0
    // beforehand), which is what's needed to convert the stored percentage
    // into a seconds offset. Done here in the player's own setup rather than
    // an effect, since this runs exactly once per real new source (see the
    // `source` memo above), same as the volume priming right above it.
    // play() only fires AFTER the seek lands here - calling it earlier
    // (before sourceLoad) let a resumed video visibly start playing from
    // 0:00 for an instant before jumping to the saved spot.
    if (source && hasResume && resumePct !== undefined) {
      p.addListener('sourceLoad', ({ duration: loadedDuration }) => {
        if (loadedDuration > 0) {
          p.currentTime = (resumePct / 100) * loadedDuration;
        }
        p.play();
      });
    } else if (source) {
      p.play();
    }
  });
  const { status, error: playerError } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  // Keep the screen from auto-locking while actually playing - basic, expected
  // behavior for any video app (the screen dimming/locking mid-movie is the
  // classic complaint). Tied to isPlaying specifically, not just having this
  // screen open, so it lets go the moment playback is paused, same as most
  // video apps (not a blanket "never sleep on this screen" tag).
  useEffect(() => {
    const tag = `content-${contentId}`;
    if (isPlaying) {
      activateKeepAwakeAsync(tag).catch(() => {});
    } else {
      deactivateKeepAwake(tag).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(tag).catch(() => {});
    };
  }, [isPlaying, contentId]);

  // Trailer playback - a separate, much simpler player: no watch-progress
  // tracking, no resume, no CONTENT_VIEW logging, just autoplay inline in
  // the play area while stage === 'trailer'. TRAILER_URL is served off the
  // public meta CDN (unlike VIDEO_URL), so no signed cookie is needed here.
  const trailerSource = useMemo(
    () => (stage === 'trailer' && trailerUri ? { uri: trailerUri } : null),
    [stage, trailerUri]
  );
  const trailerPlayer = useVideoPlayer(trailerSource, (p) => {
    p.loop = false;
    if (trailerSource) p.play();
  });
  // Trailer finished on its own (user didn't tap "Play Full Video") - fall
  // through to the banner + big play button stage. Only ever registered
  // while a trailer is actually loaded, so it's safe to jump straight there.
  useEventListener(trailerPlayer, 'playToEnd', () => {
    setStage('banner');
  });

  // A playback error can mean the CloudFront signed cookie expired (e.g. the
  // video was paused for a very long time in the background). Try one
  // silent session refresh - refreshSession() re-mints the cookie, which
  // changes `cookieHeader` above, which changes `source`'s identity, which
  // makes useVideoPlayer reload with the fresh cookie automatically.
  const errorRecoveryTriedRef = useRef(false);
  useEffect(() => {
    if (status === 'error' && !errorRecoveryTriedRef.current) {
      errorRecoveryTriedRef.current = true;
      refreshSession().catch(() => {});
    } else if (status !== 'error') {
      errorRecoveryTriedRef.current = false;
    }
  }, [status, refreshSession]);

  const { volume } = useEvent(player, 'volumeChange', { volume: player.volume });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const applyVolume = (next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    const nextMuted = clamped === 0 ? muted : false;
    // eslint-disable-next-line react-hooks/immutability -- imperative player handle, see VerticalVolumeBar.tsx
    player.volume = clamped;
    if (nextMuted !== muted) {
      player.muted = nextMuted;
    }
    setVolumePref(clamped, nextMuted);
  };
  const toggleMute = () => {
    // eslint-disable-next-line react-hooks/immutability
    player.muted = !muted;
    setVolumePref(volume, !muted);
  };

  // Seek bar position - driven by the player's own native `timeUpdate` event
  // (see `p.timeUpdateEventInterval` above) rather than a JS-side poll, so
  // this only ever fires while actual playback is progressing. The same
  // handler also keeps a local, no-network record of progress
  // (watchProgressStore) - that's what makes the resume position/progress
  // bar accurate on-device without hitting the API on every tick. Still
  // throttled to LOCAL_SAVE_MS for the AsyncStorage write specifically (the
  // seek bar itself updates on every timeUpdate tick, unthrottled).
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const progressRef = useRef(0);
  const lastLocalSaveRef = useRef(0);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!seeking) setPosition(currentTime);
    const dur = player.duration || 0;
    setDuration(dur);
    // dur > 1 (not just > 0): a duration that hasn't stabilized yet (some
    // sources briefly report something tiny/near-zero right after load) can
    // put currentTime/dur way over 1 - clamped below regardless, but better
    // to just not trust/store a degenerate reading in the first place.
    // Clamped defensively either way: this must never be able to store
    // anything outside 0-100, no matter what dur/currentTime report.
    // Skipped once this playthrough has genuinely finished - a `timeUpdate`
    // tick can still land at/after the exact same instant as `playToEnd`
    // (both fire once currentTime reaches duration), and this write always
    // hardcodes FINISHED:false; landing after playToEnd's FINISHED:true
    // write would silently flip a just-finished title back to Continue
    // Watching. videoFinishedRef (not React state) so this closure - only
    // (re)created when the source itself changes, not on every render - sees
    // the up-to-date value.
    if (dur > 1 && !videoFinishedRef.current) {
      const pct = Math.min(100, Math.max(0, Math.round((currentTime / dur) * 100)));
      progressRef.current = pct;
      const now = Date.now();
      if (now - lastLocalSaveRef.current >= LOCAL_SAVE_MS) {
        lastLocalSaveRef.current = now;
        setLocalProgress({
          CONTENT_ID: contentId,
          USER_ID: userId,
          PROGRESS: pct,
          FINISHED: false,
          TITLE: item?.TITLE,
          THUMBNAIL_URL: item?.THUMBNAIL_URL,
          DURATION: item?.DURATION,
          CATEGORY_ID: item?.CATEGORY_ID,
          UPDATED_AT: now,
        });
      }
    }
  });

  // Tell the server playback started (once per open - not on an interval).
  // This is the only call that can touch the DB directly server-side, and
  // only on the very first watch of a title (see CONTENT_VIEW.py).
  useEffect(() => {
    if (!source) return;
    startWatchSession({ CONTENT_ID: contentId, USER_ID: userId }).catch(() => {});
  }, [source, contentId, userId]);

  // The one place progress actually leaves the device mid-session: a real
  // pause. No periodic timer - if the user never pauses, the server just
  // hears about it on finish/close instead, and watchProgressStore already
  // has an accurate local resume point regardless.
  const wasPlayingRef = useRef(false);
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying) {
      syncWatchProgress({
        CONTENT_ID: contentId,
        USER_ID: userId,
        PROGRESS: progressRef.current,
        refreshCache: true,
      })
        .then(() => markSynced(contentId))
        .catch(() => {
          // Offline or the request failed - stays unsynced locally,
          // flushPendingWatchProgress retries next app start/foreground.
        });
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, contentId, userId]);

  // Natural completion - queue the FINISHED event server-side, persist a
  // local PROGRESS:100 record (this is what actually puts it under Home's
  // Watch Again row - see isWatchAgain()/toContentItem() in
  // watchProgressStore.ts; ticking past MIN_RESUME_PCT on a rewatch moves it
  // right back to Continue Watching, no separate "un-finish" step needed),
  // and show the Watch Again / Home / Watch Next screen. The "next" pick is
  // randomized fresh each time this fires, so replaying to the end again
  // offers a different suggestion.
  useEventListener(player, 'playToEnd', () => {
    // Guard against a suspiciously-instant "end" - if playback never
    // meaningfully progressed (progressRef still near 0), this is almost
    // certainly a load/playback failure being reported as "ended" rather
    // than a real completion (some native players do this for a broken/
    // unauthorized source instead of a clean error) - not a real finish, so
    // don't persist FINISHED or show the Watch Again screen for it.
    if (progressRef.current < 5) {
      console.warn(`playToEnd fired at ${progressRef.current}% - treating as a load failure, not a real finish.`);
      return;
    }
    markWatchFinished({ CONTENT_ID: contentId, USER_ID: userId }).catch(() => {});
    setLocalProgress({
      CONTENT_ID: contentId,
      USER_ID: userId,
      PROGRESS: 100,
      FINISHED: true,
      TITLE: item?.TITLE,
      THUMBNAIL_URL: item?.THUMBNAIL_URL,
      DURATION: item?.DURATION,
      CATEGORY_ID: item?.CATEGORY_ID,
      UPDATED_AT: Date.now(),
    });
    setVideoFinished(true);
    setWatchNextItem(relatedAll.length ? relatedAll[Math.floor(Math.random() * relatedAll.length)] : null);
  });

  // Closing the video (back button, navigating away) mid-playback - any way
  // of leaving. The periodic tick above only touches the local store every
  // LOCAL_SAVE_MS, so on top of the server sync this also writes the
  // freshest known position (progressRef, updated every 500ms) to the local
  // store immediately, so "Continue Watching" is accurate even if the app
  // is killed a moment after leaving, not just up to 5s stale.
  const flushOnClose = () => {
    if (!sourceRef.current) return;
    // This closure is only recreated when contentId/userId change (see the
    // effect below), so `item` itself would be frozen at whatever it was on
    // that render (often still undefined, pre-fetch) - read the query cache
    // live instead, same reasoning as sourceRef/progressRef above.
    const latestItem = queryClient.getQueryData<ContentItem>(['content', contentId]);
    setLocalProgress({
      CONTENT_ID: contentId,
      USER_ID: userId,
      PROGRESS: progressRef.current,
      FINISHED: videoFinishedRef.current,
      TITLE: latestItem?.TITLE,
      THUMBNAIL_URL: latestItem?.THUMBNAIL_URL,
      DURATION: latestItem?.DURATION,
      CATEGORY_ID: latestItem?.CATEGORY_ID,
      UPDATED_AT: Date.now(),
    });
    syncWatchProgress({
      CONTENT_ID: contentId,
      USER_ID: userId,
      PROGRESS: progressRef.current,
      refreshCache: true,
    })
      .then(() => markSynced(contentId))
      .catch(() => {});
  };
  useEffect(() => {
    return flushOnClose;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only on unmount/id change, reads the refs live
  }, [contentId, userId]);

  // Backgrounding the app counts as "closing the video" too - a component
  // unmount isn't guaranteed to fire before the OS suspends the app (home
  // button, task switch), so this is the other real chance to sync before
  // it goes away. Best-effort either way; if it doesn't land,
  // flushPendingWatchProgress catches it on the next app start.
  // Also explicitly pauses playback - without this, a video (and its audio)
  // keeps playing invisibly in the background, which is the classic "why is
  // my phone still making noise in my pocket" bug for a VOD app (unlike a
  // podcast/music player, where that'd be the point).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        flushOnClose();
        if (player.playing) player.pause();
        if (trailerPlayer.playing) trailerPlayer.pause();
      }
    });
    return () => sub.remove();
  });

  // Custom controls: auto-hide after a few seconds of inactivity, like every
  // other video app. The title only renders while these are visible.
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS);
  };
  const showControls = () => {
    setControlsVisible(true);
    resetHideTimer();
  };
  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);
  const toggleControls = () => {
    if (controlsVisible) {
      setControlsVisible(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      showControls();
    }
  };

  // YouTube-style double-tap left/right to seek 10s; a single tap on the same
  // zone just toggles the controls (with a short wait to see if a second tap
  // is coming).
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);
  const lastTap = useRef<{ left: number; right: number }>({ left: 0, right: 0 });
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seekBy = (delta: number) => {
    const target = Math.min(duration || player.duration || Number.MAX_SAFE_INTEGER, Math.max(0, player.currentTime + delta));
    // eslint-disable-next-line react-hooks/immutability -- imperative player handle, see VerticalVolumeBar.tsx
    player.currentTime = target;
    setPosition(target);
  };

  const handleZoneTap = (zone: 'left' | 'right') => {
    const now = Date.now();
    if (now - lastTap.current[zone] < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current[zone] = 0;
      seekBy(zone === 'left' ? -SEEK_SECONDS : SEEK_SECONDS);
      setSeekFlash(zone === 'left' ? 'back' : 'forward');
      setTimeout(() => setSeekFlash(null), 500);
      showControls();
    } else {
      lastTap.current[zone] = now;
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);

      if (!controlsVisible) {
        // Controls are hidden - bring them back immediately rather than
        // waiting out the double-tap window. The wait only exists so a
        // *visible* single tap doesn't hide controls out from under a
        // same-zone double-tap-to-seek gesture; there's no such tradeoff
        // when they're already hidden; this was the "hard to get controls
        // back" complaint - a real double-tap seek still works fine, since
        // lastTap.current is still recorded above for the next tap to check.
        showControls();
        return;
      }

      // singleTapTimer is shared across both zones - clearing above handles
      // alternating taps (left then right in quick succession) that would
      // otherwise schedule two toggleControls() calls firing back-to-back,
      // toggling visibility twice and leaving it shown or hidden at random.
      singleTapTimer.current = setTimeout(() => toggleControls(), DOUBLE_TAP_MS);
    }
  };

  const togglePlayPause = () => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  };

  const myListRef = useRef<View>(null);
  const [flyRun, setFlyRun] = useState(0);
  const [flyOrigin, setFlyOrigin] = useState({ x: 0, y: 0 });

  const toggleFavorite = async () => {
    const wasFavorited = !!favorite;

    // Optimistic update - My List should show this immediately, not after a
    // round-trip, and it also shields the tap from the FAVORITES POST
    // sometimes being a little slow on DEV.
    queryClient.setQueryData<FavoriteRow[]>(['favorites', userId], (old = []) =>
      wasFavorited
        ? old.filter((f) => f.CONTENT_ID !== contentId)
        : [...old, { FAVORITE_ID: -Date.now(), USER_ID: userId, CONTENT_ID: contentId }]
    );

    if (!wasFavorited) {
      myListRef.current?.measureInWindow((x, y, width, height) => {
        setFlyOrigin({ x: x + width / 2, y: y + height / 2 });
        setFlyRun((r) => r + 1);
      });
    }

    try {
      if (wasFavorited && favorite) {
        await removeFavorite({ USER_ID: userId, CONTENT_ID: contentId });
      } else {
        await addFavorite({ USER_ID: userId, CONTENT_ID: contentId });
      }
    } catch {
      // best-effort - the invalidate below reconciles either way
    } finally {
      queryClient.invalidateQueries({ queryKey: ['favorites', userId] });
    }
  };

  const onShare = () => {
    if (item) Share.share({ message: `Check out "${item.TITLE}" on DAE` }).catch(() => {});
  };

  if (isError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.notFoundText}>This title is no longer available.</Text>
          <Pressable onPress={() => router.back()} style={styles.notFoundBack} hitSlop={8}>
            <Text style={styles.notFoundBackText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading || !item) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={Colors.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  const videoPane = (
    <>
      {stage === 'trailer' && trailerSource && (
        <>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => (trailerPlayer.playing ? trailerPlayer.pause() : trailerPlayer.play())}
          >
            <VideoView style={StyleSheet.absoluteFill} player={trailerPlayer} nativeControls={false} />
          </Pressable>

          <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topScrim} pointerEvents="none" />
          <View style={styles.topBar} pointerEvents="box-none">
            <Pressable
              onPress={() => (isFullscreen ? setIsFullscreen(false) : router.back())}
              style={styles.iconBtn}
            >
              <Ionicons name={isFullscreen ? 'contract' : 'chevron-back'} size={22} color={Colors.text} />
            </Pressable>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              {item.TITLE} · Trailer
            </Text>
          </View>

          {/* Only needed in fullscreen - in the normal layout, "Watch Now"
              below the fold does the same job of jumping straight to the
              real video. */}
          {isFullscreen && (
            <Pressable onPress={startVideo} style={styles.watchFullBtn} hitSlop={8}>
              <Ionicons name="play" size={16} color={Colors.text} />
              <Text style={styles.watchFullBtnText}>Play Full Video</Text>
            </Pressable>
          )}

          <View style={styles.bottomBar} pointerEvents="box-none">
            <View style={styles.bottomIconsRow}>
              <Pressable onPress={() => setIsFullscreen((v) => !v)} style={styles.iconBtnSmall} hitSlop={12}>
                <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={18} color={Colors.text} />
              </Pressable>
            </View>
          </View>
        </>
      )}

      {stage === 'banner' && (
        <>
          <Image
            source={{ uri: bannerUri ?? thumbnailUrl(item.THUMBNAIL_URL) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <View style={[StyleSheet.absoluteFill, styles.bannerScrim]} pointerEvents="none" />
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.centerPlay} onPress={startVideo}>
            <View style={styles.centerPlayBtnBig}>
              <Ionicons name="play" size={36} color={Colors.text} />
            </View>
            {hasResume && <Text style={styles.resumeLabel}>Continue Watching</Text>}
          </Pressable>
        </>
      )}

      {stage === 'video' && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoFade }]}>
          {source ? (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={togglePlayPause}>
                <VideoView style={StyleSheet.absoluteFill} player={player} nativeControls={false} />
              </Pressable>

              {/* Double-tap left/right to seek, single tap toggles controls */}
              <View style={styles.tapZones} pointerEvents="box-none">
                {/* eslint-disable-next-line react-hooks/immutability -- handleZoneTap seeks the player, see VerticalVolumeBar.tsx */}
                <Pressable style={styles.tapZone} onPress={() => handleZoneTap('left')} />
                <View style={styles.tapZoneCenter} pointerEvents="none" />
                <Pressable style={styles.tapZone} onPress={() => handleZoneTap('right')} />
              </View>

              {seekFlash && (
                <View style={[styles.seekFlash, seekFlash === 'back' ? { left: '18%' } : { right: '18%' }]} pointerEvents="none">
                  <Ionicons name={seekFlash === 'back' ? 'play-back' : 'play-forward'} size={22} color={Colors.text} />
                  <Text style={styles.seekFlashText}>10s</Text>
                </View>
              )}

              {status === 'loading' && (
                <View style={[StyleSheet.absoluteFill, styles.processingOverlay]} pointerEvents="none">
                  <ActivityIndicator color={Colors.text} />
                </View>
              )}
              {status === 'error' && (
                <View style={[StyleSheet.absoluteFill, styles.processingOverlay]} pointerEvents="none">
                  <Text style={styles.processingText}>{playerError?.message ?? 'Could not play this video'}</Text>
                </View>
              )}

              {controlsVisible && !videoFinished && (
                <>
                  <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topScrim} pointerEvents="none" />
                  <View style={styles.topBar} pointerEvents="box-none">
                    <Pressable
                      onPress={() => (isFullscreen ? setIsFullscreen(false) : router.back())}
                      style={styles.iconBtn}
                    >
                      <Ionicons name={isFullscreen ? 'contract' : 'chevron-back'} size={22} color={Colors.text} />
                    </Pressable>
                    <Image source={logoSource} style={styles.topBarLogo} contentFit="contain" />
                    <View style={styles.topBarDivider} />
                    <Text style={styles.topBarTitle} numberOfLines={1}>
                      {item.TITLE}
                    </Text>
                  </View>

                  {status !== 'loading' && (
                    <Pressable style={styles.centerPlay} onPress={togglePlayPause} pointerEvents="box-none">
                      <View style={styles.centerPlayBtn}>
                        <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color={Colors.text} />
                      </View>
                    </Pressable>
                  )}

                  {/* Fullscreen only: the full vertical slider is ~162px tall,
                      and the compact non-fullscreen player's video box is
                      barely taller than that - a vertically-centered bar on
                      either edge collides with the top bar and/or the bottom
                      icon row there, and is fiddly to grab in that little
                      space. Fullscreen has the room; the compact view gets a
                      plain mute toggle in the bottom row instead (below). */}
                  {isFullscreen && (
                    <View style={styles.volumeBarWrap} pointerEvents="box-none">
                      <VerticalVolumeBar volume={volume} muted={muted} onChange={applyVolume} onToggleMute={toggleMute} />
                    </View>
                  )}

                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.bottomScrim} pointerEvents="none" />
                  <View style={styles.bottomBar} pointerEvents="box-none">
                    <View style={styles.seekRow}>
                      <Text style={styles.timeText}>{formatTime(position)}</Text>
                      <Slider
                        style={styles.slider}
                        minimumValue={0}
                        maximumValue={duration || 1}
                        value={position}
                        minimumTrackTintColor={Colors.accent}
                        maximumTrackTintColor="rgba(255,255,255,0.3)"
                        thumbTintColor={Colors.accent}
                        onSlidingStart={() => setSeeking(true)}
                        onValueChange={setPosition}
                        onSlidingComplete={(v) => {
                          // eslint-disable-next-line react-hooks/immutability -- imperative player handle, see VerticalVolumeBar.tsx
                          player.currentTime = v;
                          setSeeking(false);
                          showControls();
                        }}
                      />
                      <Text style={styles.timeText}>{formatTime(duration)}</Text>
                    </View>
                    <View style={styles.bottomIconsRow}>
                      {/* Compact-mode stand-in for the full volume slider
                          (fullscreen-only, see above) - a plain mute toggle,
                          same size/hit-area as the fullscreen button next to
                          it rather than the cramped rotated slider. */}
                      {!isFullscreen && (
                        <Pressable onPress={toggleMute} style={styles.iconBtnSmall} hitSlop={12}>
                          <Ionicons
                            name={muted || volume === 0 ? 'volume-mute' : volume < 0.5 ? 'volume-low' : 'volume-high'}
                            size={18}
                            color={Colors.text}
                          />
                        </Pressable>
                      )}
                      {/* Was two buttons doing the exact same toggle - the one at
                          the very screen edge was an easy miss/mistap (or eaten
                          by Android's edge back-gesture zone in landscape). One
                          bigger button, pulled in from the edge, with a larger
                          hit area. */}
                      <Pressable onPress={() => setIsFullscreen((v) => !v)} style={styles.iconBtnSmall} hitSlop={12}>
                        <Ionicons name={isFullscreen ? 'contract-outline' : 'expand-outline'} size={18} color={Colors.text} />
                      </Pressable>
                    </View>
                  </View>
                </>
              )}

              {videoFinished && (
                <View style={[StyleSheet.absoluteFill, styles.finishedOverlay]}>
                  <Pressable onPress={() => router.back()} style={[styles.iconBtn, styles.finishedBackBtn]}>
                    <Ionicons name="chevron-back" size={22} color={Colors.text} />
                  </Pressable>

                  {watchNextItem && (
                    <Pressable
                      style={styles.watchNextCard}
                      onPress={() =>
                        router.replace({ pathname: '/content/[id]', params: { id: String(watchNextItem.CONTENT_ID) } })
                      }
                    >
                      <Text style={styles.watchNextLabel}>Watch Next</Text>
                      <View style={styles.watchNextThumbWrap}>
                        <Image
                          source={{ uri: thumbnailUrl(watchNextItem.THUMBNAIL_URL) }}
                          style={styles.watchNextThumb}
                          contentFit="cover"
                        />
                        <View style={styles.watchNextPlayBadge}>
                          <Ionicons name="play" size={20} color={Colors.text} />
                        </View>
                      </View>
                      <Text style={styles.watchNextTitle} numberOfLines={1}>
                        {watchNextItem.TITLE}
                      </Text>
                    </Pressable>
                  )}

                  <View style={styles.finishedActions}>
                    <Pressable
                      style={styles.finishedBtn}
                      onPress={() => {
                        // Reset local progress immediately rather than
                        // waiting for the next `timeUpdate` tick to overwrite
                        // it - an instant back-navigation right after this
                        // tap (before any tick lands) would otherwise leave
                        // the just-finished PROGRESS:100/FINISHED:true entry
                        // in place, so reopening would land back on the
                        // finished screen instead of a fresh replay.
                        progressRef.current = 0;
                        setVideoFinished(false);
                        setLocalProgress({
                          CONTENT_ID: contentId,
                          USER_ID: userId,
                          PROGRESS: 0,
                          FINISHED: false,
                          TITLE: item?.TITLE,
                          THUMBNAIL_URL: item?.THUMBNAIL_URL,
                          DURATION: item?.DURATION,
                          CATEGORY_ID: item?.CATEGORY_ID,
                          UPDATED_AT: Date.now(),
                        });
                        // eslint-disable-next-line react-hooks/immutability -- imperative player handle, see VerticalVolumeBar.tsx
                        player.currentTime = 0;
                        player.play();
                        showControls();
                      }}
                    >
                      <Ionicons name="refresh" size={20} color={Colors.text} />
                      <Text style={styles.finishedBtnText}>Watch Again</Text>
                    </Pressable>
                    <Pressable style={styles.finishedBtn} onPress={() => router.replace('/(tabs)')}>
                      <Ionicons name="home-outline" size={20} color={Colors.text} />
                      <Text style={styles.finishedBtnText}>Home</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </>
          ) : (
            <>
              <Image source={{ uri: thumbnailUrl(item.THUMBNAIL_URL) }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={[StyleSheet.absoluteFill, styles.processingOverlay]}>
                <Text style={styles.processingText}>Video not available yet</Text>
              </View>
              <Pressable onPress={() => router.back()} style={styles.iconBtn}>
                <Ionicons name="chevron-back" size={22} color={Colors.text} />
              </Pressable>
            </>
          )}
        </Animated.View>
      )}

      {stage === null && (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.text} />
        </View>
      )}
    </>
  );

  if (isFullscreen) {
    return (
      <View style={styles.fullscreenWrap}>
        <StatusBar hidden />
        {videoPane}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlyToListIcon startX={flyOrigin.x} startY={flyOrigin.y} runId={flyRun} />
      <View style={styles.videoWrap}>{videoPane}</View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{item.TITLE}</Text>
        <Text style={styles.meta}>
          {[item.GENRE, item.DURATION, item.RELEASE_DATE].filter(Boolean).join(' · ')}
        </Text>

        <View style={styles.actions}>
          <View ref={myListRef} collapsable={false}>
            <ActionButton
              icon={favorite ? 'bookmark' : 'bookmark-outline'}
              label="My List"
              active={!!favorite}
              onPress={toggleFavorite}
            />
          </View>
          <ActionButton
            icon={liked ? 'heart' : 'heart-outline'}
            label="Like"
            active={liked}
            onPress={() => setLiked((v) => !v)}
          />
          <ActionButton icon="share-outline" label="Share" onPress={onShare} />
          {!!videoUri && stage !== 'video' && (
            <ActionButton
              icon={hasResume ? 'play-skip-forward-outline' : 'play-circle-outline'}
              label={hasResume ? 'Continue Watching' : 'Watch Now'}
              onPress={startVideo}
            />
          )}
        </View>

        {!!item.DESCRIPTION && <Text style={styles.desc}>{item.DESCRIPTION}</Text>}

        {relatedAll.length > 0 && (
          <View style={{ marginTop: Spacing.lg }}>
            <ContentRow title="More Like This" items={relatedAll} />
          </View>
        )}
        <View style={{ height: Spacing.xxl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionBtn}>
      <Ionicons name={icon} size={22} color={active ? Colors.accent : Colors.textDim} />
      <Text style={[styles.actionLabel, active && { color: Colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundText: { color: Colors.text, fontSize: FontSize.md, marginBottom: Spacing.lg, paddingHorizontal: Spacing.xl, textAlign: 'center' },
  notFoundBack: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: Radius.md, backgroundColor: Colors.surface2 },
  notFoundBackText: { color: Colors.accent, fontSize: FontSize.sm, fontWeight: '700' },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  fullscreenWrap: { flex: 1, backgroundColor: '#000' },

  tapZones: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
  tapZone: { flex: 1 },
  tapZoneCenter: { flex: 1 },

  seekFlash: {
    position: 'absolute',
    top: '42%',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  seekFlashText: { color: Colors.text, fontSize: FontSize.xs, fontWeight: '700' },

  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 80 },
  topBar: {
    position: 'absolute',
    top: 14,
    left: 12,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  topBarTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.sm,
    fontWeight: '900',
    // '900' is already the heaviest system font-weight step - this faux-bold
    // stroke (a same-color text-shadow with no blur) pushes it visibly
    // thicker still, since there's no heavier weight to fall back on without
    // bundling a custom font family.
    textShadowColor: Colors.text,
    textShadowOffset: { width: 0.6, height: 0 },
    textShadowRadius: 0.6,
  },
  topBarLogo: { width: 20, height: 20 },
  // accent2 (#8b7cf6) is the purple pulled straight from the logo mark's arc.
  topBarDivider: { width: 4, height: 20, borderRadius: 2, backgroundColor: Colors.accent2 },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.pill,
  },

  centerPlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerPlayBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  centerPlayBtnBig: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  resumeLabel: { color: Colors.text, fontSize: FontSize.xs, fontWeight: '700', marginTop: Spacing.sm },
  bannerScrim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  watchFullBtn: {
    position: 'absolute',
    top: 14,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: Radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  watchFullBtnText: { color: Colors.text, fontSize: 12, fontWeight: '700' },

  finishedOverlay: {
    backgroundColor: 'rgba(10,10,14,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  finishedBackBtn: { position: 'absolute', top: 14, left: 12 },
  watchNextCard: { alignItems: 'center', width: 220 },
  watchNextLabel: {
    color: Colors.textDim,
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  watchNextThumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface2,
  },
  watchNextThumb: { width: '100%', height: '100%' },
  watchNextPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  watchNextTitle: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700', marginTop: Spacing.sm },
  finishedActions: { flexDirection: 'row', gap: Spacing.md },
  finishedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surface2,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  finishedBtnText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '700' },

  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 90 },
  // Pulled in from the raw edges (was 2/8px) so the fullscreen button isn't
  // sitting where a rounded corner or the OS edge-gesture zone can eat taps.
  bottomBar: { position: 'absolute', left: Spacing.md, right: Spacing.md, bottom: 12 },
  seekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  slider: { flex: 1, height: 28 },
  timeText: { color: Colors.text, fontSize: 10.5, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  bottomIconsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.xs, marginTop: -4 },
  // Fullscreen-only (see the isFullscreen check above). Anchored to both top
  // and bottom rather than percentage-centered with a fixed translateY - the
  // latter is exactly the bug that made the portrait volume bar collide with
  // the top/bottom bars (centering math that assumed a tall-enough box
  // instead of guaranteeing clearance). Stretching between two margins that
  // clear the top bar (~46px tall) and bottom bar (~70px tall) and centering
  // the bar within that gap holds regardless of the actual landscape height.
  volumeBarWrap: {
    position: 'absolute',
    top: 60,
    bottom: 80,
    right: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSmall: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.pill,
    padding: 6,
  },

  processingOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  processingText: { color: Colors.text, fontSize: FontSize.sm, fontWeight: '600' },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 110 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '800', marginBottom: 6 },
  meta: { color: Colors.textDim, fontSize: 12, marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', gap: 22, marginBottom: 18 },
  actionBtn: { alignItems: 'center', gap: 5 },
  actionLabel: { color: Colors.textDim, fontSize: 11, fontWeight: '600' },
  desc: { color: '#ccced6', fontSize: 13, lineHeight: 20, marginBottom: 18 },
});
