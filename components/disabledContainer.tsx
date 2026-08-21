import React from "react";
import { PiDeviceMobileFill } from "react-icons/pi";

export default function DisabledContainer({
  children,
  disabled,
  message,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  message?: string;
}) {
  if (!disabled) {
    return <>{children}</>;
  }
  return (
    <div className="w-full h-full relative cursor-not-allowed select-none">
      {/* Blurred, non-interactive children */}
      <div
        className="w-full h-full blur-sm opacity-40 pointer-events-none select-none"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Blocking overlay — absorbs all pointer and click events */}
      <div
        className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center cursor-not-allowed bg-black/20 pointer-events-auto"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className="bg-[#1a1825]/95 backdrop-blur-md border border-purple-500/30 rounded-2xl px-6 py-5 flex flex-col items-center gap-3 shadow-2xl max-w-[240px] pointer-events-none">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
            <PiDeviceMobileFill size={22} className="text-purple-400" />
          </div>
          <p className="text-white/80 text-xs font-semibold leading-relaxed text-center">
            {message || "This feature is not available on desktop."}
          </p>
        </div>
      </div>
    </div>
  );
}
