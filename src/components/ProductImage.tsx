import React, { useEffect, useRef } from 'react';
import { useResilientImage } from '../utils/imageHelper';
interface ProductImageProps {
  src?: string | null; alt?: string; className?: string;
  fallbackIconSize?: string; showEmptyText?: boolean;
  loading?: 'lazy' | 'eager'; onUnavailable?: () => void;
}
export const ProductImage: React.FC<ProductImageProps> = ({
  src, alt = '', className = 'w-full h-full object-cover',
  loading = 'lazy', onUnavailable,
}) => {
  const { currentSrc, hasError, handleError, handleLoad } = useResilientImage(src);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) handleLoad();
  }, [currentSrc, handleLoad]);
  useEffect(() => { if (hasError) onUnavailable?.(); }, [hasError, onUnavailable]);
  if (!currentSrc || hasError) return null;
  const isSameOriginProxy = currentSrc.startsWith('/api/');
  return <img key={currentSrc} ref={imgRef} src={currentSrc} alt={alt}
    loading={loading} decoding="async" className={className}
    referrerPolicy={isSameOriginProxy ? undefined : 'no-referrer'}
    onLoad={handleLoad} onError={handleError} />;
};
