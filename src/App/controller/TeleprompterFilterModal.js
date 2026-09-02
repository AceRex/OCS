import React, { useState, useEffect, useRef } from "react";
import {
  PiX,
  PiSparkle,
  PiSlidersHorizontal,
  PiArrowCounterClockwise,
  PiCheck,
  PiSun,
  PiDrop,
  PiEye,
} from "react-icons/pi";

/**
 * Pro Camera Color Grading & Filter Presets
 */
export const PRO_FILTER_PRESETS = [
  {
    id: "normal",
    label: "Clean / Natural",
    description: "Standard balanced broadcast look with true colors & subtle sharpness",
    settings: { brightness: 100, contrast: 102, saturation: 100, warmth: 0, tint: 0, sharpness: 25, grayscale: 0 },
    previewGradient: "from-slate-700 to-slate-900",
  },
  {
    id: "warm-studio",
    label: "Warm Studio",
    description: "Flattering warm skin tones with soft golden glow & crisp studio edges",
    settings: { brightness: 104, contrast: 110, saturation: 115, warmth: 22, tint: 4, sharpness: 40, grayscale: 0 },
    previewGradient: "from-amber-900/60 via-amber-700/50 to-orange-950",
  },
  {
    id: "cool-film",
    label: "Cool Crisp Film",
    description: "Modern cinematic teal shadows and razor-sharp presentation highlights",
    settings: { brightness: 102, contrast: 115, saturation: 95, warmth: -20, tint: -6, sharpness: 50, grayscale: 0 },
    previewGradient: "from-cyan-950 via-teal-800/60 to-slate-950",
  },
  {
    id: "vivid-broadcast",
    label: "Vivid Broadcast",
    description: "Punchy color vibrancy with ultra-clear broadcast edge definition",
    settings: { brightness: 106, contrast: 120, saturation: 135, warmth: 0, tint: 0, sharpness: 60, grayscale: 0 },
    previewGradient: "from-indigo-900 via-purple-800 to-pink-900",
  },
  {
    id: "golden-hour",
    label: "Golden Hour",
    description: "Rich amber illumination with enhanced skin tone warmth & gentle contrast",
    settings: { brightness: 105, contrast: 108, saturation: 120, warmth: 35, tint: 10, sharpness: 30, grayscale: 0 },
    previewGradient: "from-amber-700 via-yellow-600 to-orange-900",
  },
  {
    id: "cinematic-bw",
    label: "Cinematic B&W",
    description: "Deep monochrome contrast with rich filmic shadows & detail",
    settings: { brightness: 105, contrast: 130, saturation: 0, warmth: 0, tint: 0, sharpness: 45, grayscale: 100 },
    previewGradient: "from-zinc-900 via-neutral-600 to-zinc-900",
  },
  {
    id: "vintage-noir",
    label: "Vintage Noir",
    description: "High-drama black and white with crushed dark tones & punchy sharpness",
    settings: { brightness: 96, contrast: 160, saturation: 0, warmth: 0, tint: 0, sharpness: 55, grayscale: 100 },
    previewGradient: "from-black via-zinc-800 to-black",
  },
];

/**
 * Generates an inline CSS filter string from the active filter settings.
 */
export function getFilterStyleString(filterState) {
  if (!filterState) return "none";

  let settings = filterState.custom;
  if (filterState.presetId && filterState.presetId !== "custom") {
    const preset = PRO_FILTER_PRESETS.find((p) => p.id === filterState.presetId);
    if (preset) {
      settings = { ...preset.settings, ...(filterState.custom || {}) };
    }
  }

  if (!settings) return "none";

  const {
    brightness = 100,
    contrast = 100,
    saturation = 100,
    warmth = 0,
    tint = 0,
    sharpness = 0,
    grayscale = 0,
  } = settings;

  const parts = [];

  // SVG Sharpener convolution matrix reference when sharpness > 0
  if (sharpness > 0) {
    parts.push("url(#tp-video-sharpener)");
  }

  if (grayscale > 0) parts.push(`grayscale(${grayscale}%)`);
  if (brightness !== 100) parts.push(`brightness(${brightness}%)`);
  if (contrast !== 100) parts.push(`contrast(${contrast}%)`);
  if (saturation !== 100 && grayscale === 0) parts.push(`saturate(${saturation}%)`);

  // Warmth (Color Temp): Warm amber vs Cool cyan
  if (warmth > 0) {
    parts.push(`sepia(${warmth * 0.4}%) saturate(${100 + warmth * 0.2}%)`);
  } else if (warmth < 0) {
    parts.push(`hue-rotate(${warmth * 2.5}deg) saturate(${100 - warmth * 0.1}%)`);
  }

  // Tint: Green to Magenta balance
  if (tint !== 0) {
    parts.push(`hue-rotate(${tint * 1.5}deg)`);
  }

  return parts.length > 0 ? parts.join(" ") : "none";
}

