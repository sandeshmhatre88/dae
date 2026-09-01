export type ContentItem = {
  CONTENT_ID: number;
  TITLE: string;
  SUB_TITLE?: string;
  DESCRIPTION?: string;
  GENRE?: string;
  LANGUAGE?: string;
  CATEGORY?: string;
  VIEW_CATEGORY?: string;
  CATEGORY_ID?: number;
  THUMBNAIL_URL?: string;
  BANNER_URL?: string;
  TRAILER_URL?: string;
  VIDEO_URL?: string;
  DURATION?: string;
  RELEASE_DATE?: string;
  DEFAULT_RATING?: string | number;
  LAST_WATCHED_PROGRESS?: number;
};

// LANDING_PAGE groups rows by VIEW_CATEGORY, e.g. "Continue Watching", "Newly Added",
// "<language> <category>", "Watch Again".
export type LandingPageRows = Record<string, ContentItem[]>;

export type Category = {
  CATEGORY_ID: number;
  CATEGORY_NAME: string;
  DESCRIPTION?: string;
};

export type Plan = {
  PLAN_ID: number;
  TITLE: string;
  PRICE?: number;
  VALIDITY?: string;
};

export type Advertisement = {
  ADVT_ID: number;
  TITLE?: string;
  IMG_URL: string;
  START_DATE?: string;
  END_DATE?: string;
};

export type Banner = {
  CONTENT_ID: number;
  TITLE: string;
  DESCRIPTION?: string;
  RELEASE_DATE?: string;
};

export type OtpInitiateResult = {
  SESSION: string;
  USER_ID: string;
  // TEMPORARY DEBUG - raw kutility.org SMS gateway response, surfaced on the
  // OTP screen while diagnosing delivery. Remove (here and in
  // backend/lambdas/CREATE_AUTH_CHALLENGE.py + LOGIN.py) once confirmed working.
  SMS_DEBUG?: string;
};

export type UserDevice = {
  UD_ID: number;
  USER_ID: number;
  DEVICE_TITLE: string;
  DEVICE_ID: string;
  ACTIVE: number;
};

export type LoginSuccess = {
  USER_ID: number;
  FULL_NAME?: string;
  USER_NAME?: string;
  EMAIL?: string | null;
  PHONE_NUMBER?: string;
  DATE_OF_BIRTH?: string | null;
  GENDER?: string | null;
  ACTIVE?: string;
  PLAN_ID?: string;
  PLAN?: string;
  SUBSCRIPTION_VALID?: string;
  SUBSCRIPTION_VALID_TILL?: string;
  DEVICES?: UserDevice[];
  IdToken: string;
  AccessToken: string;
  RefreshToken: string;
  // CloudFront signed-cookie values scoped to the whole video CDN (session-
  // scoped, re-minted on every login/refresh - see backend/lambdas/LOGIN.py
  // sign_cloudfront_cookies()). Absent until the backend's CloudFront key
  // group is configured (CLOUDFRONT_KEY_PAIR_ID env var).
  CloudFrontPolicy?: string;
  CloudFrontSignature?: string;
  CloudFrontKeyPairId?: string;
};

export type SignupResult = {
  USER_ID: number;
  FULL_NAME: string;
};
