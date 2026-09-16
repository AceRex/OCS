import React from "react";

export const DEFAULT_LOWER_THIRD_STYLE = {
  shape: "rounded-rect",     // "rounded-rect" | "angled-cut" | "minimal-bar" | "pill"
  badgeShape: "circle",      // "circle" | "triangle" | "rect" | "none"
  badgeIcon: "cross",        // "cross" | "dove" | "user" | "mic" | "star" | "bible"
  primaryColor: "#581c87",   // Deep purple
  secondaryColor: "#3b0764", // Gradient secondary
  accentColor: "#a855f7",    // Accent highlight
  textColor: "#ffffff",
  subtitleColor: "#cbd5e1",
  opacity: 0.95,
  fontSize: "medium",        // "small" | "medium" | "large"
  uppercaseTitle: false,
  showAccentSlash: true,
};

export const LOWER_THIRD_TEMPLATES = [
  {
    id: "classic-purple",
    name: "Classic Purple",
    style: {
      shape: "rounded-rect",
      badgeShape: "circle",
      badgeIcon: "cross",
      primaryColor: "#581c87",
      secondaryColor: "#3b0764",
      accentColor: "#c084fc",
      textColor: "#ffffff",
      subtitleColor: "#e9d5ff",
      opacity: 0.95,
      fontSize: "medium",
      uppercaseTitle: false,
      showAccentSlash: true,
    },
  },
  {
    id: "golden-glory",
    name: "Golden Glory",
    style: {
      shape: "rounded-rect",
      badgeShape: "circle",
      badgeIcon: "dove",
      primaryColor: "#78350f",
      secondaryColor: "#451a03",
      accentColor: "#facc15",
      textColor: "#ffffff",
      subtitleColor: "#fef08a",
      opacity: 0.95,
      fontSize: "medium",
      uppercaseTitle: true,
      showAccentSlash: true,
    },
  },
  {
    id: "ocean-modern",
    name: "Ocean Clean",
    style: {
      shape: "pill",
      badgeShape: "circle",
      badgeIcon: "mic",
      primaryColor: "#0f172a",
      secondaryColor: "#1e293b",
      accentColor: "#38bdf8",
      textColor: "#ffffff",
      subtitleColor: "#bae6fd",
      opacity: 0.95,
      fontSize: "medium",
      uppercaseTitle: false,
      showAccentSlash: true,
    },
  },
  {
    id: "minimal-dark",
    name: "Minimal Bar",
    style: {
      shape: "minimal-bar",
      badgeShape: "rect",
      badgeIcon: "star",
      primaryColor: "#09090b",
      secondaryColor: "#18181b",
      accentColor: "#f43f5e",
      textColor: "#ffffff",
      subtitleColor: "#a1a1aa",
      opacity: 0.95,
      fontSize: "medium",
      uppercaseTitle: false,
      showAccentSlash: false,
    },
  },
];

/**
 * Render custom broadcast lower third with shapes, badges, icons, and typography.
 * Strict adherence to Universal 12px Border Radius (`rounded-[12px]`) across containers,
 * with circular badge indicators using `rounded-full`.
 */
export const renderCustomLowerThirdUI = (lt) => {
  const style = lt?.style || DEFAULT_LOWER_THIRD_STYLE;
  const primary = style.primaryColor || "#581c87";
  const secondary = style.secondaryColor || "#3b0764";
  const accent = style.accentColor || "#a855f7";
  const textColor = style.textColor || "#ffffff";
  const subtitleColor = style.subtitleColor || "#cbd5e1";
  const opacity = style.opacity ?? 0.95;
  const shape = style.shape || "rounded-rect";
  const badgeShape = style.badgeShape || "circle";
  const badgeIcon = style.badgeIcon || "cross";

  const isPill = shape === "pill";
  const isMinimal = shape === "minimal-bar";
  const isAngled = shape === "angled-cut";

  return (
    <div
      className={`relative flex items-center shadow-2xl transition-all border overflow-hidden select-none ${
        isPill ? "rounded-full px-3 py-1.5" : "rounded-[12px] p-2"
      } ${isMinimal ? "border-b-2 py-1.5 px-3" : ""}`}
      style={{
        background: `linear-gradient(135deg, ${primary}, ${secondary})`,
        borderColor: accent,
        opacity: opacity,
        boxShadow: `0 8px 24px -4px ${primary}80`,
      }}
    >
      {/* Left Badge Shape (Circle, Triangle, Rectangle, None) */}
      {badgeShape !== "none" && (
        <div
          className={`shrink-0 flex items-center justify-center font-bold text-white shadow-md mr-2.5 ${
            badgeShape === "circle"
              ? "w-8 h-8 rounded-full border"
              : badgeShape === "triangle"
              ? "w-8 h-8 flex items-center justify-center"
              : "w-8 h-8 rounded-[12px] border"
          }`}
          style={{
            borderColor: `${accent}60`,
            backgroundColor: badgeShape === "triangle" ? "transparent" : `${accent}25`,
          }}
        >
          {badgeShape === "triangle" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill={accent}>
              <path d="M12 2L2 22h20L12 2z" />
            </svg>
          ) : (
            <span className="text-xs font-black text-white tracking-wider uppercase">
              {(title && title.trim().length > 0) ? title.trim()[0] : "•"}
            </span>
          )}
        </div>
      )}

      {/* Triangular / Slanted Geometric Accent Slash */}
      {style.showAccentSlash && !isMinimal && (
        <div className="w-2 h-7 relative overflow-hidden shrink-0 mr-2 -ml-1 flex items-center justify-center pointer-events-none">
          <div
            className="w-1.5 h-10 transform -skew-x-[24deg] shadow-sm"
            style={{ backgroundColor: accent }}
          />
        </div>
      )}

      {/* Text Container */}
      <div className="min-w-0 flex-1 flex flex-col justify-center pr-1">
        <span
          className={`font-black tracking-wide truncate leading-tight ${
            style.fontSize === "small"
              ? "text-[11px]"
              : style.fontSize === "large"
              ? "text-sm"
              : "text-xs"
          } ${style.uppercaseTitle ? "uppercase tracking-wider" : "tracking-normal"}`}
          style={{ color: textColor }}
        >
          {lt?.title || "Speaker"}
        </span>
        {lt?.subtitle && (
          <span
            className={`font-semibold truncate leading-tight mt-0.5 ${
              style.fontSize === "small" ? "text-[9.5px]" : "text-[10px]"
            }`}
            style={{ color: subtitleColor }}
          >
            {lt.subtitle}
          </span>
        )}
      </div>

      {/* Angled Cut Dynamic Accent Tag */}
      {isAngled && (
        <div
          className="absolute right-0 top-0 bottom-0 w-3 transform skew-x-[20deg] translate-x-1.5 opacity-60 pointer-events-none"
          style={{ backgroundColor: accent }}
        />
      )}
    </div>
  );
};