/**
 * Reusable SVG definition for GPU-accelerated video sharpening using feConvolveMatrix.
 */
export function TeleprompterSharpenerSvgDef({ sharpness = 0 }) {
  const k = (Math.max(0, Math.min(100, sharpness || 0)) / 100) * 1.2;
  const center = (1 + 4 * k).toFixed(2);
  const neg = (-k).toFixed(2);
  const matrix = `0 ${neg} 0 ${neg} ${center} ${neg} 0 ${neg} 0`;

  return (
    <svg
      className="absolute w-0 h-0 pointer-events-none opacity-0 overflow-hidden"
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0 }}
    >
      <defs>
        <filter id="tp-video-sharpener" x="0%" y="0%" width="100%" height="100%">
          <feConvolveMatrix order="3" preserveAlpha="true" kernelMatrix={matrix} />
        </filter>
      </defs>
    </svg>
  );
}

export default function TeleprompterFilterModal({
  isOpen,
  onClose,
  currentFilter,
  onApplyFilter,
  videoStream = null,
}) {
  const [selectedPresetId, setSelectedPresetId] = useState(currentFilter?.presetId || "normal");
  const [customSettings, setCustomSettings] = useState(() => {
    const normal = PRO_FILTER_PRESETS[0].settings;
    return currentFilter?.custom ? { ...normal, ...currentFilter.custom } : { ...normal };
  });

  const livePreviewVideoRef = useRef(null);

  useEffect(() => {
    if (currentFilter) {
      setSelectedPresetId(currentFilter.presetId || "normal");
      if (currentFilter.custom) {
        setCustomSettings((prev) => ({ ...prev, ...currentFilter.custom }));
      }
    }
  }, [currentFilter, isOpen]);

  // Attach live camera stream to in-modal preview video
  useEffect(() => {
    if (isOpen && livePreviewVideoRef.current && videoStream) {
      livePreviewVideoRef.current.srcObject = videoStream;
      livePreviewVideoRef.current.play().catch(() => {});
    }
  }, [isOpen, videoStream]);

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
      {/* SVG Sharpener Definition */}
      <TeleprompterSharpenerSvgDef sharpness={customSettings.sharpness} />

      <div className="bg-[#11101a] border border-purple-500/30 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-[#161424]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shadow-md shadow-purple-500/10">
              <PiSparkle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Camera Sharpener & Color Grading
              </h2>
              <p className="text-xs text-white/50">
                Enhance edge clarity, apply cinematic profiles, and balance color tones
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
          <div className="rounded-2xl p-4 bg-[#0a0a10] border border-white/10 flex items-center justify-between relative overflow-hidden gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {videoStream ? (
                <div className="w-24 h-20 rounded-xl overflow-hidden border border-white/20 shadow-inner bg-black shrink-0 relative">
                  <video
                    ref={livePreviewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ filter: currentPreviewFilter }}
                    className="w-full h-full object-cover transition-all duration-200"
                  />
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold text-white tracking-wider uppercase">
                    LIVE
                  </span>
                </div>
              ) : (
                <div
                  style={{ filter: currentPreviewFilter }}
                  className="w-20 h-20 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-500 border border-white/20 shadow-inner flex items-center justify-center text-white font-black text-xs transition-all duration-200 shrink-0"
                >
                  PREVIEW
                </div>
              )}
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block truncate">
                  Active Look:{" "}
                  <span className="text-purple-400">
                    {selectedPresetId === "custom"
                      ? "Custom Manual Grading"
                      : PRO_FILTER_PRESETS.find((p) => p.id === selectedPresetId)?.label}
                  </span>
                </span>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-cyan-300 font-mono">
                    Sharp: {customSettings.sharpness || 0}%
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-amber-300 font-mono">
                    Temp: {customSettings.warmth > 0 ? `+${customSettings.warmth}` : customSettings.warmth}
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-purple-300 font-mono">
                    Contrast: {customSettings.contrast}%
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleReset}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0"
            >
              <PiArrowCounterClockwise size={13} /> Reset
            </button>
          </div>

          {/* Section 1: Color Grading Presets */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-purple-400 block mb-3">
              Cinematic Camera Profiles
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {PRO_FILTER_PRESETS.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 relative group ${
                      isSelected
                        ? "bg-purple-900/30 border-purple-500/80 shadow-lg shadow-purple-500/20"
                        : "bg-[#181624]/60 border-white/5 hover:border-white/20 hover:bg-[#181624]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{preset.label}</span>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-white text-[9px]">
                          <PiCheck size={10} />
                        </div>
                      )}
                    </div>
                    <div
                      className={`h-5 rounded-lg bg-gradient-to-r ${preset.previewGradient} border border-white/10 shadow-sm`}
                    />
                    <span className="text-[10px] text-white/40 line-clamp-2 leading-tight">
                      {preset.description}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Video Sharpener */}
          <div className="bg-[#181624]/40 p-4 rounded-2xl border border-white/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                <PiEye size={14} className="text-cyan-400" />
                Video Sharpener (Edge Clarity)
              </label>
              <div className="flex items-center gap-1">
                {[
                  { label: "Off", val: 0 },
                  { label: "Subtle", val: 25 },
                  { label: "Studio", val: 50 },
                  { label: "Punchy", val: 75 },
                  { label: "Ultra", val: 100 },
                ].map((s) => (
                  <button
                    key={s.val}
                    onClick={() => handleSliderChange("sharpness", s.val)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                      customSettings.sharpness === s.val
                        ? "bg-cyan-500 text-black shadow-md shadow-cyan-500/20"
                        : "bg-white/5 text-white/50 hover:text-white"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Sharpness Intensity</span>
                <span className="font-mono text-cyan-300">{customSettings.sharpness || 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={customSettings.sharpness || 0}
                onChange={(e) => handleSliderChange("sharpness", parseInt(e.target.value, 10))}
                className="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Section 3: Color Balancing Effects (White Balance & Tint) */}
          <div className="bg-[#181624]/40 p-4 rounded-2xl border border-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <PiSun size={14} className="text-amber-400" />
              Color Balancing (White Balance & Tint)
            </label>

            {/* White Balance / Temperature */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Color Temperature (Cool Cyan ↔ Warm Amber)</span>
                <span className="font-mono text-amber-300">
                  {customSettings.warmth > 0
                    ? `+${customSettings.warmth} Warm Amber`
                    : customSettings.warmth < 0
                    ? `${customSettings.warmth} Cool Cyan`
                    : "Neutral Balanced"}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={customSettings.warmth || 0}
                onChange={(e) => handleSliderChange("warmth", parseInt(e.target.value, 10))}
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            {/* Tint Balance */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Tint Balance (Green ↔ Magenta)</span>
                <span className="font-mono text-rose-300">
                  {customSettings.tint > 0
                    ? `+${customSettings.tint} Magenta`
                    : customSettings.tint < 0
                    ? `${customSettings.tint} Green`
                    : "Neutral"}
                </span>
              </div>
              <input
                type="range"
                min="-50"
                max="50"
                value={customSettings.tint || 0}
                onChange={(e) => handleSliderChange("tint", parseInt(e.target.value, 10))}
                className="w-full accent-rose-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Section 4: Pro Color Grading & Tone */}
          <div className="bg-[#181624]/40 p-4 rounded-2xl border border-white/5 space-y-4">
            <label className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
              <PiSlidersHorizontal size={14} className="text-purple-400" />
              Color Grading & Tone Curves
            </label>

            {/* Brightness */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Brightness / Exposure</span>
                <span className="font-mono text-purple-300">{customSettings.brightness}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="140"
                value={customSettings.brightness}
                onChange={(e) => handleSliderChange("brightness", parseInt(e.target.value, 10))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>

            {/* Contrast */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Contrast & Punch</span>
                <span className="font-mono text-purple-300">{customSettings.contrast}%</span>
              </div>
              <input
                type="range"
                min="70"
                max="160"
                value={customSettings.contrast}
                onChange={(e) => handleSliderChange("contrast", parseInt(e.target.value, 10))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>

            {/* Saturation */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Saturation & Color Depth</span>
                <span className="font-mono text-purple-300">{customSettings.saturation}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={customSettings.saturation}
                onChange={(e) => handleSliderChange("saturation", parseInt(e.target.value, 10))}
                className="w-full accent-purple-400 cursor-pointer"
              />
            </div>

            {/* Monochrome Grayscale */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60 font-semibold">Black & White (B&W Conversion)</span>
                <span className="font-mono text-purple-300">{customSettings.grayscale}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={customSettings.grayscale}
                onChange={(e) => handleSliderChange("grayscale", parseInt(e.target.value, 10))}
                className="w-full accent-purple-400 cursor-pointer"
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
            Apply Look
          </button>
        </div>
      </div>
    </div>
  );
}
