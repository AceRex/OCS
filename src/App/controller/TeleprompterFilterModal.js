import React, { useState, useEffect } from "react";
import {
  PiX,
  PiSparkle,
  PiSlidersHorizontal,
  PiArrowCounterClockwise,
  PiCheck,
} from "react-icons/pi";

/**
 * Pro Camera Color Grading & Filter Presets
 */
export const PRO_FILTER_PRESETS = [
  {
    id: "normal",
    label: "Clean / Natural",
    description: "Standard balanced broadcast look with true colors",
    css: "none",
    settings: { brightness: 100, contrast: 100, saturation: 100, warmth: 0, grayscale: 0 },
    previewGradient: "from-slate-700 to-slate-900",
  },
  {
    id: "cinematic-bw",
    label: "Cinematic B&W",
    description: "Deep monochrome contrast with rich filmic shadows",
    css: "grayscale(100%) contrast(125%) brightness(105%)",
    settings: { brightness: 105, contrast: 125, saturation: 0, warmth: 0, grayscale: 100 },
    previewGradient: "from-zinc-900 via-neutral-600 to-zinc-900",
  },
  {
    id: "warm-studio",
    label: "Warm Studio",
    description: "Flattering warm skin tones with soft golden glow",
    css: "sepia(20%) saturate(115%) contrast(108%) brightness(104%)",
    settings: { brightness: 104, contrast: 108, saturation: 115, warmth: 20, grayscale: 0 },
    previewGradient: "from-amber-900/60 via-amber-700/50 to-orange-950",
  },
  {
    id: "cool-film",
    label: "Cool Teal Film",
    description: "Modern cinematic look with cool shadows & crisp highlights",
    css: "hue-rotate(190deg) saturate(95%) contrast(115%) brightness(102%)",
    settings: { brightness: 102, contrast: 115, saturation: 95, warmth: -25, grayscale: 0 },
    previewGradient: "from-cyan-950 via-teal-800/60 to-slate-950",
  },
  {
    id: "vivid-broadcast",
    label: "Vivid Broadcast",
    description: "Punchy color grading with enhanced clarity for live speech",
    css: "saturate(140%) contrast(118%) brightness(106%)",
    settings: { brightness: 106, contrast: 118, saturation: 140, warmth: 0, grayscale: 0 },
    previewGradient: "from-indigo-900 via-purple-800 to-pink-900",
  },
  {
    id: "vintage-noir",
    label: "Vintage Noir",
    description: "High-drama black and white with crushed dark tones",
    css: "grayscale(100%) contrast(160%) brightness(95%)",
    settings: { brightness: 95, contrast: 160, saturation: 0, warmth: 0, grayscale: 100 },
    previewGradient: "from-black via-zinc-800 to-black",
  },
];

export function getFilterStyleString(filterState) {
  if (!filterState) return "none";
  if (filterState.presetId && filterState.presetId !== "custom") {
    const preset = PRO_FILTER_PRESETS.find((p) => p.id === filterState.presetId);
    if (preset) return preset.css;
  }
  const { brightness = 100, contrast = 100, saturation = 100, warmth = 0, grayscale = 0 } =
    filterState.custom || {};

  const parts = [];
  if (grayscale > 0) parts.push(`grayscale(${grayscale}%)`);
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  if (saturation !== 100 && grayscale === 0) parts.push(`saturate(${saturation}%)`);
  if (warmth > 0) parts.push(`sepia(${warmth}%)`);
  if (warmth < 0) parts.push(`hue-rotate(${warmth * 4}deg)`);

  return parts.length > 0 ? parts.join(" ") : "none";
}

