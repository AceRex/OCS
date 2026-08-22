import React, { useEffect, useState } from "react";
import {
  PiCheck,
  PiX,
  PiDeviceMobile,
  PiSparkle
} from "react-icons/pi";
import FileTypeBadge from "./FileTypeBadge";

export default function IncomingAssetModal() {
  const [request, setRequest] = useState(null);
  const [audioRole, setAudioRole] = useState("intro"); // 'intro' | 'outro' | 'media'
  const [applyToCanvas, setApplyToCanvas] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const onAssetRequest = window.electron?.Remote?.onAssetRequest || window.electron?.Network?.onAssetRequest;
    if (!onAssetRequest) return;
    const unsub = onAssetRequest((req) => {
      setRequest(req);
      setProcessing(false);
      // Default selections by type
      if (req.fileType === "audio") setAudioRole("intro");
      setApplyToCanvas(false);
    });
    return () => unsub?.();
  }, []);

  if (!request) return null;

  const handleRespond = async (accepted) => {
    setProcessing(true);
    try {
      const respond = window.electron?.Remote?.respondAsset || window.electron?.Network?.respondAsset;
      if (respond) {
        await respond({
          transferId: request.transferId,
          accepted,
          targetRole: request.fileType === "audio" ? audioRole : undefined,
          applyToCanvas: (request.fileType === "image" || request.fileType === "video") ? applyToCanvas : false,
        });
      }
    } catch (err) {
      console.error("Failed to respond to asset transfer:", err);
    } finally {
      setProcessing(false);
      setRequest(null);
    }
  };

  const isImage = request.fileType === "image" || /\.(png|jpe?g|webp|gif|svg|bmp)$/i.test(request.fileName);
  const isVideo = request.fileType === "video" || /\.(mp4|webm|mov|mkv|avi)$/i.test(request.fileName);
  const isAudio = request.fileType === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(request.fileName);
  const isPptx = request.fileType === "presentation" || /\.(pptx|ppt)$/i.test(request.fileName);

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <div className="bg-[#18181b] border border-white/15 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/15 border border-blue-500/30 rounded-2xl">
              <PiDeviceMobile size={22} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Incoming Mobile Asset</h2>
              <p className="text-white/40 text-xs">
                From <span className="text-white/80 font-medium">{request.deviceName || "Mobile Device"}</span> ({request.deviceIp})
              </p>
            </div>
          </div>
          <button
            onClick={() => handleRespond(false)}
            disabled={processing}
            className="p-1.5 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <PiX size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* File Card with Figma FileTypeBadge Preview */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
            {isImage && request.previewDataUrl ? (
              <img
                src={request.previewDataUrl}
                alt="Asset preview"
                className="w-16 h-16 rounded-xl object-cover border border-white/15 bg-black/40"
              />
            ) : (
              <FileTypeBadge
                filename={request.fileName}
                type={request.fileType}
                size="md"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-white font-semibold text-sm truncate" title={request.fileName}>
                {request.fileName}
              </div>
              <div className="text-white/40 text-xs flex items-center gap-2 mt-1 uppercase tracking-wider font-mono">
                <span>{request.fileType}</span>
                <span>•</span>
                <span>{formatBytes(request.fileSize)}</span>
              </div>
            </div>
          </div>

          {/* Type-Specific Routing Options */}
          {isAudio && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex flex-col gap-2.5">
              <div className="text-amber-300 font-bold text-xs uppercase tracking-wider">
                Audio Asset Routing
              </div>
              <p className="text-white/60 text-xs leading-relaxed">
                Choose how this audio track should be assigned in the system:
              </p>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setAudioRole("intro")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "intro"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Set as Intro
                </button>
                <button
                  type="button"
                  onClick={() => setAudioRole("outro")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "outro"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Set as Outro
                </button>
                <button
                  type="button"
                  onClick={() => setAudioRole("media")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "media"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Save as Media
                </button>
              </div>
            </div>
          )}

          {(isImage || isVideo) && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 flex flex-col gap-2.5">
              <div className="text-blue-300 font-bold text-xs uppercase tracking-wider">
                Media Library Placement
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={applyToCanvas}
                  onChange={(e) => setApplyToCanvas(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-blue-600 focus:ring-0 bg-black/40"
                />
                <span className="text-white/80 text-xs">
                  Apply directly as Background Layer on General & Speaker Views
                </span>
              </label>
              <p className="text-white/40 text-[11px]">
                Regardless of this option, the media will be permanently saved to your Media Library.
              </p>
            </div>
          )}

          {isPptx && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center gap-3">
              <PiSparkle size={20} className="text-orange-400 flex-shrink-0" />
              <p className="text-white/70 text-xs leading-relaxed">
                Accepting this presentation will automatically convert all slides via the Presentation Pipeline with OpenXML notes extraction.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-black/30 border-t border-white/10 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => handleRespond(false)}
            disabled={processing || request.uploading}
            className="px-5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PiX size={16} />
            Decline
          </button>
          <button
            type="button"
            onClick={() => handleRespond(true)}
            disabled={processing || request.uploading}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 ${
              processing || request.uploading
                ? "bg-blue-600/40 text-white/50 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 cursor-pointer"
            }`}
          >
            <PiCheck size={16} />
            {processing
              ? "Processing…"
              : request.uploading
                ? "Uploading to Controller…"
                : "Accept & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
