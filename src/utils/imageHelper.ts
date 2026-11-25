import { useState, useEffect, useMemo, useCallback } from 'react';

export type ImageCandidateStrategy =
  | 'data-url'
  | 'drive-thumb'
  | 'drive-lh3'
  | 'drive-uc-view'
  | 'drive-uc'
  | 'supabase-object'
  | 'wsrv-object'
  | 'proxy-object'
  | 'original'
  | 'original-http'
  | 'dropbox-raw'
  | 'wsrv-original'
  | 'proxy-original';

export interface ImageCandidate {
  url: string;
  strategy: ImageCandidateStrategy;
  host?: string;
}

const SUPABASE_TRANSFORM_PARAMS = ['width', 'height', 'resize', 'quality', 'format'];

/**
 * In-memory per-host strategy cache.
 * When the first image from a domain succeeds via a specific strategy (e.g., direct `/object/public/`
 * or `/api/image-proxy`), subsequent images from the same host immediately prioritize that route,
 * preventing hundreds of redundant failed requests across large product grids.
 */
const hostPreferredStrategy = new Map<string, ImageCandidateStrategy>();

function extractHost(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

/**
 * Extracts a Google Drive file ID from various URL formats.
 */
export function extractGoogleDriveFileId(url: string): string | null {
  if (!url) return null;
  const str = String(url);

  // Format 1: drive.google.com/file/d/FILE_ID/...
  const fileMatch = str.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (fileMatch && fileMatch[1]) return fileMatch[1];

  // Format 2: drive.google.com/open?id=FILE_ID or ?id=FILE_ID or &id=FILE_ID
  const idMatch = str.match(/drive\.google\.com\/.*?[\?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1]) return idMatch[1];

  // Format 3: docs.google.com/uc?id=FILE_ID
  const docsMatch = str.match(/docs\.google\.com\/.*?[\?&]id=([a-zA-Z0-9_-]+)/i);
  if (docsMatch && docsMatch[1]) return docsMatch[1];

  // Format 4: lh3.googleusercontent.com/d/FILE_ID
  const lh3Match = str.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i);
  if (lh3Match && lh3Match[1]) return lh3Match[1];

  return null;
}

/**
 * Converts Supabase Storage Image Transformation URLs (`/storage/v1/render/image/public/...`)
 * into direct public object URLs (`/storage/v1/object/public/...`), stripping transformation
 * query parameters (`width`, `height`, `resize`, `quality`, `format`) that require paid
 * transformation quota and often fail with 400/402/403 when exhausted or disabled.
 */
export function normalizeSupabaseStorageImageUrl(url: string): string | null {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed.includes('/storage/v1/render/image/')) return null;

  try {
    const normalizedInput = trimmed.startsWith('//')
      ? `https:${trimmed}`
      : trimmed.startsWith('http://')
      ? trimmed.replace('http://', 'https://')
      : trimmed;

    const parsed = new URL(normalizedInput);
    if (!parsed.pathname.includes('/storage/v1/render/image/')) {
      return null;
    }

    parsed.pathname = parsed.pathname.replace(
      '/storage/v1/render/image/',
      '/storage/v1/object/'
    );

    for (const param of SUPABASE_TRANSFORM_PARAMS) {
      parsed.searchParams.delete(param);
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Returns the cleanest direct external URL for sharing or visual search (e.g., Google Lens).
 * Automatically rewrites Supabase `/render/image/` URLs to direct `/object/` URLs so external
 * tools can fetch the photo reliably.
 */
export function getBestExternalImageUrl(src: string | undefined | null): string {
  if (!src) return '';
  const str = String(src).trim();
  if (!str) return '';

  if (str.startsWith('data:image/')) return str;

  const driveId = extractGoogleDriveFileId(str);
  if (driveId) {
    return `https://lh3.googleusercontent.com/d/${driveId}`;
  }

  const supabaseObjectUrl = normalizeSupabaseStorageImageUrl(str);
  if (supabaseObjectUrl) {
    // Supplier storage hosts may reject browser requests due to TLS, hotlink rules or CDN behavior.
    // Prefer the same-origin Pages Function so the browser receives the image from this app's domain.
    pushUnique(
      `/api/image-proxy?url=${encodeURIComponent(supabaseObjectUrl)}`,
      'proxy-object'
    );

    // Preserve the original render endpoint as a fallback for providers that require it.
    pushUnique(normalizedOriginal, 'original');

    // Direct public object URL remains available as a fallback.
    pushUnique(supabaseObjectUrl, 'supabase-object');

    pushUnique(
      `https://wsrv.nl/?url=${encodeURIComponent(supabaseObjectUrl)}&w=640&q=75&output=webp`,
      'wsrv-object'
    );

    pushUnique(
      `https://wsrv.nl/?url=${encodeURIComponent(normalizedOriginal)}`,
      'wsrv-original'
    );

    pushUnique(
      `/api/image-proxy?url=${encodeURIComponent(normalizedOriginal)}`,
      'proxy-original'
    );
  } else {
    // Standard external image URL directly first, then proxies as fallbacks.
    pushUnique(normalizedOriginal, 'original');

    if (httpFallback) {
      pushUnique(httpFallback, 'original-http');
    }

    if (!isAlreadyProxy && (normalizedOriginal.startsWith('https://') || normalizedOriginal.startsWith('http://'))) {
      pushUnique(
        `https://wsrv.nl/?url=${encodeURIComponent(normalizedOriginal)}&w=640&q=75&output=webp`,
        'wsrv-original'
      );
      pushUnique(
        `/api/image-proxy?url=${encodeURIComponent(normalizedOriginal)}`,
        'proxy-original'
      );
    }
  }

  return applyHostPreference(candidates, host);
}

function applyHostPreference(
  candidates: ImageCandidate[],
  host?: string
): ImageCandidate[] {
  if (!host || candidates.length <= 1) return candidates;
  const preferred = hostPreferredStrategy.get(host);
  if (!preferred) return candidates;

  const preferredIdx = candidates.findIndex((c) => c.strategy === preferred);
  if (preferredIdx <= 0) return candidates;

  return [
    candidates[preferredIdx],
    ...candidates.slice(0, preferredIdx),
    ...candidates.slice(preferredIdx + 1),
  ];
}

/**
 * Returns prioritized URL strings for an image source to maximize display reliability.
 */
export function getImageCandidates(src: string | undefined | null): string[] {
  return getImageCandidateEntries(src).map((c) => c.url);
}

/**
 * React hook that attempts multiple fallback URLs before giving up on an image,
 * remembering the winning delivery strategy per host during the session.
 */
export function useResilientImage(src: string | undefined | null) {
  const candidates = useMemo(() => getImageCandidateEntries(src), [src]);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset whenever src changes
  useEffect(() => {
    setCandidateIndex(0);
    setIsLoaded(false);
  }, [src]);

  const activeCandidate = candidateIndex < candidates.length ? candidates[candidateIndex] : null;
  const currentSrc = activeCandidate?.url || '';
  const hasError = !src || candidates.length === 0 || candidateIndex >= candidates.length;

  const handleError = useCallback(() => {
    setIsLoaded(false);
    setCandidateIndex((prev) => (prev < candidates.length ? prev + 1 : prev));
  }, [candidates.length]);

  const handleLoad = useCallback(() => {
    if (activeCandidate?.host && activeCandidate.strategy !== 'data-url') {
      hostPreferredStrategy.set(activeCandidate.host, activeCandidate.strategy);
    }
    setIsLoaded(true);
  }, [activeCandidate]);

  return {
    currentSrc,
    hasError,
    isLoaded,
    handleError,
    handleLoad,
  };
}
