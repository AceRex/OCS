import React from 'react';
import { PiX } from 'react-icons/pi';
import MiniPreview from './MiniPreview';

export default function PreviewModal({ isOpen, onClose, mode }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-primary border border-white/10 w-[80vw] max-w-[800px] aspect-video rounded-[12px] shadow-2xl flex flex-col overflow-hidden relative animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="h-12 bg-white/5 flex items-center justify-between px-4 border-b border-white/5 shrink-0">
          <span className="text-sm font-bold text-light uppercase tracking-widest">
            {mode === 'speaker' ? 'Speaker' : 'General'} View Preview
          </span>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-[12px] text-light transition-colors"
          >
            <PiX size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 w-full h-full bg-black relative overflow-hidden">
          <MiniPreview mode={mode} />
        </div>
      </div>
    </div>
  );
}
