import { useState, useEffect } from 'react';

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
 * Returns prioritized candidates for an image source to maximize display reliability.
 */
export function getImageCandidates(src: string | undefined | null): string[] {
  if (!src) return [];
  const str = String(src).trim();
  if (!str) return [];

  // Base64 data URLs don't need fallbacks
  if (str.startsWith('data:image/')) {
    return [str];
  }

  const driveId = extractGoogleDriveFileId(str);
  if (driveId) {
    return [
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
      `https://lh3.googleusercontent.com/d/${driveId}`,
      `https://drive.google.com/uc?export=view&id=${driveId}`,
      `https://drive.google.com/uc?id=${driveId}`,
    ];
  }

  const candidates: string[] = [];

  // Upgrade http to https first
  if (str.startsWith('http://')) {
    candidates.push(str.replace('http://', 'https://'));
    candidates.push(str);
  } else if (str.startsWith('//')) {
    candidates.push(`https:${str}`);
  } else if (str.startsWith('www.')) {
    candidates.push(`https://${str}`);
  } else {
    candidates.push(str);
  }

  // Dropbox
  if (str.includes('dropbox.com') && !str.includes('raw=1')) {
    const rawVersion = str.includes('dl=0')
      ? str.replace('dl=0', 'raw=1')
      : str + (str.includes('?') ? '&raw=1' : '?raw=1');
    candidates.unshift(rawVersion);
  }

  // Fast image proxy (wsrv.nl) fallback for public web URLs:
  // Solves 403 Forbidden, hotlink protection, mixed content, or CORS blocking by store servers
  const httpsVersion = candidates.find((c) => c.startsWith('https://') || c.startsWith('http://'));
  if (httpsVersion && !httpsVersion.includes('wsrv.nl') && !httpsVersion.includes('weserv.nl') && !httpsVersion.startsWith('data:image/')) {
    candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(httpsVersion)}&output=webp`);
  }

  return [...new Set(candidates)];
}

/**
 * React hook that attempts multiple fallback URLs before giving up on an image.
 */
export function useResilientImage(src: string | undefined | null) {
  const candidates = getImageCandidates(src);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset whenever src changes
  useEffect(() => {
    setCandidateIndex(0);
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  const currentSrc = candidates[candidateIndex] || '';

  const handleError = () => {
    if (candidateIndex < candidates.length - 1) {
      setCandidateIndex((prev) => prev + 1);
    } else {
      setHasError(true);
    }
  };

  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  return {
    currentSrc,
    hasError: hasError || !src || candidates.length === 0,
    isLoaded,
    handleError,
    handleLoad,
  };
}
