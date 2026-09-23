import React, { useState, useEffect } from "react";
import {
  PiCalendarCheck,
  PiClock,
  PiDeviceMobile,
  PiCheck,
  PiX,
  PiEye,
  PiQueue,
} from "react-icons/pi";

const electron = typeof window !== "undefined" ? window.electron : {};

export default function IncomingAgendaModal() {
  const [pendingOffers, setPendingOffers] = useState([]);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!electron?.Agenda?.onOfferReceived) return;

    const unsubOffer = electron.Agenda.onOfferReceived((offer) => {
      if (!offer || !offer.transferId) return;
      setPendingOffers((prev) => {
        if (prev.some((o) => o.transferId === offer.transferId)) return prev;
        return [...prev, offer];
      });
    });

    const unsubResponded = electron?.Agenda?.onOfferResponded
      ? electron.Agenda.onOfferResponded((data) => {
          if (!data?.transferId) return;
          setPendingOffers((prev) => prev.filter((o) => o.transferId !== data.transferId));
        })
      : null;

    return () => {
      unsubOffer?.();
      unsubResponded?.();
    };
  }, []);

  if (!pendingOffers.length) return null;

  const currentOffer = pendingOffers[0];
  const queueCount = pendingOffers.length;

  const handleDecline = async (offer = currentOffer) => {
    if (!offer || isProcessing) return;
    setIsProcessing(true);
    try {
      await electron?.Agenda?.respondOffer?.({
        transferId: offer.transferId,
        accepted: false,
      });
    } catch (err) {
      console.error("[IncomingAgendaModal] Decline error:", err);
    } finally {
      setIsProcessing(false);
      setIsReviewOpen(false);
      setPendingOffers((prev) => prev.filter((o) => o.transferId !== offer.transferId));
    }
  };

  const handleAccept = async (offer = currentOffer) => {
    if (!offer || isProcessing) return;
    setIsProcessing(true);
    try {
      await electron?.Agenda?.respondOffer?.({
        transferId: offer.transferId,
        accepted: true,
      });
    } catch (err) {
      console.error("[IncomingAgendaModal] Accept error:", err);
    } finally {
      setIsProcessing(false);
      setIsReviewOpen(false);
      setPendingOffers((prev) => prev.filter((o) => o.transferId !== offer.transferId));
    }
  };

  const sessions = currentOffer.agenda?.sessions || [];
  const cueCount = currentOffer.mediaCount ?? (currentOffer.agenda?.assets?.length || 0);

  return (
    <>
      {/* ── Actionable Incoming Notification Panel ───────────────────────── */}
      <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
        <div className="w-[380px] bg-[#120D22] border border-[#7C3AED]/40 rounded-[12px] p-4 shadow-2xl shadow-purple-950/60 flex flex-col gap-3 text-white backdrop-blur-md">
          {/* Header Row */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-[#7C3AED]/20 border border-[#7C3AED]/40 rounded-[12px] text-[#A788FA]">
                <PiCalendarCheck size={16} />
              </div>
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Agenda Received
              </span>
            </div>
            {queueCount > 1 && (
              <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-[12px] bg-[#7C3AED]/20 border border-[#7C3AED]/30 text-[#A788FA]">
                <PiQueue size={12} />
                <span>1 of {queueCount}</span>
              </span>
            )}
          </div>

          {/* Agenda Info */}
          <div>
            <h4 className="text-sm font-bold text-white truncate" title={currentOffer.agendaName}>
              {currentOffer.agendaName || "Untitled Agenda"}
            </h4>
            <div className="flex items-center gap-1.5 text-xs text-white/60 mt-0.5 font-mono">
              <span>{currentOffer.sessionCount || 0} sessions</span>
              <span>•</span>
              <span>{cueCount} cues</span>
              <span>•</span>
              <span className="text-[#A788FA] font-bold">{currentOffer.totalDuration || "00:00:00"}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-white/40 mt-1.5">
              <PiDeviceMobile size={13} className="shrink-0" />
              <span className="truncate">Sent from {currentOffer.deviceName || "Mobile Companion"}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-1 gap-2">
            <button
              onClick={() => handleDecline(currentOffer)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-300 border border-white/10 hover:border-red-500/30 rounded-[12px] text-xs font-bold text-white/70 transition-colors cursor-pointer disabled:opacity-40"
            >
              Decline
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsReviewOpen(true)}
                disabled={isProcessing}
                className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[12px] text-xs font-bold text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <PiEye size={13} />
                <span>Review</span>
              </button>
              <button
                onClick={() => handleAccept(currentOffer)}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[12px] text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/30 transition-all cursor-pointer disabled:opacity-40"
              >
                <PiCheck size={14} weight="bold" />
                <span>Accept</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Read-Only Review Modal ───────────────────────────────────────── */}
      {isReviewOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 z-50 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[#120D22] border border-white/15 rounded-[12px] p-6 shadow-2xl flex flex-col gap-4 text-white max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#A788FA] block">
                  Read-Only Preview
                </span>
                <h3 className="text-base font-bold text-white truncate max-w-md">
                  {currentOffer.agendaName}
                </h3>
              </div>
              <button
                onClick={() => setIsReviewOpen(false)}
                className="p-1 hover:bg-white/10 rounded-[12px] text-white/50 hover:text-white cursor-pointer"
              >
                <PiX size={16} />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-white/5 rounded-[12px] border border-white/5 text-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-white/40 block">Duration</span>
                <span className="text-xs font-mono font-bold text-[#A788FA]">
                  {currentOffer.totalDuration || "00:00:00"}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-white/40 block">Sessions</span>
                <span className="text-xs font-mono font-bold text-white">
                  {currentOffer.sessionCount || sessions.length}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-white/40 block">Cues</span>
                <span className="text-xs font-mono font-bold text-white">{cueCount}</span>
              </div>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px] max-h-[280px]">
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/40 block mb-1">
                Planned Sessions
              </span>
              {sessions.length === 0 ? (
                <div className="p-4 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-[12px]">
                  No sessions in this agenda.
                </div>
              ) : (
                sessions.map((sess, idx) => {
                  const sDur = sess.durationSec || 0;
                  const m = Math.floor(sDur / 60);
                  const s = sDur % 60;
                  const formatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
                  const cCount = sess.timelineItems?.length || 0;
                  return (
                    <div
                      key={sess.id || idx}
                      className="p-2.5 bg-white/5 border border-white/5 rounded-[12px] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[10px] font-mono font-bold text-white/30 shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {sess.name || `Session ${idx + 1}`}
                          </p>
                          {sess.person ? (
                            <p className="text-[10px] text-white/40 truncate">{sess.person}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-white/60 font-mono shrink-0">
                        <span>{cCount} cue{cCount !== 1 ? "s" : ""}</span>
                        <span>•</span>
                        <span className="text-white/80">{formatted}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="text-[11px] text-white/40 italic">
              Accepting will add this plan to your Agenda library without starting live play or timer.
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                onClick={() => handleDecline(currentOffer)}
                disabled={isProcessing}
                className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-[12px] text-xs font-bold text-red-300 transition-colors cursor-pointer disabled:opacity-40"
              >
                Decline Agenda
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsReviewOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-[12px] text-xs font-bold text-white/70 hover:text-white cursor-pointer"
                >
                  Close Preview
                </button>
                <button
                  onClick={() => handleAccept(currentOffer)}
                  disabled={isProcessing}
                  className="px-5 py-2 bg-[#7C3AED] hover:bg-[#6D28D9] rounded-[12px] text-xs font-bold text-white shadow-lg shadow-[#7C3AED]/30 transition-all cursor-pointer disabled:opacity-40"
                >
                  Accept Agenda
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
