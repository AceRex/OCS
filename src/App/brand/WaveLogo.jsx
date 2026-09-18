import React from "react";
import { BRAND } from "./brandConfig";

/**
 * Reusable wave.io Brand Logo Component
 * Adheres strictly to Universal 12px Border Radius design system.
 */
export default function WaveLogo({
  variant = "icon",
  color = "fullColor",
  className = "",
  containerClassName = "",
  size,
  alt = "wave.io",
  onClick,
}) {
  const variantAssets = BRAND.assets[variant] || BRAND.assets.icon;
  const src = variantAssets[color] || variantAssets.fullColor || variantAssets.white;

  // Default dimension presets per variant
  const defaultSizes = {
    icon: "h-8 w-8",
    horizontal: "h-8 w-auto max-w-[160px]",
    stacked: "h-16 w-auto",
    wordmark: "h-6 w-auto",
  };

  const sizeClass = size ? "" : defaultSizes[variant] || defaultSizes.icon;
  const inlineStyle = size
    ? {
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }
    : undefined;

  const imageElement = (
    <img
      src={src}
      alt={alt}
      style={inlineStyle}
      className={`object-contain select-none transition-transform duration-200 ${sizeClass} ${className}`}
      draggable={false}
    />
  );

  if (containerClassName || onClick) {
    return (
      <div
        onClick={onClick}
        className={`flex items-center justify-center rounded-[12px] ${
          onClick ? "cursor-pointer" : ""
        } ${containerClassName}`}
      >
        {imageElement}
      </div>
    );
  }

  return imageElement;
}
