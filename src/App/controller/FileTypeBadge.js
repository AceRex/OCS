import React from "react";
import {
  PiMusicNotesFill,
  PiFilePdfFill,
  PiPresentationFill,
  PiVideoFill,
  PiImageFill,
  PiFileTextFill,
  PiFileFill,
} from "react-icons/pi";
import mp3PngIcon from "../../../assets/text_line_mp3.png";
import pdfPngIcon from "../../../assets/text_line_pdf.png";
import mp4PngIcon from "../../../assets/text_line_mp4.png";

/**
 * Figma File Type Icon Pack — Vector Component
 * Reference: https://www.figma.com/design/qrZircX6FJNkTcW6PMt6PG/File-Type-Icon-Pack--Community-?node-id=202-1055
 */
export default function FileTypeBadge({
  type,
  filename = "",
  fileUrl = "",
  size = "md",
  className = "",
  showLabel = true,
}) {
  // Infer file type from URL or filename if not explicitly provided
  let inferredExt = "";
  const nameToTest = (filename || fileUrl || "").toLowerCase();
  const match = nameToTest.match(/\.([a-z0-9]+)(?:[?#]|$)/i);
  if (match) inferredExt = match[1];

  let resolvedType = (type || "").toLowerCase();
  if (!resolvedType) {
    if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(inferredExt)) {
      resolvedType = "mp3";
    } else if (inferredExt === "pdf") {
      resolvedType = "pdf";
    } else if (["pptx", "ppt", "odp"].includes(inferredExt)) {
      resolvedType = "pptx";
    } else if (["mp4", "webm", "mov", "mkv", "avi"].includes(inferredExt)) {
      resolvedType = "video";
    } else if (["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(inferredExt)) {
      resolvedType = "image";
    } else if (["txt", "json", "jsonl", "md", "csv"].includes(inferredExt)) {
      resolvedType = "text";
    } else {
      resolvedType = "file";
    }
  }

  // Dimension scaling
  const dimensions = {
    xs: { w: 22, h: 28, fold: 7, font: "text-[7px]", iconSize: 11, radius: "rounded-md" },
    sm: { w: 30, h: 38, fold: 9, font: "text-[8px]", iconSize: 14, radius: "rounded-lg" },
    md: { w: 48, h: 60, fold: 14, font: "text-[10px]", iconSize: 22, radius: "rounded-xl" },
    lg: { w: 68, h: 84, fold: 18, font: "text-[12px]", iconSize: 30, radius: "rounded-2xl" },
    xl: { w: 88, h: 108, fold: 24, font: "text-[14px]", iconSize: 38, radius: "rounded-[22px]" },
  }[size] || { w: 48, h: 60, fold: 14, font: "text-[10px]", iconSize: 22, radius: "rounded-xl" };

  // Color theme palette matching Figma Icon Pack
  const palettes = {
    mp3: {
      bg: "bg-gradient-to-br from-rose-500 to-rose-700",
      border: "border-rose-400/40",
      foldBg: "bg-rose-300",
      shadow: "shadow-rose-900/30",
      tagBg: "bg-rose-950/70",
      tagText: "text-rose-200",
      icon: PiMusicNotesFill,
      label: (inferredExt || "MP3").toUpperCase(),
    },
    pdf: {
      bg: "bg-gradient-to-br from-red-600 to-red-800",
      border: "border-red-400/40",
      foldBg: "bg-red-300",
      shadow: "shadow-red-900/30",
      tagBg: "bg-red-950/70",
      tagText: "text-red-200",
      icon: PiFilePdfFill,
      label: "PDF",
    },
    pptx: {
      bg: "bg-gradient-to-br from-amber-500 to-orange-600",
      border: "border-amber-400/40",
      foldBg: "bg-amber-300",
      shadow: "shadow-orange-900/30",
      tagBg: "bg-orange-950/70",
      tagText: "text-amber-200",
      icon: PiPresentationFill,
      label: (inferredExt || "PPTX").toUpperCase(),
    },
    video: {
      bg: "bg-gradient-to-br from-indigo-600 to-blue-700",
      border: "border-indigo-400/40",
      foldBg: "bg-indigo-300",
      shadow: "shadow-indigo-900/30",
      tagBg: "bg-indigo-950/70",
      tagText: "text-indigo-200",
      icon: PiVideoFill,
      label: (inferredExt || "MP4").toUpperCase(),
    },
    image: {
      bg: "bg-gradient-to-br from-emerald-500 to-teal-700",
      border: "border-emerald-400/40",
      foldBg: "bg-emerald-300",
      shadow: "shadow-emerald-900/30",
      tagBg: "bg-emerald-950/70",
      tagText: "text-emerald-200",
      icon: PiImageFill,
      label: (inferredExt || "IMG").toUpperCase(),
    },
    text: {
      bg: "bg-gradient-to-br from-slate-600 to-slate-800",
      border: "border-slate-400/40",
      foldBg: "bg-slate-300",
      shadow: "shadow-slate-900/30",
      tagBg: "bg-slate-950/70",
      tagText: "text-slate-200",
      icon: PiFileTextFill,
      label: (inferredExt || "TXT").toUpperCase(),
    },
    file: {
      bg: "bg-gradient-to-br from-zinc-600 to-zinc-800",
      border: "border-zinc-400/40",
      foldBg: "bg-zinc-400",
      shadow: "shadow-zinc-900/30",
      tagBg: "bg-zinc-950/70",
      tagText: "text-zinc-200",
      icon: PiFileFill,
      label: (inferredExt || "FILE").toUpperCase(),
    },
  };

  const theme = palettes[resolvedType] || palettes.file;
  const IconComponent = theme.icon;

  return (
    <div
      style={{ width: dimensions.w, height: dimensions.h }}
      className={`relative select-none flex-shrink-0 flex flex-col justify-between p-1 overflow-hidden border shadow-md transition-transform ${theme.bg} ${theme.border} ${theme.shadow} ${dimensions.radius} ${className}`}
    >
      {/* Folded Corner Triangle */}
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: `0 ${dimensions.fold}px ${dimensions.fold}px 0`,
          borderColor: `transparent #121216 transparent transparent`,
          zIndex: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: "solid",
          borderWidth: `${dimensions.fold}px 0 0 ${dimensions.fold}px`,
          borderColor: `transparent transparent transparent rgba(255,255,255,0.45)`,
          zIndex: 2,
        }}
      />

      {/* Center Icon */}
      <div className="flex-1 flex items-center justify-center text-white drop-shadow-sm mt-0.5 overflow-hidden">
        {resolvedType === "mp3" && mp3PngIcon ? (
          <img
            src={mp3PngIcon}
            alt="MP3"
            className="w-full h-full object-contain p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : resolvedType === "pdf" && pdfPngIcon ? (
          <img
            src={pdfPngIcon}
            alt="PDF"
            className="w-full h-full object-contain p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : resolvedType === "video" && mp4PngIcon ? (
          <img
            src={mp4PngIcon}
            alt="MP4"
            className="w-full h-full object-contain p-0.5"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <IconComponent size={dimensions.iconSize} />
        )}
      </div>

      {/* Extension Label Tag */}
      {showLabel && (
        <div
          className={`w-full py-0.5 px-1 rounded-sm text-center font-black tracking-wider uppercase backdrop-blur-xs font-mono leading-none ${dimensions.font} ${theme.tagBg} ${theme.tagText}`}
        >
          {theme.label}
        </div>
      )}
    </div>
  );
}
