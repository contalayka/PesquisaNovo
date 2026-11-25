import React, { useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useResilientImage } from '../utils/imageHelper';

interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackIconSize?: string;
  showEmptyText?: boolean;
  loading?: 'lazy' | 'eager';
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt = '',
  className = 'w-full h-full object-cover',
  fallbackIconSize = 'w-6 h-6',
  showEmptyText = false,
  loading = 'lazy',
}) => {
  const { currentSrc, hasError, handleError, handleLoad } = useResilientImage(src);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      handleLoad();
    }
  }, [currentSrc, handleLoad]);

  if (!currentSrc || hasError) {
    return (
      <div className="product-image-unavailable w-full h-full flex flex-col items-center justify-center text-slate-600 p-2 text-center select-none">
        <ImageIcon className={`${fallbackIconSize} stroke-1 text-slate-600 mb-0.5`} />
        {showEmptyText && <span className="text-[11px] text-slate-500">Sem foto</span>}
      </div>
    );
  }

  const isSameOriginProxy = currentSrc.startsWith('/api/');

  return (
    <img
      key={currentSrc}
      ref={imgRef}
      src={currentSrc}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      referrerPolicy={isSameOriginProxy ? undefined : 'no-referrer'}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
};