export default function TeleprompterFilterModal({
  isOpen,
  onClose,
  currentFilter,
  onApplyFilter,
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(currentFilter?.presetId || "normal");
  const [customSettings, setCustomSettings] = useState(
    currentFilter?.custom || {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      grayscale: 0,
    }
  );

  useEffect(() => {
    if (currentFilter) {
      setSelectedPresetId(currentFilter.presetId || "normal");
      if (currentFilter.custom) {
        setCustomSettings(currentFilter.custom);
      }
    }
  }, [currentFilter, isOpen]);

  const handleSelectPreset = (preset) => {
    setSelectedPresetId(preset.id);
    setCustomSettings({ ...preset.settings });
  };

  const handleSliderChange = (key, value) => {
    setSelectedPresetId("custom");
    setCustomSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleReset = () => {
    const normal = PRO_FILTER_PRESETS[0];
    setSelectedPresetId("normal");
    setCustomSettings({ ...normal.settings });
  };

  const handleSaveAndApply = () => {
    onApplyFilter({
      presetId: selectedPresetId,
      custom: customSettings,
      cssString: getFilterStyleString({ presetId: selectedPresetId, custom: customSettings }),
    });
    onClose();
  };

  if (!isOpen) return null;

  const currentPreviewFilter = getFilterStyleString({
    presetId: selectedPresetId,
    custom: customSettings,
  });

  return (
    <div className="fixed inset-0 z-[400] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 font-outfit select-none animate-fade-in">
      <div className="bg-[#11101a] border border-purple-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#161424]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-md shadow-purple-500/10">
              <PiSparkle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Professional Camera Color Grading
              </h2>
              <p className="text-xs text-white/50">
                Select cinematic camera profiles or fine-tune live color grading
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          >
            <PiX size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 no-scrollbar">
          
          {/* Live Filter Preview Swatch Box */}
          <div className="rounded-2xl p-4 bg-[#0a0a10] border border-white/10 flex items-center justify-between relative overflow-hidden">
            <div className="flex items-center gap-4">
              <div
                style={{ filter: currentPreviewFilter }}
                className="w-20 h-20 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 border border-white/20 shadow-inner flex items-center justify-center text-white font-black text-xs transition-all duration-200"
              >
                PREVIEW
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Active Look:{" "}
                  <span className="text-purple-400">
                    {selectedPresetId === "custom"
                      ? "Custom Manual Grading"
                      : PRO_FILTER_PRESETS.find((p) => p.id === selectedPresetId)?.label}
                  </span>
                </span>
                <span className="text-[10px] text-white/40 font-mono block mt-1">
                  CSS: {currentPreviewFilter}
                </span>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <PiArrowCounterClockwise size={13} /> Reset
            </button>
          </div>

          {/* Section 1: Color Grading Presets */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-3">
              Cinematic Profiles
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PRO_FILTER_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-2 relative group ${
                      isSelected
                        ? "bg-purple-900/30 border-purple-500/80 shadow-lg shadow-purple-500/20"
                        : "bg-[#181624]/60 border-white/5 hover:border-white/20 hover:bg-[#181624]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{preset.label}</span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center text-white text-[10px]">
                          <PiCheck size={12} />
                        </div>
                      )}
                    </div>
                    <div
                      className={`h-7 rounded-lg bg-gradient-to-r ${preset.previewGradient} border border-white/10 shadow-sm`}
                    />
                    <span className="text-[10px] text-white/40 line-clamp-2">
                      {preset.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Pro Manual Adjustments */}
          <div className="bg-[#181624]/40 p-4 rounded-2xl border border-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-white/50 flex items-center gap-2">
              <PiSlidersHorizontal size={14} className="text-cyan-400" />
              Manual Color Grading Adjustments
            </label>

            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Brightness</span>
                <span className="font-mono text-cyan-300">{customSettings.brightness}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="140"
                value={customSettings.brightness}
                onChange={(e) => handleSliderChange("brightness", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Contrast</span>
                <span className="font-mono text-cyan-300">{customSettings.contrast}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="160"
                value={customSettings.contrast}
                onChange={(e) => handleSliderChange("contrast", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Saturation (Color Depth)</span>
                <span className="font-mono text-cyan-300">{customSettings.saturation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={customSettings.saturation}
                onChange={(e) => handleSliderChange("saturation", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Warmth / Color Temperature */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Color Warmth / Temp</span>
                <span className="font-mono text-cyan-300">
                  {customSettings.warmth > 0
                    ? `+${customSettings.warmth} Warm`
                    : customSettings.warmth < 0
                    ? `${customSettings.warmth} Cool`
                    : "Neutral"}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={customSettings.warmth}
                onChange={(e) => handleSliderChange("warmth", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            {/* Monochrome Grayscale */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Black & White (B&W Grayscale)</span>
                <span className="font-mono text-cyan-300">{customSettings.grayscale}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={customSettings.grayscale}
                onChange={(e) => handleSliderChange("grayscale", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-[#161424] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndApply}
            className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 transition-all active:scale-95 flex items-center gap-2"
          >
            <PiCheck size={14} />
            Apply Color Profile
          </button>
        </div>

      </div>
    </div>
  );
}
