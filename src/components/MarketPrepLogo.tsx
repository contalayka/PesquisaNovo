import React from 'react';

interface MarketPrepLogoProps {
  variant?: 'full' | 'compact' | 'icon' | 'badge';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showSubtitle?: boolean;
}

export const MarketPrepLogo: React.FC<MarketPrepLogoProps> = ({
  variant = 'compact',
  size = 'md',
  className = '',
  showSubtitle = true,
}) => {
  const iconSizeMap = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-11 h-11',
    xl: 'w-14 h-14',
  };

  const titleSizeMap = {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-2xl',
  };

  const subtitleSizeMap = {
    xs: 'text-[8px]',
    sm: 'text-[9px]',
    md: 'text-[10px]',
    lg: 'text-xs',
    xl: 'text-xs',
  };

  // Professional, geometric SaaS glyph (precision faceted cube / catalog hub)
  const BrandGlyph = ({ sizeClass }: { sizeClass: string }) => (
    <div className={`relative shrink-0 ${sizeClass} select-none flex items-center justify-center`}>
      <svg
        viewBox="0 0 40 40"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer Hexagon / Cube Contour */}
        <path
          d="M20 3L35 11.66V28.34L20 37L5 28.34V11.66L20 3Z"
          fill="#1E293B"
          stroke="#3B82F6"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        {/* Top Face */}
        <path
          d="M20 4.5L33.5 12.3L20 20.1L6.5 12.3L20 4.5Z"
          fill="#2563EB"
          opacity="0.9"
        />
        {/* Left Face */}
        <path
          d="M6.5 13.8L19.2 21.1V35.3L6.5 27.9V13.8Z"
          fill="#1D4ED8"
          opacity="0.75"
        />
        {/* Right Face */}
        <path
          d="M33.5 13.8L20.8 21.1V35.3L33.5 27.9V13.8Z"
          fill="#0F172A"
          opacity="0.95"
        />
        {/* Central Precision Node */}
        <circle cx="20" cy="20" r="2" fill="#60A5FA" />
        <path
          d="M20 6.5V18M8 27L18.5 21M32 27L21.5 21"
          stroke="#93C5FD"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </div>
  );

  // Variant: Icon Only
  if (variant === 'icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <BrandGlyph sizeClass={iconSizeMap[size]} />
      </div>
    );
  }

  // Variant: Full Stacked
  if (variant === 'full') {
    return (
      <div className={`flex flex-col items-center text-center select-none ${className}`}>
        <BrandGlyph sizeClass={iconSizeMap[size]} />
        <div className="mt-2">
          <h1 className={`font-bold tracking-tight text-white ${titleSizeMap[size]}`}>
            Market<span className="text-blue-400">Preço</span>
          </h1>
          {showSubtitle && (
            <p className={`font-medium tracking-wider uppercase text-slate-400 mt-0.5 ${subtitleSizeMap[size]}`}>
              Gestão de Catálogo & Preço
            </p>
          )}
        </div>
      </div>
    );
  }

  // Variant: Badge
  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 select-none ${className}`}
      >
        <BrandGlyph sizeClass={iconSizeMap[size]} />
        <div className="text-left">
          <div className={`font-bold tracking-tight leading-none text-white ${titleSizeMap[size]}`}>
            Market<span className="text-blue-400">Preço</span>
          </div>
          {showSubtitle && (
            <div className={`font-medium text-slate-400 tracking-wider leading-none mt-1 ${subtitleSizeMap[size]}`}>
              ERP & Multi-Canal
            </div>
          )}
        </div>
      </div>
    );
  }

  // Variant: Compact (Default)
  return (
    <div className={`flex items-center gap-2.5 select-none min-w-0 ${className}`}>
      <BrandGlyph sizeClass={iconSizeMap[size]} />
      <div className="min-w-0 text-left">
        <div className={`font-bold tracking-tight leading-snug text-white truncate ${titleSizeMap[size]}`}>
          Market<span className="text-blue-400">Preço</span>
        </div>
        {showSubtitle && (
          <p className={`font-medium text-slate-400 tracking-wide uppercase truncate ${subtitleSizeMap[size]}`}>
            Catálogo · Conversão
          </p>
        )}
      </div>
    </div>
  );
};
