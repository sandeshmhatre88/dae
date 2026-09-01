import { api } from './client';
import type {
  Advertisement,
  Banner,
  Category,
  ContentItem,
  LandingPageRows,
  LoginSuccess,
  OtpInitiateResult,
  Plan,
  SignupResult,
} from './types';

// ---- Auth (all NONE-auth endpoints - see backend/API_CONTRACT.md) ----------

export function signup(input: {
  FULL_NAME: string;
  PHONE_NUMBER: string;
  DEVICE_TITLE: string;
  DEVICE_ID: string;
  EMAIL?: string;
  DATE_OF_BIRTH?: string;
}) {
  return api.post<SignupResult>('/USERS', input, false);
}

export function initiateOtpLogin(phoneNumber: string) {
  return api.post<OtpInitiateResult>('/USERS/LOGIN', { USER_ID: phoneNumber }, false);
}

export function verifyOtpLogin(input: { userId: string; session: string; otp: string }) {
  return api.post<LoginSuccess | OtpInitiateResult>(
    '/USERS/LOGIN',
    { USER_ID: input.userId, SESSION: input.session, OTP: input.otp },
    false
  );
}

// Silent refresh - only needs the refresh token (see backend/lambdas/LOGIN.py
// refresh_tokens(), which now decodes the fresh IdToken's own claims instead
// of requiring the caller's Cognito username back).
export function refreshLogin(refreshToken: string) {
  return api.post<LoginSuccess>('/USERS/LOGIN', { REFRESH_TOKEN: refreshToken }, false);
}

// Updates the caller's own profile fields (see backend/lambdas/USERS.py PUT).
// PHONE_NUMBER is deliberately never sent from here - changing it goes
// through a separate legacy OTP-verification path this screen doesn't use;
// the app only ever displays the number, never edits it.
export function updateProfile(input: { USER_ID: number; FULL_NAME?: string; DATE_OF_BIRTH?: string; GENDER?: string }) {
  return api.put('/USERS', input);
}

// Permanently deletes the caller's own account - identity comes from the
// caller's own Cognito session (see backend/lambdas/DELETE_ACCOUNT.py), not a
// body field, so there's no USER_ID here. Throws ApiError on failure.
export function deleteAccount() {
  return api.patch<Record<string, never>>('/DELETE_ACCOUNT', {});
}

// ---- Catalog (all require a logged-in session's IdToken) -------------------

export function getLandingPage(input: { userId: number; search?: string; categoryId?: number; start?: number }) {
  return api.post<LandingPageRows>('/LANDING_PAGE', {
    USER_ID: String(input.userId),
    SEARCH: input.search ?? '',
    CATEGORY_ID: input.categoryId !== undefined ? String(input.categoryId) : '',
    START: input.start !== undefined ? String(input.start) : '',
  });
}

export function getCatalog() {
  return api.get<ContentItem[] | { source: string }>('/CONTENT');
}

export function getContentDetail(contentId: number, userId?: number) {
  return api.get<ContentItem>('/CONTENT', { CONTENT_ID: contentId, USER_ID: userId });
}

export function getCategories() {
  return api.get<Category[]>('/CATEGORIES');
}

export function getBanners() {
  return api.get<Banner[]>('/CONTENT/BANNERS');
}

export function getAdvertisements() {
  return api.get<Advertisement[]>('/ADVERTISEMENTS');
}

export function getPlans() {
  return api.get<Plan[]>('/PLANS');
}

// ---- Watch progress / favorites (My List) / ratings ------------------------
//
// CONTENT_VIEW's three methods aren't three flavors of the same call - each
// hits a different path server-side (see backend/lambdas/CONTENT_VIEW.py):
//   POST  - "did playback start" check (live DB read the first time only,
//           cache hit after) + returns resume metadata. Call ONCE per
//           video-open, never on an interval - it does not accept PROGRESS.
//   PUT   - queues a progress update (SQS, no direct DB write). Call this
//           for periodic/pause syncs.
//   PATCH - queues a "finished" event (SQS). Call once, on natural completion.

export type WatchSessionInfo = {
  TITLE: string;
  SUB_TITLE?: string;
  LAST_WATCH_PROGRESS: string;
  VIDEO_URL: string;
};

export function startWatchSession(input: { CONTENT_ID: number; USER_ID: number }) {
  return api.post<WatchSessionInfo>('/CONTENT/VIEW', input);
}

export function syncWatchProgress(input: {
  CONTENT_ID: number;
  USER_ID: number;
  PROGRESS: number;
  /** Set true on pause/close syncs so Continue Watching updates promptly;
   * leave false for the frequent periodic tick (DB checkpoint only, no
   * per-user cache rewrite) - see backend/CACHING.md. */
  refreshCache?: boolean;
}) {
  return api.put('/CONTENT/VIEW', {
    CONTENT_ID: input.CONTENT_ID,
    USER_ID: input.USER_ID,
    PROGRESS: input.PROGRESS,
    REFRESH_CACHE: input.refreshCache ?? false,
  });
}

export function markWatchFinished(input: { CONTENT_ID: number; USER_ID: number }) {
  return api.patch('/CONTENT/VIEW', input);
}

export function rateContent(input: { CONTENT_ID: number; USER_ID: number; RATING: number; REVIEW?: string }) {
  return api.put('/CONTENT_RATINGS', input);
}

export type FavoriteRow = { FAVORITE_ID: number; USER_ID: number; CONTENT_ID: number; ADDED_AT?: string };

export function getFavorites(userId: number) {
  return api.get<FavoriteRow[]>('/FAVORITES', { USER_ID: userId });
}

export function addFavorite(input: { USER_ID: number; CONTENT_ID: number }) {
  return api.post('/FAVORITES', input);
}

export function removeFavorite(input: { USER_ID: number; CONTENT_ID: number }) {
  // Deletes by the (USER_ID, CONTENT_ID) pair, not FAVORITE_ID - the queued
  // backend (see FAVORITES.py) processes adds asynchronously, so a
  // just-added favorite's real FAVORITE_ID may not exist yet if the user
  // un-likes it right away. USER_ID/CONTENT_ID are always known immediately
  // from screen context.
  return api.delete('/FAVORITES', input);
}
