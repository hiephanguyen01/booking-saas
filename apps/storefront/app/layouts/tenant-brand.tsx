import { useState } from 'react';

type TenantBrandProps = {
  name: string;
  logoUrl: string | null;
  className?: string;
  imageClassName?: string;
  textClassName?: string;
  width?: number;
  height?: number;
};

/** Tenant identity shared by every storefront shell. */
export function TenantBrand({
  name,
  logoUrl,
  className,
  imageClassName = 'h-10 w-auto max-w-44 object-contain',
  textClassName = 'max-w-44 truncate text-xl font-bold text-primary',
  width = 160,
  height = 48,
}: TenantBrandProps) {
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const showLogo = Boolean(logoUrl && logoUrl !== failedLogoUrl);

  return (
    <span className={className}>
      {showLogo ? (
        <img
          src={logoUrl!}
          alt={name}
          width={width}
          height={height}
          className={imageClassName}
          onError={() => setFailedLogoUrl(logoUrl)}
        />
      ) : (
        <span className={textClassName}>{name}</span>
      )}
    </span>
  );
}
