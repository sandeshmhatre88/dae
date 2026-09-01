import type { ContentItem } from './types';

// GET /CONTENT (no id) returns a cached JSON array most of the time, but falls
// back to a raw DB query shape when the cache miss - both get an extra
// "source" key mixed in by the Lambda. Normalize defensively rather than
// assume one exact shape.
export function asContentArray(data: unknown): ContentItem[] {
  if (Array.isArray(data)) {
    return data.filter((v): v is ContentItem => !!v && typeof v === 'object' && 'CONTENT_ID' in v);
  }
  if (data && typeof data === 'object') {
    return Object.values(data).filter(
      (v): v is ContentItem => !!v && typeof v === 'object' && 'CONTENT_ID' in v
    );
  }
  return [];
}
