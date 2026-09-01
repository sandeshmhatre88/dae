// See backend/API_CONTRACT.md at the repo root for the full endpoint reference.
export const APP_API_BASE = 'https://7u0ipdn1ub.execute-api.ap-south-1.amazonaws.com/DEV';

// CONTENT.THUMBNAIL_URL/BANNER_URL/TRAILER_URL come back from the API already
// fully-qualified (the caching pipeline prefixes them at generation time) -
// VIDEO_URL is the one exception, always a bare relative key. Both shapes are
// handled defensively here rather than assumed, since a bare key vs a full
// URL isn't visually distinguishable in the Lambda source and got this mixed
// up server-side once already (see CONTENT.py's fixed double-prefix bug).
export const META_CDN_BASE = 'https://da0q72vg4jh6n.cloudfront.net';
export const VIDEO_CDN_BASE = 'https://doi3m1t3ui536.cloudfront.net';

function encodeKey(key: string) {
  // Real media filenames contain spaces (e.g. "1/ekvira promo new.m3u8") -
  // encode each path segment, not the slashes between them.
  return key.split('/').map(encodeURIComponent).join('/');
}

function resolveUrl(value: string | null | undefined, base: string) {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}/${encodeKey(value)}`;
}

export function thumbnailUrl(value?: string | null) {
  return resolveUrl(value, `${META_CDN_BASE}/THUMBNAILS`);
}
export function bannerUrl(value?: string | null) {
  return resolveUrl(value, `${META_CDN_BASE}/BANNERS`);
}
export function trailerUrl(value?: string | null) {
  return resolveUrl(value, `${META_CDN_BASE}/TRAILER`);
}
export function videoUrl(value?: string | null) {
  return resolveUrl(value, VIDEO_CDN_BASE);
}

// The video CDN requires CloudFront signed cookies (see LOGIN.py's
// sign_cloudfront_cookies()) - there's no custom domain shared with the API,
// so a real browser Set-Cookie flow isn't usable. Instead the three values
// come back as ordinary JSON fields on the session and get attached here as
// a manual Cookie header on the video player's request (expo-video's
// VideoSource.headers - see content/[id].tsx).
export function videoHeaders(session?: {
  CloudFrontPolicy?: string;
  CloudFrontSignature?: string;
  CloudFrontKeyPairId?: string;
} | null): Record<string, string> | undefined {
  if (!session?.CloudFrontPolicy || !session.CloudFrontSignature || !session.CloudFrontKeyPairId) return undefined;
  return {
    Cookie:
      `CloudFront-Policy=${session.CloudFrontPolicy}; ` +
      `CloudFront-Signature=${session.CloudFrontSignature}; ` +
      `CloudFront-Key-Pair-Id=${session.CloudFrontKeyPairId}`,
  };
}
