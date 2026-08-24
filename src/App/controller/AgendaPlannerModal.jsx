import React, { useState } from 'react';
import {
  PiCalendarCheck,
  PiMicrophone,
  PiMicrophoneSlash,
  PiImage,
  PiVideo,
  PiSpeakerHigh,
  PiPlay,
  PiX,
  PiCheck,
  PiSparkle,
  PiClock,
  PiSliders,
  PiPalette,
} from 'react-icons/pi';

export default function AgendaPlannerModal({
  isOpen,
  onClose,
  agenda = [],
  onApplyPlan,
  onStartWithPlan,
}) {
  // Map of session _id -> { recordAudio: boolean, startCue: {}, midCue: {}, endCue: {} }
  const [plannerConfig, setPlannerConfig] = useState(() => {
    const initial = {};
    (agenda || []).forEach((item) => {
      initial[item._id] = {
        recordAudio: true,
        startMedia: 'none', // 'none' | 'color' | 'image' | 'video' | 'audio'
        startValue: '',
        midMedia: 'warning_color', // 'none' | 'warning_color' | 'audio' | 'image'
        midValue: '',
        endMedia: 'blackout', // 'none' | 'blackout' | 'video' | 'audio' | 'image'
        endValue: '',
      };
    });
    return initial;
  });

  const [selectedItemId, setSelectedItemId] = useState(
    agenda && agenda.length > 0 ? agenda[0]._id : null
  );

  if (!isOpen) return null;

  const currentItem = agenda?.find((a) => a._id === selectedItemId) || agenda?.[0];
  const currentItemConfig = (currentItem && plannerConfig[currentItem._id]) || {
    recordAudio: true,
    startMedia: 'none',
    startValue: '',
    midMedia: 'warning_color',
    midValue: '',
    endMedia: 'blackout',
    endValue: '',
  };

  const toggleRecordAll = (enabled) => {
    setPlannerConfig((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = { ...next[k], recordAudio: enabled };
      });
      return next;
    });
  };

  const updateItemConfig = (id, key, val) => {
    setPlannerConfig((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {
          recordAudio: true,
          startMedia: 'none',
          startValue: '',
          midMedia: 'warning_color',
          midValue: '',
          endMedia: 'blackout',
          endValue: '',
        }),
        [key]: val,
      },
    }));
  };

  const handleSaveOnly = () => {
    if (onApplyPlan) onApplyPlan(plannerConfig);
    onClose();
  };

  const handleStartNow = () => {
    if (onStartWithPlan) onStartWithPlan(plannerConfig, currentItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[#120F1D] border border-[#2E2542] rounded-3xl shadow-2xl flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#2E2542] bg-[#1A1428] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/30">
              <PiCalendarCheck size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black uppercase tracking-wider text-white">Agenda Planner</h2>
                <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-[10px] font-bold text-purple-300">
                  Tier 2 Smart Automation
                </span>
              </div>
              <p className="text-xs text-white/50">
                Choose recording sessions and automate start, mid-run, and completion media triggers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <PiX size={16} />
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x divide-[#2E2542]">
          {/* Left Session List (5 cols) */}
          <div className="md:col-span-5 p-4 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-white/5">
              <span className="text-[11px] font-black uppercase tracking-wider text-white/60">
                Agenda Sessions ({agenda?.length || 0})
              </span>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => toggleRecordAll(true)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-violet-300 font-bold"
                >
                  Record All
                </button>
                <button
                  type="button"
                  onClick={() => toggleRecordAll(false)}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 font-bold"
                >
                  None
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
              {agenda?.map((item) => {
                const conf = plannerConfig[item._id] || { recordAudio: true };
                const isSelected = selectedItemId === item._id;
                return (
                  <div
                    key={item._id}
                    onClick={() => setSelectedItemId(item._id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-violet-600/20 border-violet-500/50 shadow-md shadow-violet-950/40'
                        : 'bg-[#1A1428] border-[#2E2542] hover:bg-[#231A36]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">
                          {item.agenda || item.anchor || 'Session Item'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-white/40 mt-0.5">
                        <span>{Math.floor((Number(item.time) || 0) / 60)} mins</span>
                        {item.anchor && <span>• {item.anchor}</span>}
                      </div>
                    </div>

                    {/* Audio Record Toggle Pill */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateItemConfig(item._id, 'recordAudio', !conf.recordAudio);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 border ${
                        conf.recordAudio
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
                      }`}
                      title={conf.recordAudio ? 'Recording enabled for this session' : 'Audio recording skipped'}
                    >
                      {conf.recordAudio ? (
                        <>
                          <PiMicrophone size={13} className="text-emerald-400" />
                          <span>Record</span>
                        </>
                      ) : (
                        <>
                          <PiMicrophoneSlash size={13} />
                          <span>Mute Rec</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Trigger Cue Settings (7 cols) */}
          <div className="md:col-span-7 p-6 overflow-y-auto space-y-6">
            {currentItem ? (
              <>
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white">{currentItem.agenda || 'Session Configuration'}</h3>
                    <p className="text-[11px] text-white/40">Automate display background and media triggers for this item</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs font-mono font-bold">
                    {Math.floor((Number(currentItem.time) || 0) / 60)}:00
                  </span>
                </div>

                {/* Trigger 1: When Agenda Starts */}
                <div className="p-4 rounded-2xl bg-[#1A1428] border border-[#2E2542] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-violet-300 flex items-center gap-2">
                      <PiSparkle size={14} /> 1. When Agenda Starts
                    </label>
                    <span className="text-[10px] text-white/40">Trigger on countdown start</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'none', label: 'Default / None', icon: PiClock },
                      { id: 'color', label: 'Solid Color', icon: PiPalette },
                      { id: 'video', label: 'Intro Video', icon: PiVideo },
                      { id: 'audio', label: 'Intro Chime', icon: PiSpeakerHigh },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateItemConfig(currentItem._id, 'startMedia', opt.id)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all ${
                          currentItemConfig.startMedia === opt.id
                            ? 'bg-violet-600/30 border-violet-500 text-white shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <opt.icon size={16} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  {currentItemConfig.startMedia === 'color' && (
                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="color"
                        value={currentItemConfig.startValue || '#1A1428'}
                        onChange={(e) => updateItemConfig(currentItem._id, 'startValue', e.target.value)}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                      />
                      <span className="text-xs font-mono text-white/60">Display background color on start</span>
                    </div>
                  )}
                </div>

                {/* Trigger 2: In the Middle of Running Timer */}
                <div className="p-4 rounded-2xl bg-[#1A1428] border border-[#2E2542] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
                      <PiClock size={14} /> 2. Mid-Run Trigger (Half-time / 2m left)
                    </label>
                    <span className="text-[10px] text-white/40">Warning cue</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'none', label: 'None', icon: PiClock },
                      { id: 'warning_color', label: 'Flash Amber', icon: PiPalette },
                      { id: 'audio', label: 'Warning Chime', icon: PiSpeakerHigh },
                      { id: 'image', label: 'Prompt Image', icon: PiImage },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateItemConfig(currentItem._id, 'midMedia', opt.id)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all ${
                          currentItemConfig.midMedia === opt.id
                            ? 'bg-amber-600/30 border-amber-500 text-white shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <opt.icon size={16} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Trigger 3: When Agenda Ends */}
                <div className="p-4 rounded-2xl bg-[#1A1428] border border-[#2E2542] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                      <PiCheck size={14} /> 3. When Agenda Ends (On Time Up)
                    </label>
                    <span className="text-[10px] text-white/40">Completion wrap</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'blackout', label: 'Auto Blackout', icon: PiClock },
                      { id: 'video', label: 'Outro Video', icon: PiVideo },
                      { id: 'audio', label: 'Outro Chime', icon: PiSpeakerHigh },
                      { id: 'none', label: 'Hold Display', icon: PiSparkle },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updateItemConfig(currentItem._id, 'endMedia', opt.id)}
                        className={`p-2.5 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1.5 transition-all ${
                          currentItemConfig.endMedia === opt.id
                            ? 'bg-emerald-600/30 border-emerald-500 text-white shadow-sm'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                        }`}
                      >
                        <opt.icon size={16} />
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="py-16 text-center text-xs text-white/40">No agenda sessions available to plan.</div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[#2E2542] bg-[#1A1428] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/70 hover:text-white transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveOnly}
              className="px-4 py-2.5 rounded-xl bg-[#2E2542] hover:bg-[#3E3355] text-xs font-bold text-white transition-colors"
            >
              Save Plan
            </button>
            <button
              type="button"
              onClick={handleStartNow}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-purple-950/50 flex items-center gap-2 transition-all"
            >
              <PiPlay size={14} className="fill-white" /> Start Agenda With Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
