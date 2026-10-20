import React from 'react';

interface ForgeXLogoProps {
  variant?: 'full' | 'icon';
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
}

export const ForgeXIcon: React.FC<{ className?: string; size?: number }> = ({
  className = 'w-7 h-7',
}) => {
  return (
    <img
      src="/forgex_icon.png"
      alt="ForgeX AI Icon"
      className={`${className} object-contain shrink-0`}
      loading="eager"
    />
  );
};

export const ForgeXLogo: React.FC<ForgeXLogoProps> = ({
  variant = 'full',
  theme = 'light',
  className = '',
  size = 'md',
  showSubtitle = false,
}) => {
  if (variant === 'icon') {
    const sizeMap = {
      sm: 'w-6 h-6',
      md: 'w-8 h-8',
      lg: 'w-10 h-10',
      xl: 'w-12 h-12',
    };
    return <ForgeXIcon className={`${sizeMap[size]} ${className}`} />;
  }

  // Height mappings for the full horizontal logo
  const heightMap = {
    sm: 'h-6',
    md: 'h-8',
    lg: 'h-10',
    xl: 'h-12',
  };

  const logoSrc =
    theme === 'dark' ? '/forgex_logo_dark.png' : '/forgex_logo_transparent.png';

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center gap-2">
        <img
          src={logoSrc}
          alt="ForgeX AI"
          className={`${heightMap[size]} w-auto object-contain shrink-0 select-none`}
          loading="eager"
        />
      </div>
      {showSubtitle && (
        <span
          className={`text-[9px] tracking-widest uppercase font-semibold mt-0.5 ${
            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          Industrial Intelligence
        </span>
      )}
    </div>
  );
};

export default ForgeXLogo;
