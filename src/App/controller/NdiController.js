import React, { useState, useEffect } from "react";
import {
  PiBroadcast,
  PiTelevision,
  PiCopy,
  PiCheck,
  PiArrowClockwise,
  PiShieldCheck,
  PiGear,
  PiMonitor,
  PiCpu,
  PiVideoCamera,
  PiInfo,
  PiEye,
  PiLightning,
  PiCheckCircle,
  PiRadio,
} from "react-icons/pi";
import DisabledContainer from "../components/DisabledContainer";

function NdiPanel() {
  const [status, setStatus] = useState({
    enabled: false,
    isRunning: false,
    nativeNdiAvailable: false,
    programStreamName: "OCS - Program Output",
    stageStreamName: "OCS - Stage Display",
    alphaEnabled: true,
    resolution: "1080p",
    fps: 30,
    stats: {
      programFps: 0,
      stageFps: 0,
      programFramesSent: 0,
      stageFramesSent: 0,
      activeClients: 0,
      uptimeSeconds: 0,
    },
    urls: {
      programOverlay: "http://127.0.0.1:4000/overlay/program",
      stageOverlay: "http://127.0.0.1:4000/overlay/stage",
      programMjpeg: "http://127.0.0.1:4000/stream/program.mjpg",
      stageMjpeg: "http://127.0.0.1:4000/stream/stage.mjpg",
    },
    localIp: "127.0.0.1",
    port: 4000,
  });

  const [discoveredSources, setDiscoveredSources] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeGuideTab, setActiveGuideTab] = useState("obs");

  const handleScanSources = async () => {
    setIsScanning(true);
    try {
      if (window.electron?.Ndi?.discoverSources) {
        const sources = await window.electron.Ndi.discoverSources();
        if (Array.isArray(sources)) {
          setDiscoveredSources(sources);
        }
      }
    } catch (_) {
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    if (window.electron?.Ndi?.getStatus) {
      window.electron.Ndi.getStatus().then((res) => {
        if (res) setStatus(res);
      });
    }

    // Subscribe to live status updates
    const unsub = window.electron?.Ndi?.onStatusUpdate?.((updated) => {
      if (updated) setStatus(updated);
    });

    // Auto-discover sources
    handleScanSources();

    const interval = setInterval(() => {
      if (window.electron?.Ndi?.getStatus) {
        window.electron.Ndi.getStatus().then((res) => {
          if (res) setStatus(res);
        });
      }
    }, 2500);

    return () => {
      unsub?.();
      clearInterval(interval);
    };
  }, []);

  const handleUpdateConfig = async (patch) => {
    if (window.electron?.Ndi?.setConfig) {
      const updated = await window.electron.Ndi.setConfig(patch);
      if (updated) setStatus(updated);
    }
  };

  const handleRestartStream = async () => {
    if (window.electron?.Ndi?.restartStream) {
      const updated = await window.electron.Ndi.restartStream();
      if (updated) setStatus(updated);
    }
  };

  const programOverlayUrl = status.urls?.programOverlay || `http://${status.localIp || "127.0.0.1"}:${status.port || 4000}/overlay/program`;
  const programMjpegUrl = status.urls?.programMjpeg || `http://${status.localIp || "127.0.0.1"}:${status.port || 4000}/stream/program.mjpg`;
  const stageOverlayUrl = status.urls?.stageOverlay || `http://${status.localIp || "127.0.0.1"}:${status.port || 4000}/overlay/stage`;
  const stageMjpegUrl = status.urls?.stageMjpeg || `http://${status.localIp || "127.0.0.1"}:${status.port || 4000}/stream/stage.mjpg`;

  const copyToClipboard = async (text, key) => {
    const val = text || (
      key === "obs-program" ? programOverlayUrl :
      key === "mjpeg-program" ? programMjpegUrl :
      key === "obs-stage" ? stageOverlayUrl :
      key === "mjpeg-stage" ? stageMjpegUrl : ""
    );
    if (!val) return;
    try {
      let written = false;

      // 1. Electron bridge (direct / IPC)
      if (window.electron?.Clipboard?.writeText) {
        try {
          await window.electron.Clipboard.writeText(val);
          written = true;
        } catch (_) {}
      }
      if (!written && window.electron?.copyToClipboard) {
        try {
          await window.electron.copyToClipboard(val);
          written = true;
        } catch (_) {}
      }

      // 2. Standard navigator.clipboard API
      if (!written && navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(val);
          written = true;
        } catch (_) {}
      }

      // 3. Robust DOM fallback
      if (!written) {
        const textarea = document.createElement("textarea");
        textarea.value = val;
        textarea.setAttribute("readonly", "");
        textarea.style.contain = "strict";
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        textarea.style.fontSize = "12pt";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch (err) {
      console.warn("Failed to copy to clipboard:", err);
    }
  };

  return (
    <div
      className="flex flex-col gap-6 text-white h-full overflow-y-auto font-outfit p-8 no-scrollbar bg-[#0B0814]"
      style={{ fontFamily: "'Outfit', 'Space Grotesk', sans-serif" }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-[#2E2542]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <PiBroadcast size={28} />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black uppercase tracking-widest text-[#F5F2FA]">
                NDI & Broadcast Streaming
              </h2>
              <span
                className={`px-3 py-0.5 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 ${
                  status.isRunning
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    : "bg-red-500/20 text-red-400 border border-red-500/40"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    status.isRunning ? "bg-emerald-400 animate-pulse" : "bg-red-400"
                  }`}
                />
                {status.isRunning ? "LIVE ON LAN" : "STOPPED"}
              </span>
            </div>
            <p className="text-xs text-[#8882A4] mt-0.5">
              Stream OCS scripture, presentation slides, lower-thirds & stage view to OBS, vMix, TriCaster & Zoom
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRestartStream}
            disabled={!status.isRunning && !status.enabled}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              status.isRunning || status.enabled
                ? "bg-[#1A1428] hover:bg-[#231A36] text-purple-300 border border-[#2E2542] cursor-pointer shadow-sm hover:border-purple-500/40"
                : "bg-[#120D1D] text-slate-600 border border-slate-800/40 cursor-not-allowed opacity-40 pointer-events-none"
            }`}
            title={status.isRunning || status.enabled ? "Refresh and restart all NDI & WebRTC video streams" : "Streaming must be started before restarting streams"}
          >
            <PiArrowClockwise size={16} /> Restart Streams
          </button>
          <button
            onClick={() => handleUpdateConfig({ enabled: !status.enabled })}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-md ${
              status.enabled
                ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                : "bg-emerald-500 text-black hover:bg-emerald-400 font-black shadow-emerald-500/20"
            }`}
          >
            <PiBroadcast size={16} />
            {status.enabled ? "Disable All Streams" : "Enable Streaming"}
          </button>
        </div>
      </div>

      {/* Network Info & Mode Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1A1428] border border-[#2E2542] p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">LAN Broadcast IP</p>
            <p className="text-sm font-mono font-bold text-white mt-1">{status.localIp}:{status.port}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <PiRadio size={22} />
          </div>
        </div>

        <div className="bg-[#1A1428] border border-[#2E2542] p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Streaming Protocol</p>
            <p className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
              <PiShieldCheck size={16} />
              {status.nativeNdiAvailable ? "Native NDI SDK Active" : "NDI LAN + OBS Overlay Active"}
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <PiCpu size={22} />
          </div>
        </div>

        <div className="bg-[#1A1428] border border-[#2E2542] p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-[#8882A4] uppercase tracking-widest">Active Receivers</p>
            <p className="text-sm font-bold text-cyan-400 mt-1">
              {status.stats?.activeClients || 0} Connected Client(s)
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <PiTelevision size={22} />
          </div>
        </div>
      </div>

      {/* Main Stream Channels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stream 1: Program Output */}
        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <PiMonitor size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Channel 1: Program Output</h3>
                  <p className="text-xs text-[#8882A4]">Main screen, Bible verses, lyrics & slide decks</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                {status.resolution} • {status.fps} FPS
              </span>
            </div>

            {/* Quick URL Cards */}
            <div className="space-y-3 my-4">
              {/* OBS Browser Source URL */}
              <div className="bg-[#0B0814] p-3.5 rounded-2xl border border-[#2E2542] flex items-center justify-between gap-3">
                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                      OBS Studio / vMix Browser Overlay
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">
                      Alpha Transparent
                    </span>
                  </div>
                  <p className="text-xs font-mono text-[#8882A4] truncate">{programOverlayUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(programOverlayUrl, "obs-program")}
                  className="px-3 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copiedKey === "obs-program" ? <PiCheck size={14} /> : <PiCopy size={14} />}
                  {copiedKey === "obs-program" ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Direct MJPEG Stream */}
              <div className="bg-[#0B0814] p-3.5 rounded-2xl border border-[#2E2542] flex items-center justify-between gap-3">
                <div className="flex-1 overflow-hidden">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#A788FA] mb-1 block">
                    Direct Video Stream (vMix / VLC / Media Source)
                  </span>
                  <p className="text-xs font-mono text-[#8882A4] truncate">{programMjpegUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(programMjpegUrl, "mjpeg-program")}
                  className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-[#A788FA] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copiedKey === "mjpeg-program" ? <PiCheck size={14} /> : <PiCopy size={14} />}
                  {copiedKey === "mjpeg-program" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {/* Config Controls */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-[#2E2542]">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                  Resolution
                </label>
                <div className="flex gap-1.5 bg-[#0B0814] p-1 rounded-xl border border-[#2E2542]">
                  {["1080p", "720p"].map((res) => {
                    const isSelected = (status.resolution || "1080p").toLowerCase() === res.toLowerCase();
                    return (
                      <button
                        key={res}
                        onClick={() => handleUpdateConfig({ resolution: res })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-cyan-400 text-slate-950 font-black shadow-md shadow-cyan-400/20"
                            : "text-slate-200 hover:text-white hover:bg-[#1A1428]"
                        }`}
                      >
                        {res}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                  Frame Rate
                </label>
                <div className="flex gap-1.5 bg-[#0B0814] p-1 rounded-xl border border-[#2E2542]">
                  {[30, 60].map((fps) => {
                    const isSelected = Number(status.fps) === fps;
                    return (
                      <button
                        key={fps}
                        onClick={() => handleUpdateConfig({ fps })}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-cyan-400 text-slate-950 font-black shadow-md shadow-cyan-400/20"
                            : "text-slate-200 hover:text-white hover:bg-[#1A1428]"
                        }`}
                      >
                        {fps} FPS
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stream 2: Stage Display */}
        <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl flex flex-col justify-between relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <PiTelevision size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Channel 2: Stage Display View</h3>
                  <p className="text-xs text-[#8882A4]">Speaker confidence monitor, live timer & notes</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 text-[10px] font-black uppercase tracking-wider">
                Stage Feed
              </span>
            </div>

            {/* Quick URL Cards */}
            <div className="space-y-3 my-4">
              {/* Stage Browser URL */}
              <div className="bg-[#0B0814] p-3.5 rounded-2xl border border-[#2E2542] flex items-center justify-between gap-3">
                <div className="flex-1 overflow-hidden">
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 mb-1 block">
                    Stage Confidence Monitor Web View
                  </span>
                  <p className="text-xs font-mono text-[#8882A4] truncate">{stageOverlayUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(stageOverlayUrl, "obs-stage")}
                  className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copiedKey === "obs-stage" ? <PiCheck size={14} /> : <PiCopy size={14} />}
                  {copiedKey === "obs-stage" ? "Copied!" : "Copy"}
                </button>
              </div>

              {/* Stage MJPEG Stream */}
              <div className="bg-[#0B0814] p-3.5 rounded-2xl border border-[#2E2542] flex items-center justify-between gap-3">
                <div className="flex-1 overflow-hidden">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#A788FA] mb-1 block">
                    Stage Live Video Stream
                  </span>
                  <p className="text-xs font-mono text-[#8882A4] truncate">{stageMjpegUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(stageMjpegUrl, "mjpeg-stage")}
                  className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-[#A788FA] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {copiedKey === "mjpeg-stage" ? <PiCheck size={14} /> : <PiCopy size={14} />}
                  {copiedKey === "mjpeg-stage" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-[#2E2542] flex items-center justify-between">
              <span className="text-xs text-[#8882A4]">NDI Stream Name:</span>
              <span className="text-xs font-mono font-bold text-white bg-[#0B0814] px-3 py-1.5 rounded-xl border border-[#2E2542]">
                {status.stageStreamName}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Discovered LAN NDI Sources & PTZ Cameras */}
      <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <PiVideoCamera size={18} />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Discovered Network NDI & Camera Sources</h3>
              <p className="text-xs text-[#8882A4]">Auto-detected video feeds on church local network</p>
            </div>
          </div>
          <button
            onClick={handleScanSources}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-[#0B0814] hover:bg-[#231A36] text-cyan-400 border border-[#2E2542] rounded-xl text-xs font-bold transition-all"
          >
            <PiArrowClockwise size={14} className={isScanning ? "animate-spin" : ""} />
            {isScanning ? "Scanning LAN..." : "Scan LAN Sources"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {discoveredSources.map((source, idx) => (
            <div
              key={source.id || idx}
              className="bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542] flex items-center justify-between"
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div
                  className={`w-3 h-3 rounded-full ${
                    source.isLocal ? "bg-cyan-400" : "bg-emerald-400"
                  }`}
                />
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-white truncate">{source.name}</p>
                  <p className="text-[10px] text-[#8882A4]">{source.type} • {source.ip}</p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-white/5 text-[#8882A4]">
                {source.isLocal ? "Local OCS" : "LAN Source"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Integration Guide Section */}
      <div className="bg-[#1A1428] border border-[#2E2542] p-6 rounded-3xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
            <PiInfo size={18} />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">How to Connect OCS with Other Broadcast Apps</h3>
            <p className="text-xs text-[#8882A4]">Quick connection guides for OBS Studio, vMix, Zoom & TriCaster</p>
          </div>
        </div>

        {/* Guide Tabs */}
        <div className="flex gap-2 mb-4 border-b border-[#2E2542] pb-3">
          {[
            { id: "obs", label: "OBS Studio" },
            { id: "vmix", label: "vMix" },
            { id: "zoom", label: "Zoom / Teams" },
            { id: "propresenter", label: "ProPresenter" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveGuideTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeGuideTab === tab.id
                  ? "bg-[#A788FA] text-[#0B0814] font-black"
                  : "bg-[#0B0814] text-[#8882A4] hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Guide Content */}
        <div className="text-xs text-[#8882A4] space-y-2 leading-relaxed bg-[#0B0814] p-4 rounded-2xl border border-[#2E2542]">
          {activeGuideTab === "obs" && (
            <div>
              <p className="font-bold text-white mb-2">Option A: Transparent Lower Third Overlay (Recommended for Lyrics & Scripture)</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>In OBS Studio, click <strong className="text-white">+ (Add Source)</strong> → select <strong className="text-white">Browser</strong>.</li>
                <li>Set URL to <code className="text-cyan-400 bg-white/5 px-2 py-0.5 rounded">{status.urls?.programOverlay}</code>.</li>
                <li>Set Width: <strong className="text-white">1920</strong>, Height: <strong className="text-white">1080</strong>, and check <strong className="text-white">"Shutdown source when not visible"</strong>.</li>
                <li>Scripture and lyrics will seamlessly overlay your camera feed with 100% transparency!</li>
              </ol>
              <p className="font-bold text-white mt-4 mb-2">Option B: NDI Source</p>
              <p>With the OBS-NDI plugin installed, add an <strong>NDI™ Source</strong> and select <strong className="text-cyan-400">"{status.programStreamName}"</strong> from the dropdown.</p>
            </div>
          )}

          {activeGuideTab === "vmix" && (
            <div>
              <p className="font-bold text-white mb-2">Connecting to vMix Live Production</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>In vMix, click <strong className="text-white">Add Input</strong> → select <strong className="text-white">NDI / Desktop Capture</strong>.</li>
                <li>Select <strong className="text-emerald-400">"{status.programStreamName}"</strong> or <strong className="text-purple-400">"{status.stageStreamName}"</strong>.</li>
                <li>Alternatively, add a <strong className="text-white">Web Browser</strong> input pointing to <code className="text-cyan-400 bg-white/5 px-2 py-0.5 rounded">{status.urls?.programOverlay}</code>.</li>
              </ol>
            </div>
          )}

          {activeGuideTab === "zoom" && (
            <div>
              <p className="font-bold text-white mb-2">Sending OCS into Zoom / Google Meet / Microsoft Teams</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>Add OCS as a Browser Source or NDI Source inside OBS Studio.</li>
                <li>Click <strong className="text-white">"Start Virtual Camera"</strong> in OBS Studio.</li>
                <li>In Zoom or Teams, select <strong className="text-white">"OBS Virtual Camera"</strong> as your webcam input.</li>
              </ol>
            </div>
          )}

          {activeGuideTab === "propresenter" && (
            <div>
              <p className="font-bold text-white mb-2">NDI Integration with ProPresenter</p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>In ProPresenter, open <strong className="text-white">Screens → Configure Screens</strong>.</li>
                <li>Add an <strong className="text-white">NDI Output</strong> or <strong className="text-white">Video Input (NDI)</strong>.</li>
                <li>Select <strong className="text-cyan-400">"{status.programStreamName}"</strong> to feed OCS slides and bible verses into ProPresenter stages.</li>
          </ol>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NdiController() {
  return (
    <DisabledContainer
      featureName="NDI & Live Streaming"
      description="Authenticated workstation access is required to enable NDI output and live video streaming."
    >
      <NdiPanel />
    </DisabledContainer>
  );
}

