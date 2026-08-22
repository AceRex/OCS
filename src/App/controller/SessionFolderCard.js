/**
 * Session folder card — Apple macOS style blue folder artwork.
 */
import React from "react";
import { PiTrash, PiCheck } from "react-icons/pi";
import folderMacImg from "../../../assets/folder_mac.png";

function formatBytes(n) {
  if (!n || n < 1024) return `${n || 0} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch (_) {
    return "";
  }
}

export default function SessionFolderCard({
  title,
  speakerName,
  index = 0,
  sizeBytes = 0,
  createdAt,
  status,
  selected = false,
  onToggleSelect,
  onOpen,
  onDelete,
}) {
  const isProcessing = status === "processing" || status === "recording";
  const statusLabel =
    status && status !== "ready"
      ? status === "processing"
        ? "Processing"
        : status.replace("_", " ")
      : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative w-full text-left group focus:outline-none transition-all duration-200 ${
        selected ? "scale-[0.98]" : "hover:-translate-y-0.5"
      }`}
    >
      {/* Folder Visual Card — No shadows */}
      <div
        className={`relative w-full aspect-[1.14/1] select-none transition-all ${
          selected
            ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-black/80 rounded-[20px]"
            : ""
        }`}
      >
        {/* macOS Folder Artwork */}
        <img
          src={folderMacImg}
          alt="Folder"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />

        {/* Selection Checkbox — positioned slightly at top of card */}
        <div className="absolute top-2 left-3 z-30">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelect?.(e);
            }}
            className={`w-4.5 h-4.5 rounded-md flex items-center justify-center border transition-all ${
              selected
                ? "bg-blue-600 border-white text-white opacity-100"
                : "bg-black/35 border-white/50 text-transparent hover:border-white hover:bg-black/60 opacity-0 group-hover:opacity-100"
            }`}
            aria-label={selected ? "Deselect session" : "Select session"}
          >
            <PiCheck
              size={12}
              strokeWidth={3}
              className={selected ? "text-white" : "opacity-0"}
            />
          </button>
        </div>

        {/* Front Pocket: Label & Delete on the same line, Speaker & Metadata below */}
        <div className="absolute left-[7%] right-[7%] top-[34%] bottom-[6%] flex flex-col justify-between p-4 z-20">
          {/* Label (Title) & Delete on the same line */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex-1 min-w-0">
              <h3 className="text-[13px] font-black text-white tracking-tight leading-tight truncate flex-1 min-w-0">
                {title || "Session"}
              </h3>
              <p className="text-[11px] text-white/90 font-semibold truncate leading-tight">
                {speakerName || "Speaker"}
              </p>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(e);
              }}
              className="shrink-0 w-5 h-5 rounded-full bg-white/10 hover:bg-red-600 border border-white/30 hover:border-red-400 flex items-center justify-center text-white/80 hover:text-white transition-all opacity-0 group-hover:opacity-100"
              title="Delete session"
              aria-label="Delete session"
            >
              <PiTrash size={12} />
            </button>
          </div>

          {/* Speaker & Status */}
          <div className="min-w-0 py-0.5">
            {statusLabel && (
              <span
                className={`inline-flex items-center gap-1 mt-1 text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full ${
                  isProcessing
                    ? "bg-white/25 text-white"
                    : "bg-black/30 text-white/90"
                }`}
              >
                {isProcessing && (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
                {statusLabel}
              </span>
            )}
          </div>

          {/* Bottom Metadata: Date & Size */}
          <p className="text-[9px] text-white/80 font-medium tracking-tight truncate leading-tight">
            Last added {formatDate(createdAt)}
            {sizeBytes ? ` · ${formatBytes(sizeBytes)}` : ""}
          </p>
        </div>
      </div>
    </button>
  );
}

export { formatBytes, formatDate };
