import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useResilientImage } from '../utils/imageHelper';

interface ProductImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  fallbackIconSize?: string;
  showEmptyText?: boolean;
}

export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt = '',
  className = 'w-full h-full object-cover',
  fallbackIconSize = 'w-6 h-6',
  showEmptyText = false,
}) => {
  const { currentSrc, hasError, handleError } = useResilientImage(src);

  if (!currentSrc || hasError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 p-2 text-center select-none">
        <ImageIcon className={`${fallbackIconSize} stroke-1 text-slate-600 mb-0.5`} />
        {showEmptyText && <span className="text-[11px] text-slate-500">Sem foto</span>}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      className={className}
      referrerPolicy="no-referrer"
      onError={handleError}
    />
  );
};
