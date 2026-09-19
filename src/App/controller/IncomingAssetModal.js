import ActionButton from "../components/feedback/ActionButton";
import React, { useEffect, useRef, useState } from "react";
import {
  PiCheck,
  PiX,
  PiDeviceMobile,
  PiSparkle
} from "react-icons/pi";
import FileTypeBadge from "./FileTypeBadge";

export default function IncomingAssetModal() {
  const [requests, setRequests] = useState([]);
  const request = requests[0];
  const busyRef = useRef(false);
  const [error, setError] = useState(null);
  const [audioRole, setAudioRole] = useState("intro"); // 'intro' | 'outro' | 'media'
  const [applyToCanvas, setApplyToCanvas] = useState(false);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const onAssetRequest = window.electron?.Remote?.onAssetRequest || window.electron?.Network?.onAssetRequest;
    if (!onAssetRequest) return;
    const unsub = onAssetRequest((req) => {
      setRequests((pending) => [...pending, req]);

    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    setAudioRole("intro");
    setApplyToCanvas(false);
    setError(null);
  }, [request?.transferId]);

  if (!request) return null;

  const handleRespond = async (accepted) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProcessing(true);
    setError(null);
    try {
      const respond = window.electron?.Remote?.respondAsset || window.electron?.Network?.respondAsset;
      if (!respond) throw new Error("Asset transfer is unavailable. Please ask the sender to reconnect.");
      {
        const result = await respond({
          transferId: request.transferId,
          accepted,
          targetRole: request.fileType === "audio" ? audioRole : undefined,
          applyToCanvas: (request.fileType === "image" || request.fileType === "video") ? applyToCanvas : false,
        });
        if (result?.ok === false) throw new Error(result.error || "The asset could not be saved. Ask the sender to resend it.");
        setRequests((pending) => pending.slice(1));
      }
    } catch (err) {
      setError(err.message || "The asset could not be saved. Ask the sender to resend it.");
    } finally {
      setProcessing(false);
      busyRef.current = false;
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
      <div className="bg-[#18181b] border border-white/15 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#00A8FF]/15 border border-[#00A8FF]/30 rounded-xl">
              <PiDeviceMobile size={22} className="text-[#00A8FF]" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Incoming Mobile Asset</h2>
              <p className="text-white/40 text-xs">
                From <span className="text-white/80 font-medium">{request.deviceName || "Mobile Device"}</span> ({request.deviceIp})
              </p>
            </div>
          </div>
          <ActionButton
            loadingLabel="Declining request…"
            aria-label="Decline asset request"
            onClick={() => handleRespond(false)}
            disabled={processing}
            className="p-1.5 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <PiX size={18} />
          </ActionButton>
        </div>

        {/* Content Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* File Card with Figma FileTypeBadge Preview */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-4">
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
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="text-amber-300 font-bold text-xs uppercase tracking-wider">
                Audio Asset Routing
              </div>
              <p className="text-white/60 text-xs leading-relaxed">
                Choose how this audio track should be assigned in the system:
              </p>
              <div className="grid grid-cols-3 gap-2 mt-1">
                <ActionButton
                  type="button"
                  disabled={processing}
                  onClick={() => setAudioRole("intro")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "intro"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Set as Intro
                </ActionButton>
                <ActionButton
                  type="button"
                  disabled={processing}
                  onClick={() => setAudioRole("outro")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "outro"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Set as Outro
                </ActionButton>
                <ActionButton
                  type="button"
                  disabled={processing}
                  onClick={() => setAudioRole("media")}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                    audioRole === "media"
                      ? "bg-amber-500/20 border-amber-400 text-white shadow-sm"
                      : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
                  }`}
                >
                  Save as Media
                </ActionButton>
              </div>
            </div>
          )}

          {(isImage || isVideo) && (
            <div className="bg-[#00A8FF]/10 border border-[#00A8FF]/20 rounded-xl p-4 flex flex-col gap-2.5">
              <div className="text-[#00A8FF] font-bold text-xs uppercase tracking-wider">
                Media Library Placement
              </div>
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  disabled={processing}
                  checked={applyToCanvas}
                  onChange={(e) => setApplyToCanvas(e.target.checked)}
                  className="w-4 h-4 rounded border-white/20 text-[#00A8FF] focus:ring-0 bg-black/40"
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
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-3">
              <PiSparkle size={20} className="text-orange-400 flex-shrink-0" />
              <p className="text-white/70 text-xs leading-relaxed">
                Accepting this presentation will automatically convert all slides via the Presentation Pipeline with OpenXML notes extraction.
              </p>
            </div>
          )}
        </div>

        {error && <div role="alert" className="mx-6 mb-4 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
          <ActionButton className="block mt-2 underline" onClick={() => setRequests((pending) => pending.slice(1))}>Dismiss request</ActionButton>
        </div>}
        {/* Footer Actions */}
        <div className="p-6 bg-black/30 border-t border-white/10 flex items-center justify-end gap-3">
          <ActionButton
            type="button"
            loadingLabel="Declining request…"
            aria-label="Decline asset request"
            onClick={() => handleRespond(false)}
            disabled={processing || request.uploading}
            className="px-5 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 font-semibold text-xs transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <PiX size={16} />
            Decline
          </ActionButton>
          <ActionButton
            type="button"
            loadingLabel="Saving asset…"
            onClick={() => handleRespond(true)}
            disabled={processing || request.uploading}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all flex items-center gap-1.5 ${
              processing || request.uploading
                ? "bg-[#00A8FF]/40 text-white/50 cursor-not-allowed"
                : "bg-[#00A8FF] hover:bg-[#00A8FF] text-white shadow-[#00A8FF]/30 cursor-pointer"
            }`}
          >
            <PiCheck size={16} />
            {processing
              ? "Processing…"
              : request.uploading
                ? "Uploading to Controller…"
                : "Accept & Save"}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
