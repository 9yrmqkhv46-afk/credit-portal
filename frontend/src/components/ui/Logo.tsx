import React from 'react';

interface LogoProps {
  /** Rendered width in pixels. The SVG's intrinsic aspect ratio is 4:1. */
  width?: number;
  /** Rendered height in pixels. Defaults to width / 4 to preserve aspect ratio. */
  height?: number;
  className?: string;
  /** Override the default accessible name if the logo is decorative. */
  alt?: string;
}

/**
 * TransformBiz brand mark. Renders the wordmark + folded-paper "T" symbol
 * from `/transformbiz-logo.svg`.
 *
 * We deliberately use a plain `<img>` rather than `next/image` so this works
 * in both the App Router and any static export with zero extra config (the
 * SVG is already optimised — it has no raster data).
 */
export function Logo({
  width = 220,
  height,
  className = '',
  alt = 'TransformBiz',
}: LogoProps): React.ReactElement {
  const resolvedHeight = height ?? Math.round(width / 4);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/transformbiz-logo.svg"
      alt={alt}
      width={width}
      height={resolvedHeight}
      className={className}
      style={{ width, height: resolvedHeight }}
    />
  );
}

export default Logo;
