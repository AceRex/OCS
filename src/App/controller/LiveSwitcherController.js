import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  PiVideoCamera,
  PiMonitor,
  PiArrowCounterClockwise,
  PiUser,
  PiCheckCircle,
  PiWarning,
  PiTelevision,
  PiUsersThree,
  PiLockKey,
  PiBroadcast,
  PiSlidersHorizontal,
  PiLightning,
  PiClock,
  PiArrowRight,
  PiArrowLeft,
  PiArrowDown,
  PiArrowUp,
  PiArrowsLeftRight,
  PiPlay,
  PiRadio,
  PiDeviceMobile,
  PiX,
  PiArrowsClockwise,
  PiPlus,
  PiTrash,
  PiBookOpen,
  PiIdentificationCard,
  PiMegaphone,
  PiCube,
  PiSparkle,
  PiStack,
  PiImage,
  PiEye,
  PiEyeSlash,
  PiCornersOut,
  PiDotsSixVertical,
  PiCheck,
  PiFolderOpen,
  PiPaintBrush,
  PiCircle,
  PiRectangle,
  PiTriangle,
  PiMicrophone,
  PiStar,
} from "react-icons/pi";
import SwitcherCameraTile from "./SwitcherCameraTile";
import SwitcherMonitorTile from "./SwitcherMonitorTile";
import SwitcherProgramCanvas from "./SwitcherProgramCanvas";
import localCameraManager from "./LocalCameraManager";
import { broadcastAudioBus } from "./broadcastAudioBus";

/** Total camera slots in the multiview grid (always rendered, even if empty) */
const TOTAL_SLOTS = 6;

import {
  DEFAULT_LOWER_THIRD_STYLE,
  LOWER_THIRD_TEMPLATES,
  renderCustomLowerThirdUI,
} from "./LowerThirdGraphic";

export {
  DEFAULT_LOWER_THIRD_STYLE,
  LOWER_THIRD_TEMPLATES,
  renderCustomLowerThirdUI,
};

export const DEFAULT_BROADCAST_CONFIG = {
  scale: 1.0,
  fitMode: "cover",
  logo: {
    enabled: true,
    preset: "cross",
    url: "",
    position: "top-right",
    size: 72,
    opacity: 0.9,
  },
  lowerThird: {
    enabled: false,
    title: "Pastor John Doe",
    subtitle: "Senior Pastor",
    theme: "purple",
    autoHideSec: 0,
    x: 22,
    y: 88,
    width: 36,
    style: DEFAULT_LOWER_THIRD_STYLE,
  },
  bibleLowerThird: {
    enabled: true,
    autoTrigger: true,
    currentRef: "John 3:16",
    currentText: "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.",
    version: "KJV",
    autoDismissSec: 15,
    isShowing: false,
    x: 50,
    y: 85,
    width: 90,
  },
  ticker: {
    enabled: false,
    text: "Welcome to our Live Worship Experience! • Offering & Tithing online at church.org/give • Join us every Sunday at 9:00 AM",
    speed: "medium",
  },
  layers: [],
};

export const normalizeBroadcastConfig = (input) => {
  if (!input || typeof input !== "object") return DEFAULT_BROADCAST_CONFIG;
  const cfg = (input.broadcastConfig && typeof input.broadcastConfig === "object") ? input.broadcastConfig : input;
  return {
    scale: typeof cfg.scale === "number" ? cfg.scale : DEFAULT_BROADCAST_CONFIG.scale,
    fitMode: cfg.fitMode || DEFAULT_BROADCAST_CONFIG.fitMode,
    logo: {
      ...DEFAULT_BROADCAST_CONFIG.logo,
      ...(cfg.logo && typeof cfg.logo === "object" ? cfg.logo : {}),
    },
    lowerThird: {
      ...DEFAULT_BROADCAST_CONFIG.lowerThird,
      ...(cfg.lowerThird && typeof cfg.lowerThird === "object" ? cfg.lowerThird : {}),
      style: {
        ...DEFAULT_LOWER_THIRD_STYLE,
        ...((cfg.lowerThird && typeof cfg.lowerThird === "object" && cfg.lowerThird.style) ? cfg.lowerThird.style : {}),
      },
    },
    bibleLowerThird: {
      ...DEFAULT_BROADCAST_CONFIG.bibleLowerThird,
      ...(cfg.bibleLowerThird && typeof cfg.bibleLowerThird === "object" ? cfg.bibleLowerThird : {}),
    },
    ticker: {
      ...DEFAULT_BROADCAST_CONFIG.ticker,
      ...(cfg.ticker && typeof cfg.ticker === "object" ? cfg.ticker : {}),
    },
    layers: Array.isArray(cfg.layers) ? cfg.layers : DEFAULT_BROADCAST_CONFIG.layers,
  };
};

export default function LiveSwitcherController() {
  // ── Switcher state ───────────────────────────────────────────────────────────
  const [cameraSlots, setCameraSlots] = useState([]); // [{ socketId, name, slotIndex, type, deviceId }]
  const [activeDisplay, setActiveDisplay] = useState("display1"); // "display1" | "display2"
  const [display1Source, setDisplay1Source] = useState("general"); // "general" | "speaker" | socketId
  const [display2Source, setDisplay2Source] = useState(null); // "general" | "speaker" | socketId | null
  const [controllerSocketId, setControllerSocketId] = useState("desktop");
  const [routeGeneral, setRouteGeneral] = useState(false);
  const [routeSpeaker, setRouteSpeaker] = useState(false);

  // ── Manual Broadcast T-Bar mix state (0: 100% Display 1, 1: 100% Display 2) ──
  const [mixProgress, setMixProgress] = useState(0);

  // ── Transition state ─────────────────────────────────────────────────────────
  const [transitionSetting, setTransitionSettingState] = useState({
    type: "fade",
    duration: 750,
    direction: "left-to-right",
  });
  const [activeTransition, setActiveTransition] = useState(null);

  // ── Mirroring & Physical Camcorder Ingestion state ──────────────────────────
  const [slotMirrorStates, setSlotMirrorStates] = useState({}); // slotIndex -> boolean
  const [localVideoDevices, setLocalVideoDevices] = useState([]); // [{ deviceId, label, type, isCamcorder }]
  const [isScanningDevices, setIsScanningDevices] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAssignSlotIndex, setSelectedAssignSlotIndex] = useState(null);
  const [activeAssignTab, setActiveAssignTab] = useState("camcorder"); // "camcorder" | "mobile"

  // ── Broadcast Studio Engine & Overlays state ─────────────────────────────────
  const [broadcastConfig, setBroadcastConfig] = useState(DEFAULT_BROADCAST_CONFIG);
  const cfg = useMemo(() => normalizeBroadcastConfig(broadcastConfig), [broadcastConfig]);
  const [isStudioModalOpen, setIsStudioModalOpen] = useState(false);
  const [studioModalTab, setStudioModalTab] = useState("layers"); // "layers" | "designer" | "media" | "scale"
  const [selectedStudioLayerId, setSelectedStudioLayerId] = useState("lowerThird");
  const [studioMediaFiles, setStudioMediaFiles] = useState([]);
  const [isLoadingStudioMedia, setIsLoadingStudioMedia] = useState(false);
  const studioCanvasRef = useRef(null);

  // Interactive dragging & resizing state (Presentation-style Canvas)
  const [isStudioDragging, setIsStudioDragging] = useState(false);
  const [studioResizeHandle, setStudioResizeHandle] = useState(null);
  const [studioDragStart, setStudioDragStart] = useState({ mouseX: 0, mouseY: 0, objX: 50, objY: 50, initialWidth: 20 });
  const [studioDraggingId, setStudioDraggingId] = useState(null);

  // ── Native RTMP / SRT Broadcast Engine (P0-01) & Recording (P0-05) ────────
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  // Multi-destination simulstreaming state (Stage 8)
  const PLATFORM_PRESETS = [
    { label: 'YouTube Live',    url: 'rtmp://a.rtmp.youtube.com/live2' },
    { label: 'Facebook Live',   url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    { label: 'Restream.io',     url: 'rtmp://live.restream.io/live' },
    { label: 'Custom',          url: '' },
  ];

  const loadDestinations = () => {
    try {
      const saved = localStorage.getItem('ocs_stream_destinations_v2');
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [
      { id: 'primary',   label: 'YouTube Live', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', enabled: true,  bitrate: 4500, showKey: false },
      { id: 'secondary', label: 'Disabled',      url: '',                                 key: '', enabled: false, bitrate: 4500, showKey: false },
    ];
  };

  const [destinations, setDestinations] = useState(loadDestinations);
  const [multiStreamStatus, setMultiStreamStatus] = useState({});
  const [isRecordingProgram, setIsRecordingProgram] = useState(false);
  const [recorderStats, setRecorderStats] = useState({ elapsedSec: 0, framesRecorded: 0 });
  const [audioDelayMs, setAudioDelayMs] = useState(0);
  const [streamBitrate, setStreamBitrate] = useState(4500);
  const [streamWidth, setStreamWidth] = useState(1280);
  const [streamHeight, setStreamHeight] = useState(720);

  // Derived: true if any destination is currently streaming
  const isAnyStreaming = Object.values(multiStreamStatus).some(s => s?.isStreaming);
  // Legacy compat alias used in some places
  const isStreaming = isAnyStreaming;

  const saveDestinations = (dests) => {
    try { localStorage.setItem('ocs_stream_destinations_v2', JSON.stringify(dests)); } catch (_) {}
  };

  const updateDestination = (id, patch) => {
    setDestinations(prev => {
      const updated = prev.map(d => d.id === id ? { ...d, ...patch } : d);
      saveDestinations(updated);
      return updated;
    });
  };

  // Poll multi-stream status and recorder status every second
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (window.electron?.Broadcast?.getMultiStatus) {
          const status = await window.electron.Broadcast.getMultiStatus();
          if (status) setMultiStreamStatus(status);
        }
        if (window.electron?.Recorder?.getStatus) {
          const r = await window.electron.Recorder.getStatus();
          if (r) {
            setIsRecordingProgram(Boolean(r.isRecording));
            setRecorderStats({ elapsedSec: r.elapsedSec || 0, framesRecorded: r.framesRecorded || 0 });
          }
        }
      } catch (_) {}
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const audioUnsubRef = useRef(null);

  // Initialize and connect Web Audio PCM tap whenever recording or broadcasting starts
  const ensureAudioStreaming = async () => {
    try {
      broadcastAudioBus.initWebAudio();
      // If microphone stream isn't connected yet, try acquiring default mic
      if (!audioUnsubRef.current) {
        try {
          if (navigator.mediaDevices?.getUserMedia) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            broadcastAudioBus.connectMediaStream(1, micStream);
          }
        } catch (_) {}

        audioUnsubRef.current = broadcastAudioBus.startPcmStream((pcmBuf) => {
          if (window.electron?.Recorder?.pushAudioChunk) {
            window.electron.Recorder.pushAudioChunk(pcmBuf);
          }
          if (window.electron?.Broadcast?.pushAudioChunk) {
            window.electron.Broadcast.pushAudioChunk(pcmBuf);
          }
        });
      }
    } catch (err) {
      console.warn("[LiveSwitcher] Failed to initialize live audio streaming:", err);
    }
  };

  const stopAudioStreamingIfIdle = () => {
    // Only stop if neither stream nor recording is active
    if (!isAnyStreaming && !isRecordingProgram && audioUnsubRef.current) {
      audioUnsubRef.current();
      audioUnsubRef.current = null;
    }
  };

  // Start simulstream — spawns one FFmpeg process per enabled destination
  const toggleSimulstream = async () => {
    if (isAnyStreaming) {
      try {
        await window.electron?.Broadcast?.stopAll();
        setMultiStreamStatus({});
        stopAudioStreamingIfIdle();
      } catch (e) {
        console.error('Failed to stop simulstream:', e);
      }
    } else {
      try {
        const enabledDests = destinations.filter(d => d.enabled && (d.url || d.key));
        if (enabledDests.length === 0) return;

        saveDestinations(destinations);

        const destConfigs = enabledDests.map(d => ({
          id: d.id,
          label: d.label,
          streamUrl: d.key
            ? (d.url.endsWith('/') ? `${d.url}${d.key}` : `${d.url}/${d.key}`)
            : d.url,
          videoBitrateKbps: d.bitrate || streamBitrate,
        }));

        const res = await window.electron?.Broadcast?.startMulti(
          destConfigs,
          { width: streamWidth, height: streamHeight, fps: 30 }
        );

        if (res && res.ok) {
          await ensureAudioStreaming();
        }
      } catch (e) {
        console.error('Failed to start simulstream:', e);
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecordingProgram) {
      try {
        await window.electron?.Recorder?.stop();
        setIsRecordingProgram(false);
        stopAudioStreamingIfIdle();
      } catch (e) {
        console.error("Failed to stop recording:", e);
      }
    } else {
      try {
        const outPath = `recordings/program_${Date.now()}.mp4`;
        const res = await window.electron?.Recorder?.start({
          outputPath: outPath,
          width: streamWidth,
          height: streamHeight,
          fps: 30,
          withAudio: true
        });
        if (res && res.ok) {
          setIsRecordingProgram(true);
          await ensureAudioStreaming();
        }
      } catch (e) {
        console.error("Failed to start recording:", e);
      }
    }
  };

  const handleAudioDelayChange = (e) => {
    const val = Number(e.target.value);
    setAudioDelayMs(val);
    try {
      broadcastAudioBus.setDelayMs(val);
      window.electron?.AudioBus?.setDelayMs(val);
    } catch (_) {}
  };

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [feedback, setFeedback] = useState(null); // { text, ok }
  const [pairedDevices, setPairedDevices] = useState([]);
  const [grantTarget, setGrantTarget] = useState("");
  const [cameraStreams, setCameraStreams] = useState(new Map()); // socketId -> MediaStream
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection

  const isDesktopController = controllerSocketId === "desktop";

  // Effective Program and Preview sources based on activeDisplay
  const effectiveProgramSourceId = activeDisplay === "display1"
    ? (display1Source || "general")
    : (display2Source || (cameraSlots[0]?.socketId || "speaker"));

  const effectivePreviewSourceId = activeDisplay === "display1"
    ? (display2Source || (cameraSlots[0]?.socketId || "speaker"))
    : (display1Source || "general");

  // Keep legacy state variables synced for consumers/tests
  const programSourceId = effectiveProgramSourceId;
  const previewSourceId = effectivePreviewSourceId;

  // ── Hydrate on mount ─────────────────────────────────────────────────────────
  const refreshLocalDevices = useCallback(async () => {
    setIsScanningDevices(true);
    try {
      const devs = await localCameraManager.enumerateVideoDevices();
      setLocalVideoDevices(devs);
    } catch (e) {
      console.error("[SwitcherController] Failed to enumerate local video devices:", e);
    } finally {
      setIsScanningDevices(false);
    }
  }, []);

  const [isScanningMobiles, setIsScanningMobiles] = useState(false);
  const fetchConnectedDevices = useCallback(async () => {
    try {
      let devs = [];
      if (window.electron?.MobileDevices?.getConnected) {
        devs = await window.electron.MobileDevices.getConnected();
      } else if (window.electron?.Network?.getPairedDevices) {
        devs = await window.electron.Network.getPairedDevices();
      } else if (window.electron?.Network?.getServerInfo) {
        const info = await window.electron.Network.getServerInfo();
        devs = info?.devices || [];
      }
      if (Array.isArray(devs)) setPairedDevices(devs);
      return devs;
    } catch (e) {
      console.error("[SwitcherController] Failed to fetch connected devices:", e);
      return [];
    }
  }, []);

  const refreshMobileDevices = useCallback(async () => {
    setIsScanningMobiles(true);
    try {
      await fetchConnectedDevices();
    } finally {
      setTimeout(() => setIsScanningMobiles(false), 400);
    }
  }, [fetchConnectedDevices]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const state = await window.electron?.Switcher?.getState?.();
        if (state) applyState(state);
      } catch (e) {
        console.error("[SwitcherController] Failed to fetch initial state:", e);
      }
      await fetchConnectedDevices();
    };
    hydrate();
    refreshLocalDevices();

    // Live state updates
    const unsubState = window.electron?.Switcher?.onStateUpdate?.((newState) => {
      if (newState) applyState(newState);
    });

    const unsubDevices1 = window.electron?.MobileDevices?.onUpdated?.((devs) => {
      if (Array.isArray(devs)) setPairedDevices(devs);
    });

    const unsubDevices2 = window.electron?.Network?.onDevicesUpdated?.((devs) => {
      if (Array.isArray(devs)) setPairedDevices(devs);
    });

    const unsubReclaim = window.electron?.Switcher?.onControllerReclaimed?.((payload) => {
      setControllerSocketId("desktop");
      showFeedback(`Switcher control reclaimed by desktop (${payload?.reason || "phone disconnected"})`, true);
    });

    // Hardware camera device change listener
    const unsubLocalDevs = localCameraManager.subscribe((devs) => {
      setLocalVideoDevices(devs);
    });

    // Camera frame mirror listener
    const unsubCamFrame = window.electron?.Switcher?.onCameraFrame?.((payload) => {
      if (payload && payload.slotIndex && payload.isMirrored !== undefined) {
        setSlotMirrorStates((prev) => {
          if (prev[payload.slotIndex] === undefined) {
            return { ...prev, [payload.slotIndex]: payload.isMirrored };
          }
          return prev;
        });
      }
    });

    // Transition start / complete / setting updates
    const unsubTransStart = window.electron?.Switcher?.onTransitionStart?.((t) => {
      setActiveTransition(t);
    });

    const unsubTransComplete = window.electron?.Switcher?.onTransitionComplete?.((payload) => {
      setActiveTransition(null);
      setMixProgress(0);
      if (payload?.programSourceId !== undefined) {
        // Source completed
      }
    });

    const unsubTransSetting = window.electron?.Switcher?.onTransitionSettingUpdate?.((setting) => {
      if (setting) setTransitionSettingState(setting);
    });

    // ── WebRTC Continuous Video Ingestion ─────────────────────────────────────
    const unsubOffer = window.electron?.Switcher?.onWebRtcOffer?.(async ({ socketId, slotIndex, offer }) => {
      try {
        const existingPc = peerConnectionsRef.current.get(socketId);
        if (existingPc) {
          existingPc.close();
          peerConnectionsRef.current.delete(socketId);
        }

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnectionsRef.current.set(socketId, pc);

        pc.ontrack = (event) => {
          if (event.streams && event.streams[0]) {
            setCameraStreams((prev) => {
              const next = new Map(prev);
              next.set(socketId, event.streams[0]);
              return next;
            });
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && window.electron?.Switcher?.sendWebRtcIce) {
            window.electron.Switcher.sendWebRtcIce({
              targetSocketId: socketId,
              candidate: event.candidate,
            });
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (window.electron?.Switcher?.sendWebRtcAnswer) {
          window.electron.Switcher.sendWebRtcAnswer({
            targetSocketId: socketId,
            answer,
          });
        }
      } catch (err) {
        console.error(`[SwitcherController] WebRTC negotiation error with ${socketId}:`, err);
      }
    });

    const unsubIce = window.electron?.Switcher?.onWebRtcIce?.(async ({ socketId, candidate }) => {
      try {
        const pc = peerConnectionsRef.current.get(socketId);
        if (pc && candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error(`[SwitcherController] WebRTC ICE addition error:`, err);
      }
    });

    const unsubBroadcast = window.electron?.Switcher?.onBroadcastConfig?.((c) => {
      if (c) setBroadcastConfig(normalizeBroadcastConfig(c));
    });

    if (window.electron?.Switcher?.getBroadcastConfig) {
      window.electron.Switcher.getBroadcastConfig().then((c) => {
        if (c) setBroadcastConfig(normalizeBroadcastConfig(c));
      });
    }

    return () => {
      if (typeof unsubState === "function") unsubState();
      if (typeof unsubDevices1 === "function") unsubDevices1();
      if (typeof unsubDevices2 === "function") unsubDevices2();
      if (typeof unsubReclaim === "function") unsubReclaim();
      if (typeof unsubLocalDevs === "function") unsubLocalDevs();
      if (typeof unsubCamFrame === "function") unsubCamFrame();
      if (typeof unsubTransStart === "function") unsubTransStart();
      if (typeof unsubTransComplete === "function") unsubTransComplete();
      if (typeof unsubTransSetting === "function") unsubTransSetting();
      if (typeof unsubOffer === "function") unsubOffer();
      if (typeof unsubIce === "function") unsubIce();
      if (typeof unsubBroadcast === "function") unsubBroadcast();
      peerConnectionsRef.current.forEach((pc) => {
        try { pc.close(); } catch (_) {}
      });
      peerConnectionsRef.current.clear();
      if (typeof localCameraManager?.cleanupAll === "function") {
        localCameraManager.cleanupAll();
      } else if (typeof localCameraManager?.destroy === "function") {
        localCameraManager.destroy();
      }
    };
  }, [refreshLocalDevices]);

  const applyState = (state) => {
    if (Array.isArray(state.cameraSlots)) {
      setCameraSlots(state.cameraSlots);
      // If Display 2 is unset and cameras are connected, default Display 2 to first camera
      setDisplay2Source((prev) => {
        if (!prev && state.cameraSlots.length > 0) return state.cameraSlots[0].socketId;
        return prev;
      });
    }
    if (state.controllerSocketId !== undefined) setControllerSocketId(state.controllerSocketId);
    if (state.activeDisplay !== undefined) setActiveDisplay(state.activeDisplay);
    if (state.display1Source !== undefined) setDisplay1Source(state.display1Source);
    if (state.display2Source !== undefined) setDisplay2Source(state.display2Source);
    if (state.routeGeneral !== undefined) setRouteGeneral(!!state.routeGeneral);
    if (state.routeSpeaker !== undefined) setRouteSpeaker(!!state.routeSpeaker);
    if (state.transitionSetting) setTransitionSettingState(state.transitionSetting);
    if (state.broadcastConfig) setBroadcastConfig(normalizeBroadcastConfig(state.broadcastConfig));
  };

  const handleUpdateBroadcastConfig = useCallback(async (patch) => {
    setBroadcastConfig((prev) => {
      const base = normalizeBroadcastConfig(prev);
      const next = { ...base, ...patch };
      if (patch.logo) next.logo = { ...base.logo, ...patch.logo };
      if (patch.lowerThird) next.lowerThird = { ...base.lowerThird, ...patch.lowerThird };
      if (patch.bibleLowerThird) next.bibleLowerThird = { ...base.bibleLowerThird, ...patch.bibleLowerThird };
      if (patch.ticker) next.ticker = { ...base.ticker, ...patch.ticker };
      if (patch.layers) next.layers = patch.layers;
      return next;
    });
    if (window.electron?.Switcher?.updateBroadcastConfig) {
      await window.electron.Switcher.updateBroadcastConfig(patch);
    }
  }, []);

  // ── Presentation-Style Media & Layer Handlers ────────────────────────────────
  const refreshStudioMedia = useCallback(async () => {
    if (window.electron?.Media?.list) {
      try {
        setIsLoadingStudioMedia(true);
        const files = await window.electron.Media.list();
        if (Array.isArray(files)) {
          setStudioMediaFiles(files.filter((f) => {
            const clean = String(f).toLowerCase().split("?")[0].split("#")[0];
            return clean.endsWith(".png") || clean.endsWith(".jpg") || clean.endsWith(".jpeg") || clean.endsWith(".webp") || clean.endsWith(".gif") || clean.endsWith(".svg");
          }));
        }
      } catch (err) {
        console.warn("Failed to list studio media:", err);
      } finally {
        setIsLoadingStudioMedia(false);
      }
    }
  }, []);

  const handleImportMediaForStudio = useCallback(async () => {
    if (window.electron?.Media?.import) {
      try {
        const result = await window.electron.Media.import();
        if (result?.files && result.files.length > 0) {
          const first = result.files[0];
          handleAddImageLayer(first.url || first.path, first.name || "Imported Image");
          await refreshStudioMedia();
        }
      } catch (err) {
        console.warn("Import media error:", err);
      }
    }
  }, [refreshStudioMedia]);

  const handleAddImageLayer = useCallback((url, name) => {
    const id = `img-${Date.now()}`;
    const newLayer = {
      id,
      type: "image",
      name: name || "Image Layer",
      content: url,
      x: 82,
      y: 18,
      style: {
        width: 18,
        opacity: 1,
        borderRadius: 12,
      },
    };
    const nextLayers = [newLayer, ...(cfg.layers || [])];
    handleUpdateBroadcastConfig({ layers: nextLayers });
    setSelectedStudioLayerId(id);
    showFeedback(`Added "${newLayer.name}" to live screen`, true);
  }, [cfg.layers, handleUpdateBroadcastConfig]);

  const handleRemoveStudioLayer = useCallback((id) => {
    const nextLayers = (cfg.layers || []).filter((l) => l.id !== id);
    handleUpdateBroadcastConfig({ layers: nextLayers });
    if (selectedStudioLayerId === id) {
      setSelectedStudioLayerId(nextLayers[0]?.id || "lowerThird");
    }
    showFeedback("Layer removed", true);
  }, [cfg.layers, selectedStudioLayerId, handleUpdateBroadcastConfig]);

  const handleMoveStudioLayer = useCallback((index, direction) => {
    const arr = [...(cfg.layers || [])];
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= arr.length) return;
    const [moved] = arr.splice(index, 1);
    arr.splice(targetIdx, 0, moved);
    handleUpdateBroadcastConfig({ layers: arr });
  }, [cfg.layers, handleUpdateBroadcastConfig]);

  const handleStudioMouseDown = useCallback((e, id, handle = null) => {
    e.stopPropagation();
    setSelectedStudioLayerId(id);
    setStudioDraggingId(id);

    let targetObj = null;
    let w = 20;
    if (id.startsWith("img-")) {
      targetObj = (cfg.layers || []).find((l) => l.id === id);
      w = typeof targetObj?.style?.width === "number" ? targetObj.style.width : 18;
    } else if (id === "lowerThird") {
      targetObj = cfg.lowerThird;
      w = typeof targetObj?.width === "number" ? targetObj.width : 55;
    } else if (id === "bible") {
      targetObj = cfg.bibleLowerThird;
      w = typeof targetObj?.width === "number" ? targetObj.width : 90;
    }

    const curX = targetObj?.x ?? 50;
    const curY = targetObj?.y ?? 50;

    if (handle) {
      setStudioResizeHandle(handle);
      setIsStudioDragging(false);
      setStudioDragStart({
        mouseX: e.clientX,
        mouseY: e.clientY,
        initialWidth: w,
        objX: curX,
        objY: curY,
      });
    } else {
      setStudioResizeHandle(null);
      setIsStudioDragging(true);
      setStudioDragStart({
        mouseX: e.clientX,
        mouseY: e.clientY,
        objX: curX,
        objY: curY,
      });
    }
  }, [cfg.layers, cfg.lowerThird, cfg.bibleLowerThird]);

  const handleStudioMouseMove = useCallback((e) => {
    if (!studioDraggingId || !studioCanvasRef.current) return;
    const rect = studioCanvasRef.current.getBoundingClientRect();
    const deltaX = e.clientX - studioDragStart.mouseX;
    const deltaXPct = (deltaX / rect.width) * 100;
    const deltaYPct = ((e.clientY - studioDragStart.mouseY) / rect.height) * 100;

    if (studioResizeHandle) {
      const isLeft = studioResizeHandle.includes("w") || studioResizeHandle === "ml";
      const mult = isLeft ? -1 : 1;
      const baseW = studioDragStart.initialWidth || 20;
      const newWidth = Math.max(5, Math.min(100, Math.round(baseW + deltaXPct * mult)));

      if (studioDraggingId.startsWith("img-")) {
        const nextLayers = (cfg.layers || []).map((l) =>
          l.id === studioDraggingId ? { ...l, style: { ...l.style, width: newWidth } } : l
        );
        handleUpdateBroadcastConfig({ layers: nextLayers });
      } else if (studioDraggingId === "lowerThird") {
        handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, width: newWidth } });
      } else if (studioDraggingId === "bible") {
        handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, width: newWidth } });
      }
    } else if (isStudioDragging) {
      const newX = Math.max(5, Math.min(95, Math.round(studioDragStart.objX + deltaXPct)));
      const newY = Math.max(5, Math.min(95, Math.round(studioDragStart.objY + deltaYPct)));

      if (studioDraggingId.startsWith("img-")) {
        const nextLayers = (cfg.layers || []).map((l) =>
          l.id === studioDraggingId ? { ...l, x: newX, y: newY } : l
        );
        handleUpdateBroadcastConfig({ layers: nextLayers });
      } else if (studioDraggingId === "lowerThird") {
        handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, x: newX, y: newY } });
      } else if (studioDraggingId === "bible") {
        handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, x: newX, y: newY } });
      }
    }
  }, [studioDraggingId, studioResizeHandle, isStudioDragging, studioDragStart, cfg.layers, cfg.lowerThird, cfg.bibleLowerThird, handleUpdateBroadcastConfig]);

  const handleStudioMouseUp = useCallback(() => {
    setIsStudioDragging(false);
    setStudioResizeHandle(null);
    setStudioDraggingId(null);
  }, []);

  useEffect(() => {
    if (isStudioModalOpen) {
      refreshStudioMedia();
    }
  }, [isStudioModalOpen, refreshStudioMedia]);

  const showFeedback = (text, ok) => {
    setFeedback({ text, ok });
    setTimeout(() => setFeedback(null), 3000);
  };

  const getSourceName = useCallback((srcId) => {
    if (!srcId) return "None (Standby)";
    if (srcId === "general") return "General Screen (Presentation)";
    if (srcId === "speaker") return "Speaker Screen (Confidence)";
    const cam = cameraSlots.find((s) => s.socketId === srcId);
    if (cam) return `${cam.name || "Camera"} (Slot ${cam.slotIndex})`;
    return srcId;
  }, [cameraSlots]);

  // ── Transition Setting Update ────────────────────────────────────────────────
  const updateTransitionSetting = async (patch) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const nextSetting = { ...transitionSetting, ...patch };
    setTransitionSettingState(nextSetting);
    try {
      const res = await window.electron?.Switcher?.setTransitionSetting?.(nextSetting);
      if (res?.ok && res.transitionSetting) {
        setTransitionSettingState(res.transitionSetting);
      } else if (res?.error) {
        showFeedback(res.error, false);
      }
    } catch (e) {
      showFeedback("Failed to update transition: " + e.message, false);
    }
  };

  // ── Switch Active Display Channel ('display1' vs 'display2') ──────────────────
  const handleSetActiveDisplay = useCallback(async (targetDisplay, customTrans = null) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const targetSource = targetDisplay === "display1"
      ? (display1Source || "general")
      : (display2Source || (cameraSlots[0]?.socketId || "speaker"));

    setActiveDisplay(targetDisplay);
    setMixProgress(0);

    try {
      const activeTrans = customTrans || transitionSetting;
      const res = await window.electron?.Switcher?.setActiveDisplay?.({
        displayId: targetDisplay,
        transition: activeTrans,
      });
      if (res?.ok) {
        showFeedback(
          `Showing ${targetDisplay === "display1" ? "Display 1" : "Display 2"}: ${getSourceName(targetSource)}`,
          true
        );

        // Journal live switcher cut for crash recovery
        try {
          if (window.electron?.Recovery?.recordEvent) {
            window.electron.Recovery.recordEvent("CAMERA_CUT", {
              activeSlot: targetDisplay === "display1" ? 1 : 2,
              targetDisplay,
              sourceId: targetSource,
              transition: activeTrans?.type || "cut"
            });
          }
        } catch (_) {}
      } else {
        showFeedback(res?.error || "Display switch failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  }, [isDesktopController, display1Source, display2Source, cameraSlots, transitionSetting, getSourceName]);

  // ── Set Source Assignment for Display 1 or Display 2 ─────────────────────────
  const handleSetDisplaySource = useCallback(async (displayId, sourceId) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    if (displayId === "display1") {
      setDisplay1Source(sourceId);
    } else {
      setDisplay2Source(sourceId);
    }

    try {
      const res = await window.electron?.Switcher?.setDisplaySource?.(displayId, sourceId);
      if (res?.ok) {
        showFeedback(
          `Assigned ${displayId === "display1" ? "Display 1" : "Display 2"} ➔ ${getSourceName(sourceId)}`,
          true
        );
      } else {
        showFeedback(res?.error || "Failed to set display source", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  }, [isDesktopController, getSourceName]);

  // ── CUT: Instant Hard Cut Between Display 1 and Display 2 ─────────────────────
  const handleCut = useCallback(async () => {
    const targetDisplay = activeDisplay === "display1" ? "display2" : "display1";
    await handleSetActiveDisplay(targetDisplay, { type: "cut", duration: 100 });
  }, [activeDisplay, handleSetActiveDisplay]);

  // ── AUTO: Take Animated Transition Between Display 1 and Display 2 ────────────
  const handleAuto = useCallback(async () => {
    const targetDisplay = activeDisplay === "display1" ? "display2" : "display1";
    await handleSetActiveDisplay(targetDisplay, transitionSetting);
  }, [activeDisplay, transitionSetting, handleSetActiveDisplay]);

  // ── T-BAR Manual Mix Fader Dragging ──────────────────────────────────────────
  const handleTBarChange = (val) => {
    const num = Math.min(1, Math.max(0, Number(val)));
    setMixProgress(num);

    // When dragged fully to 100%, commit take to Display 2; at 0%, commit to Display 1
    if (num >= 0.99 && activeDisplay === "display1") {
      handleSetActiveDisplay("display2");
    } else if (num <= 0.01 && activeDisplay === "display2") {
      handleSetActiveDisplay("display1");
    }
  };

  // ── Multiview Tile Selection (Queue into Standby or Cut if already Standby) ───
  const handleTileSelect = useCallback((srcId) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    if (srcId === effectiveProgramSourceId) {
      showFeedback(`${getSourceName(srcId)} is already showing on Live Output`, true);
      return;
    }
    if (srcId === effectivePreviewSourceId) {
      // Already queued in standby channel: switch to it!
      handleAuto();
      return;
    }
    // Assign to standby channel
    const standbyDisplay = activeDisplay === "display1" ? "display2" : "display1";
    handleSetDisplaySource(standbyDisplay, srcId);
    showFeedback(`Queued for ${standbyDisplay === "display1" ? "Display 1" : "Display 2"}: ${getSourceName(srcId)}`, true);
  }, [isDesktopController, effectiveProgramSourceId, effectivePreviewSourceId, activeDisplay, handleSetDisplaySource, handleAuto, getSourceName]);

  const handleCameraSelect = (socketId) => handleTileSelect(socketId);
  const handleDisplaySelect = (type) => handleTileSelect(type);

  // ── Hardware Camcorder & Mobile Assignment Modal Handlers ──────────────────
  const handleOpenAssignModal = useCallback((slotIndex) => {
    setSelectedAssignSlotIndex(slotIndex);
    setIsAssignModalOpen(true);
    refreshLocalDevices();
    fetchConnectedDevices();
  }, [refreshLocalDevices, fetchConnectedDevices]);

  const handleCloseAssignModal = useCallback(() => {
    setIsAssignModalOpen(false);
    setSelectedAssignSlotIndex(null);
  }, []);

  const handleToggleMirror = useCallback((slotIndex) => {
    setSlotMirrorStates((prev) => ({
      ...prev,
      [slotIndex]: !prev[slotIndex],
    }));
    showFeedback(`Slot ${slotIndex} mirror toggled`, true);
  }, []);

  const handleAssignCamcorder = useCallback(async (slotIndex, deviceId, deviceLabel) => {
    try {
      showFeedback(`Connecting to ${deviceLabel || "Camcorder"}...`, true);
      const stream = await localCameraManager.startStream(deviceId, { width: 1920, height: 1080, frameRate: 60 });
      const localSockId = `local:${deviceId}`;

      setCameraStreams((prev) => {
        const next = new Map(prev);
        next.set(localSockId, stream);
        return next;
      });

      const res = await window.electron?.Switcher?.assignCameraSlot?.({
        socketId: localSockId,
        name: deviceLabel || `Camcorder ${slotIndex}`,
        slotIndex: slotIndex,
        type: "camcorder",
        deviceId: deviceId,
        isLocal: true,
      });

      if (!res || !res.ok) {
        setCameraSlots((prev) => {
          const next = prev.filter((s) => s.slotIndex !== slotIndex && s.socketId !== localSockId);
          next.push({
            socketId: localSockId,
            name: deviceLabel || `Camcorder ${slotIndex}`,
            slotIndex: slotIndex,
            type: "camcorder",
            deviceId: deviceId,
            isLocal: true,
          });
          return next;
        });
      }

      showFeedback(`Assigned ${deviceLabel || "Camcorder"} to Slot ${slotIndex}`, true);
      setIsAssignModalOpen(false);
    } catch (err) {
      showFeedback(`Failed to connect camcorder: ${err.message}`, false);
    }
  }, []);

  const handleAssignMobile = useCallback(async (slotIndex, mobileDev) => {
    try {
      const res = await window.electron?.Switcher?.assignCameraSlot?.({
        socketId: mobileDev.id,
        name: mobileDev.name || `Mobile Cam ${slotIndex}`,
        slotIndex: slotIndex,
        type: "mobile",
        isLocal: false,
      });

      if (!res || !res.ok) {
        setCameraSlots((prev) => {
          const next = prev.filter((s) => s.slotIndex !== slotIndex && s.socketId !== mobileDev.id);
          next.push({
            socketId: mobileDev.id,
            name: mobileDev.name || `Mobile Cam ${slotIndex}`,
            slotIndex: slotIndex,
            type: "mobile",
            isLocal: false,
          });
          return next;
        });
      }

      showFeedback(`Assigned ${mobileDev.name || "Mobile"} to Slot ${slotIndex}`, true);
      setIsAssignModalOpen(false);
    } catch (err) {
      showFeedback(`Failed to assign mobile: ${err.message}`, false);
    }
  }, []);

  const handleRemoveSlot = useCallback(async (slotIndex, socketId) => {
    try {
      if (socketId && socketId.startsWith("local:")) {
        const deviceId = socketId.replace("local:", "");
        localCameraManager.stopStream(deviceId);
        setCameraStreams((prev) => {
          const next = new Map(prev);
          next.delete(socketId);
          return next;
        });
      }

      await window.electron?.Switcher?.removeCameraSlot?.({ slotIndex, socketId });
      setCameraSlots((prev) => prev.filter((s) => s.slotIndex !== slotIndex));
      setSlotMirrorStates((prev) => {
        const next = { ...prev };
        delete next[slotIndex];
        return next;
      });

      showFeedback(`Released Slot ${slotIndex}`, true);
    } catch (err) {
      showFeedback(`Failed to remove slot: ${err.message}`, false);
    }
  }, []);

  // ── Non-destructive Live Output Destination Sharing ──────────────────────────
  const handleRouteToggle = async (destination) => {
    if (!isDesktopController) {
      showFeedback("Desktop does not hold controller permission", false);
      return;
    }
    const currentActive = destination === "general" ? routeGeneral : routeSpeaker;
    const nextActive = !currentActive;

    if (destination === "general") setRouteGeneral(nextActive);
    if (destination === "speaker") setRouteSpeaker(nextActive);

    try {
      const res = await window.electron?.Switcher?.routeDestination?.(destination, nextActive);
      if (res?.ok) {
        showFeedback(
          `${destination === "general" ? "General Screen" : "Speaker Screen"} Live Output: ${
            nextActive ? "LIVE ON AIR" : "OFF (Presentation Restored)"
          }`,
          true
        );
      } else {
        showFeedback(res?.error || "Routing failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Keyboard Hotkeys: [1], [2], [Space], [C], [G], [S] ────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target?.tagName)) return;
      if (e.key === "1") {
        e.preventDefault();
        handleSetActiveDisplay("display1");
      } else if (e.key === "2") {
        e.preventDefault();
        handleSetActiveDisplay("display2");
      } else if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        handleAuto();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleCut();
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        handleRouteToggle("general");
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleRouteToggle("speaker");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSetActiveDisplay, handleAuto, handleCut, handleRouteToggle]);

  // ── Switcher Controller Grant & Reclaim ───────────────────────────────────────
  const handleGrantControl = async () => {
    if (!grantTarget) return;
    try {
      const res = await window.electron?.Switcher?.grantControl?.(grantTarget);
      if (res?.ok) {
        setControllerSocketId(grantTarget);
        const dev = pairedDevices.find((d) => d.id === grantTarget);
        showFeedback(`Control granted to: ${dev?.name || grantTarget}`, true);
        setGrantTarget("");
      } else {
        showFeedback(res?.error || "Grant failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  const handleReclaimControl = async () => {
    try {
      const res = await window.electron?.Switcher?.reclaimControl?.();
      if (res?.ok) {
        setControllerSocketId("desktop");
        showFeedback("Switcher control reclaimed by desktop", true);
      } else {
        showFeedback(res?.error || "Reclaim failed", false);
      }
    } catch (e) {
      showFeedback("IPC error: " + e.message, false);
    }
  };

  // ── Derived Properties ───────────────────────────────────────────────────────
  const controllerName =
    controllerSocketId === "desktop"
      ? "Desktop"
      : pairedDevices.find((d) => d.id === controllerSocketId)?.name ||
        cameraSlots.find((s) => s.socketId === controllerSocketId)?.name ||
        controllerSocketId;

  const isSharingActive = routeGeneral || routeSpeaker;
  const currentProgramSlot = cameraSlots.find((s) => s.socketId === effectiveProgramSourceId);
  const isProgramMirrored = currentProgramSlot ? !!slotMirrorStates[currentProgramSlot.slotIndex] : false;

  // Helper for camera slot assigned display numbers
  const getCameraAssignedDisplay = (socketId) => {
    const isDisp1 = display1Source === socketId;
    const isDisp2 = display2Source === socketId;
    if (isDisp1 && isDisp2) return "both";
    if (isDisp1) return 1;
    if (isDisp2) return 2;
    return null;
  };

  const getMonitorAssignedDisplay = (type) => {
    const isDisp1 = display1Source === type;
    const isDisp2 = display2Source === type;
    if (isDisp1 && isDisp2) return "both";
    if (isDisp1) return 1;
    if (isDisp2) return 2;
    return null;
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden gap-0 bg-[#0c0d14] font-outfit text-white select-none">
      {/* ── Top Bar Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-white/[0.02] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[12px] bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
            <PiVideoCamera size={18} />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
              Live
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-sky-500/20 text-sky-300 border border-sky-500/30">
                A/B DUAL CHANNEL
              </span>
            </h1>
            <p className="text-[11px] text-white/40 font-medium">
              Select any display as 1 or 2, switch live output, and share to screens non-destructively.
            </p>
          </div>
        </div>

        {/* Hotkeys HUD & Controls */}
        <div className="flex items-center gap-2">

          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[12px] bg-white/[0.04] border border-white/10 text-[10px] font-mono text-white/50">
            <span>[1]: DISP 1</span>
            <span className="text-white/20">|</span>
            <span>[2]: DISP 2</span>
            <span className="text-white/20">|</span>
            <span>[Space]: AUTO</span>
            <span className="text-white/20">|</span>
            <span>[C]: CUT</span>
            <span className="text-white/20">|</span>
            <span>[G]: GENERAL</span>
          </div>

          {/* Controller status indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-[12px] border text-xs font-semibold ${
            isDesktopController
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-amber-500/10 border-amber-500/30 text-amber-300"
          }`}>
            <span className={`w-2 h-2 rounded-full ${isDesktopController ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
            <span>Controller: {isDesktopController ? "Desktop (Local)" : controllerName}</span>
          </div>
        </div>
      </div>


      {/* ── Main Work Area ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex gap-5 p-5 min-h-0 overflow-hidden">
        {/* ── Left Column: Multiview 8-Tile Grid ──────────────────────────────── */}
        <div className="flex flex-col gap-3 w-7/12 shrink-0 min-h-0 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
              Multiview Grid · Cameras & Output Monitors
            </p>
            <span className="text-[10px] text-white/40 font-mono">
              Click [1] or [2] to assign · Click tile to queue
            </span>
          </div>

          {/* 6 Camera Slots */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: TOTAL_SLOTS }, (_, idx) => {
              const slotIndex = idx + 1;
              const slotInfo = cameraSlots.find((s) => s.slotIndex === slotIndex) || null;
              const stream = slotInfo ? cameraStreams.get(slotInfo.socketId) : null;
              const isProgram = !!(slotInfo && slotInfo.socketId === effectiveProgramSourceId);
              const isPreview = !!(slotInfo && slotInfo.socketId === effectivePreviewSourceId);
              const assignedDisp = slotInfo ? getCameraAssignedDisplay(slotInfo.socketId) : null;

              return (
                <SwitcherCameraTile
                  key={slotIndex}
                  slotIndex={slotIndex}
                  slotInfo={slotInfo}
                  stream={cameraStreams.get(slotInfo?.socketId)}
                  isProgram={isProgram}
                  isPreview={isPreview}
                  assignedDisplayNumber={assignedDisp}
                  canSwitch={isDesktopController}
                  isMirrored={!!slotMirrorStates[slotIndex]}
                  onSelect={handleCameraSelect}
                  onSetDisplay={(sockId, num) => handleSetDisplaySource(num === 1 ? "display1" : "display2", sockId)}
                  onToggleMirror={handleToggleMirror}
                  onAssignSlot={handleOpenAssignModal}
                  onRemoveSlot={handleRemoveSlot}
                />
              );
            })}
          </div>

          {/* Physical Screen Output & Broadcast Studio Controls */}
          <div className="pt-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
              Physical Screen Output & Broadcast Studio
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* General View */}
              <SwitcherMonitorTile
                type="general"
                label="GENERAL SCREEN"
                displayNumber={1}
                assignedDisplayNumber={getMonitorAssignedDisplay("general")}
                isRouted={routeGeneral}
                isShowing={effectiveProgramSourceId === "general"}
                isSelected={effectivePreviewSourceId === "general"}
                programSourceId={effectiveProgramSourceId}
                programSourceName={getSourceName(effectiveProgramSourceId)}
                canSelect={isDesktopController}
                onSelect={handleDisplaySelect}
                onSetDisplay={(type, num) => handleSetDisplaySource(num === 1 ? "display1" : "display2", "general")}
                assignedSourceLabel={routeGeneral ? "Live Output (Sharing ON)" : "Church Presentation (Slides)"}
              />

              {/* Studio Overlays & Scaling Button Card (Replacing Stage Screen) */}
              <button
                type="button"
                onClick={() => setIsStudioModalOpen(true)}
                className="relative w-full aspect-video rounded-[12px] bg-gradient-to-br from-[#161226] via-[#100d1d] to-[#0c0a17] border border-purple-500/40 hover:border-purple-400/80 p-3 flex flex-col justify-between text-left transition-all group shadow-lg hover:shadow-purple-950/40 cursor-pointer overflow-hidden active:scale-[0.99]"
              >
                {/* Background decorative glow */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-600/10 rounded-full blur-2xl pointer-events-none group-hover:bg-purple-600/20 transition-all" />

                {/* Top bar header */}
                <div className="flex items-center justify-between z-10 w-full">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-[12px] bg-purple-500/25 border border-purple-400/40 flex items-center justify-center text-purple-300">
                      <PiTelevision size={14} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-300">
                      STUDIO OVERLAYS
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {(cfg.logo.enabled || cfg.lowerThird.enabled || cfg.bibleLowerThird.isShowing || cfg.ticker.enabled || cfg.scale < 1.0) ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-[12px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[8px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-[12px] bg-white/5 border border-white/10 text-white/40 text-[8px] font-bold">
                        STANDBY
                      </span>
                    )}
                  </div>
                </div>

                {/* Center visual: Click action & description */}
                <div className="my-auto z-10 flex flex-col items-center justify-center text-center px-2 py-1">
                  <span className="text-white font-black text-sm tracking-wide group-hover:text-purple-200 transition-colors">
                    Broadcast Studio Engine
                  </span>
                  <span className="text-white/50 text-[10px] mt-0.5">
                    Screen Scaling · Logos · Scripture Auto-Trigger · Ticker
                  </span>
                </div>

                {/* Bottom button strip */}
                <div className="z-10 w-full pt-1.5 border-t border-white/10 flex items-center justify-between text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-[12px] bg-purple-500/20 text-purple-200 font-bold border border-purple-500/30">
                      Scale: {Math.round(cfg.scale * 100)}%
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-[12px] font-bold border ${cfg.bibleLowerThird.autoTrigger ? "bg-amber-500/20 border-amber-500/30 text-amber-300" : "bg-white/5 border-white/10 text-white/40"}`}>
                      ⚡ Bible: {cfg.bibleLowerThird.autoTrigger ? "Auto ON" : "Off"}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-[12px] bg-purple-600 text-white font-bold group-hover:bg-purple-500 transition-colors">
                    Open Studio Modal ↗
                  </span>
                </div>
              </button>
            </div>
          </div>

          {/* ── Broadcast Mixing & T-Bar Fader Deck (Below Screens) ──────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-3.5 flex flex-col gap-2.5 shrink-0 mt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiSlidersHorizontal size={14} className="text-amber-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Broadcast Mixing & Transition Control
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold text-white/40">
                {mixProgress > 0 ? `Mixing: ${Math.round(mixProgress * 100)}%` : "Ready"}
              </span>
            </div>

            {/* Split layout: T-Bar on the Left, Take & Transition Controls on the Right */}
            <div className="grid grid-cols-2 gap-3 items-center">
              {/* LEFT: T-Bar Manual Mix Fader */}
              <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-black/40 border border-white/5 h-full justify-between">
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className="text-sky-400 flex items-center gap-1 truncate max-w-[48%]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeDisplay === "display1" ? "bg-red-500 animate-pulse" : "bg-sky-500"}`} />
                    <span className="truncate">1: {getSourceName(display1Source)}</span>
                  </span>
                  <span className="text-violet-400 flex items-center gap-1 truncate max-w-[48%] justify-end">
                    <span className="truncate">2: {getSourceName(display2Source)}</span>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${activeDisplay === "display2" ? "bg-red-500 animate-pulse" : "bg-violet-500"}`} />
                  </span>
                </div>

                {/* T-Bar Slider Control */}
                <div className="relative flex items-center py-1">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={activeDisplay === "display1" ? mixProgress : 1 - mixProgress}
                    onChange={(e) => handleTBarChange(activeDisplay === "display1" ? e.target.value : 1 - e.target.value)}
                    disabled={!isDesktopController}
                    className="w-full h-3 bg-white/10 rounded-[12px] appearance-none cursor-pointer accent-amber-500 disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center justify-between text-[9px] font-mono text-white/30">
                  <span>0% (Disp 1)</span>
                  <span>50% (Cross)</span>
                  <span>100% (Disp 2)</span>
                </div>
              </div>

              {/* RIGHT: CUT / AUTO Action Buttons & Transition Effect / Duration */}
              <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-black/40 border border-white/5 h-full justify-between">
                {/* CUT and AUTO Take Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleCut}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-red-500/50 bg-red-600/30 hover:bg-red-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiLightning size={14} className="text-red-400" />
                    CUT [C]
                  </button>

                  <button
                    onClick={handleAuto}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-emerald-500/50 bg-emerald-600/30 hover:bg-emerald-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiPlay size={14} className="text-emerald-400" />
                    AUTO [Space]
                  </button>
                </div>

                {/* Effect and Duration Settings */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                  {/* Effects */}
                  <div className="flex items-center gap-1">
                    {["fade", "wipe", "cut"].map((type) => (
                      <button
                        key={type}
                        onClick={() => updateTransitionSetting({ type })}
                        className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold uppercase transition-all border ${
                          transitionSetting.type === type
                            ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                            : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  {/* Durations */}
                  {transitionSetting.type !== "cut" && (
                    <div className="flex items-center gap-1">
                      {[250, 500, 750, 1000].map((ms) => (
                        <button
                          key={ms}
                          onClick={() => updateTransitionSetting({ duration: ms })}
                          className={`px-1.5 py-0.5 rounded-[12px] text-[9px] font-mono font-bold transition-all border ${
                            transitionSetting.duration === ms
                              ? "bg-white/20 text-white border-white/40"
                              : "bg-white/5 text-white/30 border-white/10 hover:text-white"
                          }`}
                        >
                          {ms}ms
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Program Output, Channels, T-Bar & Sharing Deck ──── */}
        <div className="flex flex-col gap-4 flex-1 min-w-0 overflow-y-auto pl-1">
          {/* Program Output Canvas */}
          <div className="shrink-0">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                Live Output (Program Mix)
              </p>
            </div>

            <SwitcherProgramCanvas
              programSourceId={effectiveProgramSourceId}
              programSourceName={getSourceName(effectiveProgramSourceId)}
              previewSourceId={effectivePreviewSourceId}
              previewSourceName={getSourceName(effectivePreviewSourceId)}
              stream={cameraStreams.get(programSourceId)}
              cameraStreams={cameraStreams}
              activeTransition={activeTransition}
              mixProgress={mixProgress}
              transitionSetting={transitionSetting}
              isSharingActive={isSharingActive}
              isMirrored={isProgramMirrored}
              broadcastConfig={cfg}
              isBroadcastActive={isAnyStreaming || isRecordingProgram}
            />
          </div>

          {/* ── Live Display Channels & Take Deck (A/B Deck) ────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiTelevision size={14} className="text-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Live Display Channels · Select What To Show
                </p>
              </div>
              <span className="text-[9px] font-mono font-bold text-white/40">
                Hotkeys: [1], [2], [Space]
              </span>
            </div>

            {/* A/B Channels Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* DISPLAY 1 CHANNEL */}
              <div className={`flex flex-col gap-2 p-3 rounded-[12px] border transition-all ${
                activeDisplay === "display1"
                  ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.15)]"
                  : "bg-black/30 border-white/5"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-[12px] bg-sky-500/20 text-sky-400 text-[10px] font-black flex items-center justify-center border border-sky-500/30">
                      1
                    </span>
                    <span className="text-xs font-black text-white tracking-tight">DISPLAY 1</span>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-[12px] uppercase ${
                    activeDisplay === "display1"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white/5 text-white/40"
                  }`}>
                    {activeDisplay === "display1" ? "● ON AIR" : "STANDBY"}
                  </span>
                </div>

                {/* Source selector for Display 1 */}
                <select
                  value={display1Source || "general"}
                  onChange={(e) => handleSetDisplaySource("display1", e.target.value)}
                  disabled={!isDesktopController}
                  className="w-full bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-[11px] font-semibold text-white/80 focus:outline-none focus:border-white/30"
                >
                  <option value="general">General Screen (Presentation / Slides)</option>
                  <option value="speaker">Speaker Screen (Stage / Confidence)</option>
                  {cameraSlots.map((cam) => (
                    <option key={cam.socketId} value={cam.socketId}>
                      {cam.name || `Camera ${cam.slotIndex}`} (Slot {cam.slotIndex})
                    </option>
                  ))}
                </select>

                {/* Take Display 1 Button */}
                <button
                  onClick={() => handleSetActiveDisplay("display1")}
                  disabled={!isDesktopController}
                  className={`w-full py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeDisplay === "display1"
                      ? "bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <PiMonitor size={14} />
                  {activeDisplay === "display1" ? "SHOWING DISPLAY 1" : "SHOW DISPLAY 1 [1]"}
                </button>
              </div>

              {/* DISPLAY 2 CHANNEL */}
              <div className={`flex flex-col gap-2 p-3 rounded-[12px] border transition-all ${
                activeDisplay === "display2"
                  ? "bg-red-500/10 border-red-500/40 ring-1 ring-red-500/50 shadow-[0_0_16px_rgba(239,68,68,0.15)]"
                  : "bg-black/30 border-white/5"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-[12px] bg-violet-500/20 text-violet-400 text-[10px] font-black flex items-center justify-center border border-violet-500/30">
                      2
                    </span>
                    <span className="text-xs font-black text-white tracking-tight">DISPLAY 2</span>
                  </div>
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded-[12px] uppercase ${
                    activeDisplay === "display2"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white/5 text-white/40"
                  }`}>
                    {activeDisplay === "display2" ? "● ON AIR" : "STANDBY"}
                  </span>
                </div>

                {/* Source selector for Display 2 */}
                <select
                  value={display2Source || (cameraSlots[0]?.socketId || "speaker")}
                  onChange={(e) => handleSetDisplaySource("display2", e.target.value)}
                  disabled={!isDesktopController}
                  className="w-full bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-[11px] font-semibold text-white/80 focus:outline-none focus:border-white/30"
                >
                  {cameraSlots.map((cam) => (
                    <option key={cam.socketId} value={cam.socketId}>
                      {cam.name || `Camera ${cam.slotIndex}`} (Slot {cam.slotIndex})
                    </option>
                  ))}
                  <option value="speaker">Speaker Screen (Stage / Confidence)</option>
                  <option value="general">General Screen (Presentation / Slides)</option>
                </select>

                {/* Take Display 2 Button */}
                <button
                  onClick={() => handleSetActiveDisplay("display2")}
                  disabled={!isDesktopController}
                  className={`w-full py-2 px-3 rounded-[12px] border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    activeDisplay === "display2"
                      ? "bg-red-500 text-white border-red-400 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                      : "bg-white/[0.05] border-white/10 text-white/70 hover:bg-white/[0.1] hover:text-white"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  <PiVideoCamera size={14} />
                  {activeDisplay === "display2" ? "SHOWING DISPLAY 2" : "SHOW DISPLAY 2 [2]"}
                </button>
              </div>
            </div>

            {/* Quick Swap Displays Button */}
            <button
              onClick={() => handleSetActiveDisplay(activeDisplay === "display1" ? "display2" : "display1")}
              disabled={!isDesktopController}
              className="w-full py-2 px-3 rounded-[12px] bg-gradient-to-r from-sky-500/20 via-white/10 to-violet-500/20 hover:from-sky-500/30 hover:to-violet-500/30 border border-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PiArrowsLeftRight size={14} className="text-amber-400" />
              <span>
                Swap Displays: Switch to {activeDisplay === "display1" ? "Display 2" : "Display 1"} ({transitionSetting.type.toUpperCase()})
              </span>
              <span className="text-[10px] font-mono text-white/50 bg-black/40 px-1.5 py-0.5 rounded-[12px] border border-white/10">
                Space
              </span>
            </button>
          </div>


          {/* ── Live Output Destination Sharing Deck ─────────────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <PiBroadcast size={14} className="text-sky-400" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                  Share Live Output
                </p>
              </div>
              <span className="text-[9px] text-white/40 font-mono">
                Non-destructive · Presentation preserved
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {/* Share to General Screen Toggle */}
              <button
                onClick={() => handleRouteToggle("general")}
                disabled={!isDesktopController}
                className={`flex items-center justify-between p-3 rounded-[12px] border transition-all text-left ${
                  routeGeneral
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-200 shadow-[0_0_16px_rgba(14,165,233,0.2)]"
                    : "bg-black/30 border-white/10 text-white/70 hover:bg-white/[0.04]"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center border ${
                    routeGeneral
                      ? "bg-sky-500/20 border-sky-400/40 text-sky-300"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiMonitor size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Share to General Screen [G]</span>
                    <span className="text-[10px] text-white/40 block">
                      {routeGeneral ? "Live Output showing on sanctuary display" : "Currently showing church presentation"}
                    </span>
                  </div>
                </div>
                <span className={`text-[9px] font-black px-2.5 py-1 rounded-[12px] uppercase tracking-wider border ${
                  routeGeneral
                    ? "bg-sky-500 text-white border-sky-400 animate-pulse shadow-md"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}>
                  {routeGeneral ? "● ON AIR" : "OFF"}
                </span>
              </button>

              {/* Share to Speaker Screen Toggle */}
              <button
                onClick={() => handleRouteToggle("speaker")}
                disabled={!isDesktopController}
                className={`flex items-center justify-between p-3 rounded-[12px] border transition-all text-left ${
                  routeSpeaker
                    ? "bg-violet-500/15 border-violet-500/40 text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.2)]"
                    : "bg-black/30 border-white/10 text-white/70 hover:bg-white/[0.04]"
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[12px] flex items-center justify-center border ${
                    routeSpeaker
                      ? "bg-violet-500/20 border-violet-400/40 text-violet-300"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiUsersThree size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white">Share to Speaker Screen [S]</span>
                    <span className="text-[10px] text-white/40 block">
                      {routeSpeaker ? "Live Output showing on confidence screen" : "Currently showing speaker confidence monitor"}
                    </span>
                  </div>
                </div>
                <span className={`text-[9px] font-black px-2.5 py-1 rounded-[12px] uppercase tracking-wider border ${
                  routeSpeaker
                    ? "bg-violet-500 text-white border-violet-400 animate-pulse shadow-md"
                    : "bg-white/5 border-white/10 text-white/40"
                }`}>
                  {routeSpeaker ? "● ON AIR" : "OFF"}
                </span>
              </button>

              {/* Share to Social Media & Live Stream */}
              <div
                onClick={() => setShowBroadcastModal(true)}
                className={`flex items-center justify-between p-3 rounded-[12px] border cursor-pointer transition-all hover:bg-white/[0.08] select-none ${
                  isStreaming
                    ? "bg-rose-500/15 border-rose-500/40 text-white shadow-lg shadow-rose-950/30"
                    : "bg-black/30 border-white/10 text-white/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[12px] border flex items-center justify-center ${
                    isStreaming
                      ? "bg-rose-500 text-white border-rose-400 animate-pulse"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiRadio size={18} />
                  </div>
                  <div>
                    <span className="text-xs font-bold block text-white flex items-center gap-2">
                      Social Media & Live Stream
                      {isStreaming && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping inline-block" />
                      )}
                    </span>
                    <span className="text-[10px] text-white/40 block">
                      {isAnyStreaming
                        ? (() => {
                            const statValues = Object.values(multiStreamStatus).filter(s => s?.isStreaming);
                            const activeCount = statValues.length;
                            const hasLive = statValues.some(s => s?.state === 'live');
                            const hasTransmitting = statValues.some(s => s?.state === 'transmitting' || s?.state === 'encoding');
                            const validFps = statValues.filter(s => typeof s.fps === 'number');
                            const avgFps = validFps.length ? Math.round(validFps.reduce((a, s) => a + s.fps, 0) / validFps.length) : null;
                            const totalKbps = statValues.reduce((a, s) => a + (s.bitrateKbps || 0), 0);
                            const stateLabel = hasLive ? 'live' : hasTransmitting ? 'transmitting' : 'active';
                            return `${activeCount} ${stateLabel} · ${avgFps != null ? avgFps + ' fps' : '— fps'} · ${totalKbps > 0 ? totalKbps.toFixed(0) + ' kbps' : '— kbps'}`;
                          })()
                        : "Configure RTMP/SRT Broadcast & Recording"}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAnyStreaming ? (
                    <span className="text-[9px] font-black px-2.5 py-1 rounded-[12px] bg-rose-500 text-white uppercase tracking-wider animate-pulse shadow-md">
                      ● ON AIR
                    </span>
                  ) : (
                    <span className="text-[9px] font-bold px-2 py-1 rounded-[12px] bg-white/10 border border-white/20 text-white/80 uppercase tracking-wider hover:bg-white/20">
                      SETTINGS
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Switcher Controller Permission ───────────────────────────────── */}
          <div className="bg-white/[0.04] border border-white/10 rounded-[12px] p-4 flex flex-col gap-3 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 flex items-center gap-1.5">
              <PiLockKey size={12} />
              Switcher Controller Permission
            </p>

            <div className={`flex items-center gap-2.5 px-3 py-2 rounded-[12px] border text-sm ${
              isDesktopController
                ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                : "bg-amber-500/10 border-amber-500/25 text-amber-300"
            }`}>
              {isDesktopController ? <PiTelevision size={14} /> : <PiUser size={14} />}
              <span className="font-semibold text-[11px]">
                {isDesktopController ? "Desktop (this machine)" : controllerName}
              </span>
              <span className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-[12px] bg-current/20 border border-current/30 opacity-80">
                {isDesktopController ? "LOCAL" : "REMOTE"}
              </span>
            </div>

            {/* Grant control */}
            {isDesktopController && pairedDevices.filter((d) => d.paired).length > 0 && (
              <div className="flex gap-2">
                <select
                  value={grantTarget}
                  onChange={(e) => setGrantTarget(e.target.value)}
                  className="flex-1 bg-black/60 border border-white/10 rounded-[12px] px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-white/30"
                >
                  <option value="">Select phone to grant control…</option>
                  {pairedDevices.filter((d) => d.paired).map((dev) => (
                    <option key={dev.id} value={dev.id}>{dev.name || dev.id}</option>
                  ))}
                </select>
                <button
                  onClick={handleGrantControl}
                  disabled={!grantTarget}
                  className="px-3 py-1.5 rounded-[12px] bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 disabled:opacity-40 transition-all"
                >
                  Grant
                </button>
              </div>
            )}

            {/* Reclaim control */}
            {!isDesktopController && (
              <button
                onClick={handleReclaimControl}
                className="w-full py-2 px-3 rounded-[12px] bg-red-600/30 hover:bg-red-600/40 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <PiArrowCounterClockwise size={14} />
                Reclaim Control Immediately
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Camera / Video Input Assignment Modal ─────────────────────────────── */}
      {isAssignModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#13141f] border border-white/15 rounded-[12px] shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[12px] bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                  <PiVideoCamera size={20} />
                </div>
                <div>
                  <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    Assign Input to Slot {selectedAssignSlotIndex}
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      1080P/720P 60FPS
                    </span>
                  </h2>
                  <p className="text-[11px] text-white/50">
                    Select a physical HDMI camcorder, USB capture card, or mobile companion.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseAssignModal}
                className="p-1.5 rounded-[12px] text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Close Modal"
              >
                <PiX size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 px-6 pt-4 pb-2 border-b border-white/10 bg-black/20">
              <button
                onClick={() => setActiveAssignTab("camcorder")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-[12px] text-xs font-bold transition-all border ${
                  activeAssignTab === "camcorder"
                    ? "bg-red-500/20 border-red-500/40 text-red-300 shadow-sm"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                }`}
              >
                <PiTelevision size={15} />
                <span>Camcorder & HDMI Capture</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[12px] bg-black/40 text-white/70">
                  {localVideoDevices.length}
                </span>
              </button>

              <button
                onClick={() => setActiveAssignTab("mobile")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-[12px] text-xs font-bold transition-all border ${
                  activeAssignTab === "mobile"
                    ? "bg-sky-500/20 border-sky-500/40 text-sky-300 shadow-sm"
                    : "bg-white/5 border-white/10 text-white/50 hover:text-white"
                }`}
              >
                <PiDeviceMobile size={15} />
                <span>Mobile Companions</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-[12px] bg-black/40 text-white/70">
                  {pairedDevices.filter((d) => d && (d.paired !== false || d.id)).length}
                </span>
              </button>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 max-h-[380px] overflow-y-auto flex flex-col gap-3">
              {activeAssignTab === "camcorder" ? (
                <>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                      Detected Hardware Devices
                    </span>
                    <button
                      onClick={refreshLocalDevices}
                      disabled={isScanningDevices}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50 px-2 py-1 rounded-[12px] bg-sky-500/10 border border-sky-500/20 transition-all"
                    >
                      <PiArrowsClockwise size={12} className={isScanningDevices ? "animate-spin" : ""} />
                      <span>{isScanningDevices ? "Scanning..." : "Rescan Devices"}</span>
                    </button>
                  </div>

                  {localVideoDevices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 rounded-[12px] bg-white/[0.02] border border-white/10 text-center gap-2">
                      <PiTelevision size={32} className="text-white/20" />
                      <p className="text-xs font-bold text-white/80">No hardware video capture devices found</p>
                      <p className="text-[11px] text-white/40 max-w-sm">
                        Connect your camcorder or DSLR via an HDMI capture card (such as Elgato Cam Link, Blackmagic, or USB3 video dongle) and click Rescan.
                      </p>
                    </div>
                  ) : (
                    localVideoDevices.map((dev) => {
                      const assignedSlot = cameraSlots.find((s) => s.deviceId === dev.deviceId);
                      const isCurrentlyAssigned = !!assignedSlot;

                      return (
                        <div
                          key={dev.deviceId}
                          className="flex items-center justify-between p-3.5 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 pr-2">
                            <div className="w-10 h-10 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-white/60 shrink-0">
                              {dev.isCamcorder ? <PiTelevision size={20} className="text-red-400" /> : <PiVideoCamera size={20} className="text-sky-400" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate">{dev.label}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-[12px] bg-red-500/15 border border-red-500/25 text-red-300">
                                  {dev.type}
                                </span>
                                <span className="text-[9px] font-mono text-white/40">1080p/720p 60fps UVC</span>
                              </div>
                            </div>
                          </div>

                          <button
                            onClick={() => handleAssignCamcorder(selectedAssignSlotIndex, dev.deviceId, dev.label)}
                            className="px-3.5 py-1.5 rounded-[12px] bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 transition-all shadow-md active:scale-95"
                          >
                            {isCurrentlyAssigned ? `Move to Slot ${selectedAssignSlotIndex}` : "Connect & Assign"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                      Connected Mobile Companions
                    </span>
                    <button
                      onClick={refreshMobileDevices}
                      disabled={isScanningMobiles}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50 px-2 py-1 rounded-[12px] bg-sky-500/10 border border-sky-500/20 transition-all"
                    >
                      <PiArrowsClockwise size={12} className={isScanningMobiles ? "animate-spin" : ""} />
                      <span>{isScanningMobiles ? "Scanning..." : "Rescan Mobile"}</span>
                    </button>
                  </div>

                  {pairedDevices.filter((d) => d && (d.paired !== false || d.id)).length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 rounded-[12px] bg-white/[0.02] border border-white/10 text-center gap-2">
                      <PiDeviceMobile size={32} className="text-white/20" />
                      <p className="text-xs font-bold text-white/80">No mobile companions connected</p>
                      <p className="text-[11px] text-white/40 max-w-sm">
                        Connect or pair your mobile companion phone on the local Wi-Fi to stream live video into this slot.
                      </p>
                    </div>
                  ) : (
                    pairedDevices
                      .filter((d) => d && (d.paired !== false || d.id))
                      .map((dev) => {
                        const assignedSlot = cameraSlots.find((s) => s.socketId === dev.id);
                        const isCurrentlyAssigned = !!assignedSlot;

                        return (
                          <div
                            key={dev.id}
                            className="flex items-center justify-between p-3.5 rounded-[12px] bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center gap-3 min-w-0 pr-2">
                              <div className="w-10 h-10 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-sky-400 shrink-0">
                                <PiDeviceMobile size={20} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{dev.name || dev.id}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-[12px] border ${
                                    dev.paired !== false
                                      ? "bg-emerald-500/15 border-emerald-500/25 text-emerald-300"
                                      : "bg-amber-500/15 border-amber-500/25 text-amber-300"
                                  }`}>
                                    {dev.paired !== false ? "Connected" : "Connected (Pending Pair)"}
                                  </span>
                                  {dev.ip && (
                                    <span className="text-[9px] font-mono text-white/40">
                                      {dev.ip}
                                    </span>
                                  )}
                                  <span className="text-[9px] font-mono text-white/40">LAN Wireless</span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleAssignMobile(selectedAssignSlotIndex, dev)}
                              className="px-3.5 py-1.5 rounded-[12px] bg-sky-600/80 hover:bg-sky-500 text-white font-bold text-xs shrink-0 transition-all shadow-md active:scale-95"
                            >
                              {isCurrentlyAssigned ? `Move to Slot ${selectedAssignSlotIndex}` : `Assign to Slot ${selectedAssignSlotIndex}`}
                            </button>
                          </div>
                        );
                      })
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
              <button
                onClick={handleCloseAssignModal}
                className="px-4 py-2 rounded-[12px] bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Broadcast Studio Engine & Presentation-Style Overlays Modal ──── */}
      {isStudioModalOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-150"
          onMouseUp={handleStudioMouseUp}
          onMouseMove={handleStudioMouseMove}
        >
          <div className="w-full h-full bg-[#0d0b14] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/10 bg-white/[0.02] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-[12px] bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <PiTelevision size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    Live Broadcast Studio
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-[12px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      PRESENTATION-STYLE OVERLAYS
                    </span>
                  </h3>
                  <p className="text-[11px] text-white/40">
                    Add images in layers, click & drag overlays on the screen, adjust speaker lower thirds, and scale frame.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-[12px] bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-semibold text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Live Air Compositor Active • Synchronized</span>
                </div>
                <button
                  onClick={() => setIsStudioModalOpen(false)}
                  className="px-5 py-2 rounded-[12px] bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-1.5"
                >
                  <PiCheck size={14} />
                  <span>Done</span>
                </button>
                <button
                  onClick={() => setIsStudioModalOpen(false)}
                  className="p-2 rounded-[12px] bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                  title="Close Studio Editor"
                >
                  <PiX size={16} />
                </button>
              </div>
            </div>

            {/* Modal Workspace Body (Row: Left Visual Canvas + Right Panels) */}
            <div className="flex-1 min-h-0 flex gap-4 p-4 overflow-hidden">
              {/* ── Left Column: 16:9 Canvas & Quick Adjuster ───────────────── */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 gap-3">
                {/* Max-sized 16:9 Canvas matching Presentation Screen */}
                <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black/40 rounded-[12px] border border-white/10 p-2 overflow-hidden">
                  <div
                    ref={studioCanvasRef}
                    onMouseDown={() => setSelectedStudioLayerId(null)}
                    className="aspect-video w-full max-h-full bg-black rounded-[12px] border border-white/10 relative overflow-hidden shadow-2xl flex items-center justify-center select-none"
                    style={{ containerType: "size" }}
                  >
                  {/* Scaled Live Video Frame Container */}
                  <div
                    className="relative overflow-hidden transition-all duration-300 flex items-center justify-center bg-[#07060c]"
                    style={{
                      width: `${(cfg.scale || 1.0) * 100}%`,
                      height: `${(cfg.scale || 1.0) * 100}%`,
                      borderRadius: cfg.scale < 1.0 ? "12px" : "0px",
                      border: cfg.scale < 1.0 ? "1.5px solid rgba(168, 85, 247, 0.4)" : "none",
                      boxShadow: cfg.scale < 1.0 ? "0 0 30px rgba(0,0,0,0.8)" : "none",
                    }}
                  >
                    {/* Live Screen Program Background / Video Stream */}
                    {cameraStreams.get(effectiveProgramSourceId) ? (
                      <video
                        ref={(el) => {
                          if (el && cameraStreams.get(effectiveProgramSourceId)) {
                            el.srcObject = cameraStreams.get(effectiveProgramSourceId);
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full ${cfg.fitMode === "contain" ? "object-contain" : "object-cover"}`}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#100d1c] via-[#090812] to-black p-6 text-center">
                        <div className="w-12 h-12 rounded-[12px] bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/30 mb-2">
                          <PiTelevision size={24} />
                        </div>
                        <p className="text-xs font-bold text-white/70 uppercase tracking-wider">
                          Live Program Screen ({getSourceName(effectiveProgramSourceId)})
                        </p>
                        <p className="text-[10px] text-white/30 mt-1 max-w-sm">
                          Drag and resize overlay layers directly on this 16:9 broadcast canvas.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* ── Custom Image Layers (Rendered & Draggable on Canvas) ───── */}
                  {Array.isArray(cfg.layers) && cfg.layers.map((layer, idx) => {
                    if (!layer || !layer.content) return null;
                    const isSelected = selectedStudioLayerId === layer.id;
                    const zIndex = isSelected ? 100 : 20 + idx;

                    return (
                      <div
                        key={layer.id}
                        onMouseDown={(e) => handleStudioMouseDown(e, layer.id)}
                        className="absolute cursor-move select-none group"
                        style={{
                          left: `${layer.x ?? 50}%`,
                          top: `${layer.y ?? 50}%`,
                          transform: "translate(-50%, -50%)",
                          width: `${layer.style?.width || 18}%`,
                          opacity: layer.style?.opacity ?? 1,
                          zIndex,
                        }}
                      >
                        {/* 8-Point Transform Handles when selected */}
                        {isSelected && (
                          <>
                            <div className="absolute -inset-2 border-2 border-purple-500 border-dashed rounded-[12px] pointer-events-none z-50 shadow-sm" />
                            {["nw", "ne", "sw", "se", "ml", "mr", "mt", "mb"].map((h) => {
                              const pos = {
                                nw: "-top-2 -left-2 cursor-nwse-resize",
                                ne: "-top-2 -right-2 cursor-nesw-resize",
                                sw: "-bottom-2 -left-2 cursor-nesw-resize",
                                se: "-bottom-2 -right-2 cursor-nwse-resize",
                                ml: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize",
                                mr: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize",
                                mt: "left-1/2 -translate-x-1/2 -top-2 cursor-ns-resize",
                                mb: "left-1/2 -translate-x-1/2 -bottom-2 cursor-ns-resize",
                              }[h];
                              return (
                                <div
                                  key={h}
                                  onMouseDown={(e) => handleStudioMouseDown(e, layer.id, h)}
                                  className={`absolute w-3.5 h-3.5 bg-purple-500 border-2 border-white rounded-full z-50 shadow-md ${pos}`}
                                />
                              );
                            })}
                          </>
                        )}
                        <img
                          src={layer.content}
                          alt={layer.name || "Layer"}
                          className="w-full h-auto object-contain pointer-events-none select-none shadow-xl"
                          style={{ borderRadius: "12px" }}
                        />
                      </div>
                    );
                  })}

                  {/* ── Speaker Lower Third Layer on Canvas ─────────────────────── */}
                  {cfg.lowerThird?.enabled && (
                    <div
                      onMouseDown={(e) => handleStudioMouseDown(e, "lowerThird")}
                      className="absolute cursor-move select-none group"
                      style={{
                        left: `${cfg.lowerThird.x ?? 22}%`,
                        top: `${cfg.lowerThird.y ?? 88}%`,
                        transform: "translate(-50%, -50%)",
                        width: `${cfg.lowerThird.width ?? 36}%`,
                        zIndex: selectedStudioLayerId === "lowerThird" ? 100 : 35,
                      }}
                    >
                      {selectedStudioLayerId === "lowerThird" && (
                        <>
                          <div className="absolute -inset-2 border-2 border-purple-500 border-dashed rounded-[12px] pointer-events-none z-50 shadow-sm" />
                          {["nw", "ne", "sw", "se", "ml", "mr"].map((h) => {
                            const pos = {
                              nw: "-top-2 -left-2 cursor-nwse-resize",
                              ne: "-top-2 -right-2 cursor-nesw-resize",
                              sw: "-bottom-2 -left-2 cursor-nesw-resize",
                              se: "-bottom-2 -right-2 cursor-nwse-resize",
                              ml: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize",
                              mr: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize",
                            }[h];
                            return (
                              <div
                                key={h}
                                onMouseDown={(e) => handleStudioMouseDown(e, "lowerThird", h)}
                                className={`absolute w-3.5 h-3.5 bg-purple-500 border-2 border-white rounded-full z-50 shadow-md ${pos}`}
                              />
                            );
                          })}
                        </>
                      )}
                      {renderCustomLowerThirdUI(cfg.lowerThird)}
                    </div>
                  )}

                  {/* ── Bible Scripture Lower Third Layer on Canvas ─────────────── */}
                  {cfg.bibleLowerThird?.enabled && cfg.bibleLowerThird?.isShowing && (
                    <div
                      onMouseDown={(e) => handleStudioMouseDown(e, "bible")}
                      className="absolute cursor-move select-none group"
                      style={{
                        left: `${cfg.bibleLowerThird.x ?? 50}%`,
                        top: `${cfg.bibleLowerThird.y ?? 85}%`,
                        transform: "translate(-50%, -50%)",
                        width: `${cfg.bibleLowerThird.width ?? 90}%`,
                        zIndex: selectedStudioLayerId === "bible" ? 100 : 40,
                      }}
                    >
                      {selectedStudioLayerId === "bible" && (
                        <>
                          <div className="absolute -inset-2 border-2 border-amber-500 border-dashed rounded-[12px] pointer-events-none z-50 shadow-sm" />
                          {["nw", "ne", "sw", "se", "ml", "mr"].map((h) => {
                            const pos = {
                              nw: "-top-2 -left-2 cursor-nwse-resize",
                              ne: "-top-2 -right-2 cursor-nesw-resize",
                              sw: "-bottom-2 -left-2 cursor-nesw-resize",
                              se: "-bottom-2 -right-2 cursor-nwse-resize",
                              ml: "top-1/2 -translate-y-1/2 -left-2 cursor-ew-resize",
                              mr: "top-1/2 -translate-y-1/2 -right-2 cursor-ew-resize",
                            }[h];
                            return (
                              <div
                                key={h}
                                onMouseDown={(e) => handleStudioMouseDown(e, "bible", h)}
                                className={`absolute w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full z-50 shadow-md ${pos}`}
                              />
                            );
                          })}
                        </>
                      )}
                      <div className="flex flex-col rounded-[12px] bg-[#0c0a14]/95 border-2 border-amber-500/50 shadow-2xl p-3 backdrop-blur-md">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-amber-300 font-black text-xs tracking-wide">
                              📖 {cfg.bibleLowerThird.currentRef || "Scripture Reference"}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-[12px] bg-amber-400/20 text-amber-200 border border-amber-400/30">
                              {cfg.bibleLowerThird.version || "KJV"}
                            </span>
                          </div>
                          <span className="text-[9px] font-bold text-amber-400/80 uppercase">
                            LIVE ON AIR
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-white/95 leading-relaxed line-clamp-2">
                          "{cfg.bibleLowerThird.currentText || "Scripture verse body text..."}"
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Live Announcement Ticker Banner on Canvas ───────────────── */}
                  {cfg.ticker?.enabled && (
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedStudioLayerId("ticker");
                      }}
                      className="absolute bottom-0 inset-x-0 bg-slate-950/95 border-t border-white/10 px-3 py-1.5 flex items-center gap-3 z-30 cursor-pointer"
                    >
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-[12px] bg-red-600 text-white tracking-wider">
                        LIVE
                      </span>
                      <p className="text-xs font-semibold text-white/80 truncate">
                        {cfg.ticker.text || "Live ticker announcement text..."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

                {/* ── Selected Layer Adjuster Toolbar (Directly beneath canvas) ─ */}
                <div className="bg-white/[0.03] border border-white/10 rounded-[12px] p-3 flex flex-col gap-2 shrink-0">
                  {selectedStudioLayerId && selectedStudioLayerId.startsWith("img-") ? (
                    (() => {
                      const curLayer = (cfg.layers || []).find((l) => l.id === selectedStudioLayerId);
                      if (!curLayer) return null;

                      return (
                        <div className="flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-[12px] bg-black/50 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                <img src={curLayer.content} alt="Thumb" className="w-full h-full object-contain" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-white block truncate max-w-[200px]">
                                  {curLayer.name || "Image Layer"}
                                </span>
                                <span className="text-[10px] text-white/40">
                                  Position ({curLayer.x ?? 50}%, {curLayer.y ?? 50}%) • Width {curLayer.style?.width || 18}%
                                </span>
                              </div>
                            </div>

                            {/* Corner Snap Presets */}
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-white/40 mr-1 font-semibold">Snap:</span>
                              {[
                                { label: "TL", x: 15, y: 15 },
                                { label: "TR", x: 85, y: 15 },
                                { label: "BL", x: 15, y: 85 },
                                { label: "BR", x: 85, y: 85 },
                                { label: "Center", x: 50, y: 50 },
                              ].map(({ label, x, y }) => (
                                <button
                                  key={label}
                                  onClick={() => {
                                    const nextLayers = (cfg.layers || []).map((l) =>
                                      l.id === curLayer.id ? { ...l, x, y } : l
                                    );
                                    handleUpdateBroadcastConfig({ layers: nextLayers });
                                  }}
                                  className="px-2 py-1 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 hover:text-white text-[10px] font-bold transition-all border border-white/5"
                                >
                                  {label}
                                </button>
                              ))}

                              <button
                                onClick={() => handleRemoveStudioLayer(curLayer.id)}
                                className="ml-2 px-2.5 py-1 rounded-[12px] bg-red-500/15 hover:bg-red-500/25 text-red-300 text-[10px] font-bold transition-all border border-red-500/30 flex items-center gap-1"
                              >
                                <PiTrash size={12} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>

                          {/* Sliders: Width & Opacity */}
                          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-white/5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-white/50 w-24 shrink-0 font-semibold">
                                Width: <b className="text-white font-mono">{curLayer.style?.width || 18}%</b>
                              </span>
                              <input
                                type="range"
                                min="5"
                                max="100"
                                value={curLayer.style?.width || 18}
                                onChange={(e) => {
                                  const nextLayers = (cfg.layers || []).map((l) =>
                                    l.id === curLayer.id ? { ...l, style: { ...l.style, width: parseInt(e.target.value, 10) } } : l
                                  );
                                  handleUpdateBroadcastConfig({ layers: nextLayers });
                                }}
                                className="flex-1 accent-purple-500 h-1 bg-white/20 rounded-[12px] cursor-pointer"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-white/50 w-24 shrink-0 font-semibold">
                                Opacity: <b className="text-white font-mono">{Math.round((curLayer.style?.opacity ?? 1) * 100)}%</b>
                              </span>
                              <input
                                type="range"
                                min="10"
                                max="100"
                                value={Math.round((curLayer.style?.opacity ?? 1) * 100)}
                                onChange={(e) => {
                                  const nextLayers = (cfg.layers || []).map((l) =>
                                    l.id === curLayer.id ? { ...l, style: { ...l.style, opacity: parseInt(e.target.value, 10) / 100 } } : l
                                  );
                                  handleUpdateBroadcastConfig({ layers: nextLayers });
                                }}
                                className="flex-1 accent-purple-500 h-1 bg-white/20 rounded-[12px] cursor-pointer"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ) : selectedStudioLayerId === "lowerThird" ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PiIdentificationCard size={18} className="text-purple-400" />
                          <span className="text-xs font-bold text-white">Speaker Lower Third Overlay</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-[12px] border ${
                            cfg.lowerThird.enabled
                              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                              : "bg-white/5 border-white/10 text-white/40"
                          }`}>
                            {cfg.lowerThird.enabled ? "ON AIR" : "DISABLED"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setStudioModalTab("designer");
                              setIsStudioModalOpen(true);
                            }}
                            className="px-3 py-1 rounded-[12px] bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-purple-900/30 flex items-center gap-1.5"
                          >
                            <PiPaintBrush size={13} />
                            <span>🎨 Open Designer</span>
                          </button>
                          <button
                            onClick={() => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, x: 22, y: 88, width: 36 } })}
                            className="px-2.5 py-1 rounded-[12px] bg-white/5 hover:bg-white/15 text-white/70 text-[10px] font-bold transition-all border border-white/5"
                          >
                            Reset (Compact)
                          </button>
                          <button
                            onClick={() => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, enabled: !cfg.lowerThird.enabled } })}
                            className={`px-3 py-1 rounded-[12px] text-xs font-bold transition-all border ${
                              cfg.lowerThird.enabled
                                ? "bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white"
                            }`}
                          >
                            {cfg.lowerThird.enabled ? "Hide From Air" : "Show On Air"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2.5 pt-1">
                        <div>
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Presenter Name</label>
                          <input
                            type="text"
                            value={cfg.lowerThird.title}
                            onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, title: e.target.value } })}
                            placeholder="e.g. Pastor John Doe"
                            className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Role / Subtitle</label>
                          <input
                            type="text"
                            value={cfg.lowerThird.subtitle}
                            onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, subtitle: e.target.value } })}
                            placeholder="e.g. Senior Pastor"
                            className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-0.5">
                            <label className="text-[10px] font-bold text-white/50">Width</label>
                            <span className="text-[10px] font-mono text-purple-300">{cfg.lowerThird.width || 36}%</span>
                          </div>
                          <input
                            type="range"
                            min="20"
                            max="75"
                            value={cfg.lowerThird.width || 36}
                            onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, width: parseInt(e.target.value, 10) } })}
                            className="w-full accent-purple-500 h-1 bg-white/20 rounded-[12px] cursor-pointer mt-2"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Theme Quick Pick</label>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { id: "purple", label: "Purple" },
                              { id: "gradient", label: "Gold" },
                              { id: "minimal", label: "Dark" },
                            ].map(({ id, label }) => (
                              <button
                                key={id}
                                onClick={() => handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, theme: id } })}
                                className={`py-1 rounded-[12px] text-[10px] font-bold border transition-all ${
                                  cfg.lowerThird.theme === id
                                    ? "bg-purple-600/30 border-purple-500/50 text-purple-200"
                                    : "bg-white/[0.03] border-white/5 text-white/50"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : selectedStudioLayerId === "bible" ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PiBookOpen size={18} className="text-amber-400" />
                          <span className="text-xs font-bold text-white">Bible Scripture Lower Third</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-[12px] border ${
                            cfg.bibleLowerThird.isShowing
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse"
                              : "bg-white/5 border-white/10 text-white/40"
                          }`}>
                            {cfg.bibleLowerThird.isShowing ? "LIVE ON AIR" : "STANDBY"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200/90 cursor-pointer mr-2">
                            <input
                              type="checkbox"
                              checked={cfg.bibleLowerThird.autoTrigger}
                              onChange={(e) => handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, autoTrigger: e.target.checked } })}
                              className="rounded accent-amber-500"
                            />
                            <span>Auto-Trigger on Scripture Mention</span>
                          </label>

                          <button
                            onClick={() => handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, isShowing: !cfg.bibleLowerThird.isShowing } })}
                            className={`px-4 py-1.5 rounded-[12px] text-xs font-black transition-all border shadow-md active:scale-95 ${
                              cfg.bibleLowerThird.isShowing
                                ? "bg-red-600 hover:bg-red-500 text-white border-red-400"
                                : "bg-amber-600 hover:bg-amber-500 text-white border-amber-400"
                            }`}
                          >
                            {cfg.bibleLowerThird.isShowing ? "Hide From Air" : "Show Scripture On Air Now"}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2.5 pt-1">
                        <div>
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Reference</label>
                          <input
                            type="text"
                            value={cfg.bibleLowerThird.currentRef}
                            onChange={(e) => handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, currentRef: e.target.value } })}
                            placeholder="e.g. John 3:16"
                            className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white font-bold placeholder-white/20 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Verse Content</label>
                          <input
                            type="text"
                            value={cfg.bibleLowerThird.currentText}
                            onChange={(e) => handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, currentText: e.target.value } })}
                            placeholder="Scripture verse body..."
                            className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-white/50 block mb-0.5">Auto-Dismiss</label>
                          <div className="grid grid-cols-3 gap-1">
                            {[
                              { sec: 10, label: "10s" },
                              { sec: 15, label: "15s" },
                              { sec: 0, label: "Manual" },
                            ].map(({ sec, label }) => (
                              <button
                                key={sec}
                                onClick={() => handleUpdateBroadcastConfig({ bibleLowerThird: { ...cfg.bibleLowerThird, autoDismissSec: sec } })}
                                className={`py-1 rounded-[12px] text-[10px] font-bold border transition-all ${
                                  cfg.bibleLowerThird.autoDismissSec === sec
                                    ? "bg-amber-600/30 border-amber-500/50 text-amber-200"
                                    : "bg-white/[0.03] border-white/5 text-white/50"
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : selectedStudioLayerId === "ticker" ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PiMegaphone size={18} className="text-red-400" />
                          <span className="text-xs font-bold text-white">Announcement Ticker</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-[12px] border ${
                            cfg.ticker.enabled
                              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                              : "bg-white/5 border-white/10 text-white/40"
                          }`}>
                            {cfg.ticker.enabled ? "ENABLED" : "DISABLED"}
                          </span>
                        </div>
                        <button
                          onClick={() => handleUpdateBroadcastConfig({ ticker: { ...cfg.ticker, enabled: !cfg.ticker.enabled } })}
                          className="px-3 py-1 rounded-[12px] bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all"
                        >
                          {cfg.ticker.enabled ? "Disable Ticker" : "Enable Ticker"}
                        </button>
                      </div>
                      <input
                        type="text"
                        value={cfg.ticker.text}
                        onChange={(e) => handleUpdateBroadcastConfig({ ticker: { ...cfg.ticker, text: e.target.value } })}
                        placeholder="e.g. Welcome to Church! • Offering & Tithing online at church.org/give"
                        className="w-full px-2.5 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between py-1 px-2 text-white/50 text-xs font-medium">
                      <span>💡 Click any graphic overlay or lower third on the screen to reposition & resize, or select from the right panel.</span>
                      <button
                        onClick={() => setStudioModalTab("media")}
                        className="px-3 py-1 rounded-[12px] bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 text-xs font-bold transition-all border border-purple-500/40"
                      >
                        + Add Image Layer
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Right Column: Studio Tabs & Asset Panels ─────────────────── */}
              <div className="w-88 shrink-0 flex flex-col min-h-0 bg-white/[0.02] border border-white/10 rounded-[12px] overflow-hidden">
                {/* Right Panel Tab Bar */}
                <div className="grid grid-cols-4 border-b border-white/10 bg-white/[0.01]">
                  {[
                    { id: "layers", label: "Layers", icon: PiStack },
                    { id: "designer", label: "Designer", icon: PiPaintBrush },
                    { id: "media", label: "Media", icon: PiImage },
                    { id: "scale", label: "Frame", icon: PiCube },
                  ].map(({ id, label, icon: Icon }) => {
                    const active = studioModalTab === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setStudioModalTab(id)}
                        className={`py-2.5 flex flex-col items-center gap-1 text-[11px] font-bold transition-all border-b-2 ${
                          active
                            ? "border-purple-500 text-purple-300 bg-purple-500/10"
                            : "border-transparent text-white/40 hover:text-white/80 hover:bg-white/[0.02]"
                        }`}
                      >
                        <Icon size={16} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Right Panel Tab Body */}
                <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                  {/* ── TAB 1: LAYERS STACK ──────────────────────────────────── */}
                  {studioModalTab === "layers" && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between pb-1">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                          Active Layers ({(cfg.layers || []).length + 3})
                        </span>
                        <button
                          onClick={() => setStudioModalTab("media")}
                          className="text-[10px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1 px-2 py-0.5 rounded-[12px] bg-purple-500/10 border border-purple-500/20"
                        >
                          <PiPlus size={11} /> Add Image
                        </button>
                      </div>

                      {/* Custom Image Layers */}
                      {Array.isArray(cfg.layers) && cfg.layers.map((layer, idx) => {
                        const isSelected = selectedStudioLayerId === layer.id;
                        return (
                          <div
                            key={layer.id}
                            onClick={() => setSelectedStudioLayerId(layer.id)}
                            className={`p-2 rounded-[12px] flex items-center justify-between text-xs cursor-pointer transition-all border group ${
                              isSelected
                                ? "bg-purple-600/25 border-purple-500/60 text-purple-200 shadow-sm"
                                : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.06]"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <div className="w-7 h-7 rounded-[12px] bg-black/50 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                                <img src={layer.content} alt="Thumb" className="w-full h-full object-contain" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-xs truncate">{layer.name || "Image Layer"}</p>
                                <span className="text-[9px] text-white/40 block">
                                  Width {layer.style?.width || 18}% • Opacity {Math.round((layer.style?.opacity ?? 1) * 100)}%
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                disabled={idx === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveStudioLayer(idx, "up");
                                }}
                                className="p-1 rounded-[12px] text-white/30 hover:text-white disabled:opacity-20"
                                title="Move Forward"
                              >
                                <PiArrowUp size={11} />
                              </button>
                              <button
                                disabled={idx === cfg.layers.length - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMoveStudioLayer(idx, "down");
                                }}
                                className="p-1 rounded-[12px] text-white/30 hover:text-white disabled:opacity-20"
                                title="Move Backward"
                              >
                                <PiArrowDown size={11} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveStudioLayer(layer.id);
                                }}
                                className="p-1 rounded-[12px] text-white/30 hover:text-red-400"
                                title="Delete Layer"
                              >
                                <PiTrash size={12} />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Speaker Lower Third Layer Item */}
                      <div
                        onClick={() => setSelectedStudioLayerId("lowerThird")}
                        className={`p-2.5 rounded-[12px] flex items-center justify-between text-xs cursor-pointer transition-all border ${
                          selectedStudioLayerId === "lowerThird"
                            ? "bg-purple-600/25 border-purple-500/60 text-purple-200 shadow-sm"
                            : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <PiIdentificationCard size={18} className="text-purple-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">Speaker Lower Third</p>
                            <span className="text-[9px] text-white/40 block truncate">
                              {cfg.lowerThird.title || "No presenter title set"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateBroadcastConfig({ lowerThird: { ...cfg.lowerThird, enabled: !cfg.lowerThird.enabled } });
                          }}
                          className={`p-1.5 rounded-[12px] text-[10px] font-bold border ${
                            cfg.lowerThird.enabled
                              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                              : "bg-white/5 border-white/10 text-white/30"
                          }`}
                        >
                          {cfg.lowerThird.enabled ? <PiEye size={13} /> : <PiEyeSlash size={13} />}
                        </button>
                      </div>

                      {/* Bible Scripture Layer Item */}
                      <div
                        onClick={() => setSelectedStudioLayerId("bible")}
                        className={`p-2.5 rounded-[12px] flex items-center justify-between text-xs cursor-pointer transition-all border ${
                          selectedStudioLayerId === "bible"
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-200 shadow-sm"
                            : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <PiBookOpen size={18} className="text-amber-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">Bible Scripture Card</p>
                            <span className="text-[9px] text-white/40 block truncate">
                              {cfg.bibleLowerThird.currentRef || "Auto-triggered on scripture"}
                            </span>
                          </div>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-[12px] border ${
                          cfg.bibleLowerThird.isShowing
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                            : "bg-white/5 border-white/10 text-white/30"
                        }`}>
                          {cfg.bibleLowerThird.isShowing ? "ON AIR" : "IDLE"}
                        </span>
                      </div>

                      {/* Ticker Layer Item */}
                      <div
                        onClick={() => setSelectedStudioLayerId("ticker")}
                        className={`p-2.5 rounded-[12px] flex items-center justify-between text-xs cursor-pointer transition-all border ${
                          selectedStudioLayerId === "ticker"
                            ? "bg-red-500/20 border-red-500/50 text-red-200 shadow-sm"
                            : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.06]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <PiMegaphone size={18} className="text-red-400 shrink-0" />
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate">Announcement Ticker</p>
                            <span className="text-[9px] text-white/40 block truncate">
                              {cfg.ticker.text || "Bottom news crawl banner"}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateBroadcastConfig({ ticker: { ...cfg.ticker, enabled: !cfg.ticker.enabled } });
                          }}
                          className={`p-1.5 rounded-[12px] text-[10px] font-bold border ${
                            cfg.ticker.enabled
                              ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                              : "bg-white/5 border-white/10 text-white/30"
                          }`}
                        >
                          {cfg.ticker.enabled ? <PiEye size={13} /> : <PiEyeSlash size={13} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── TAB: LOWER THIRD CUSTOM DESIGNER ─────────────────────── */}
                  {studioModalTab === "designer" && (() => {
                    const lt = cfg.lowerThird;
                    const st = lt?.style || DEFAULT_LOWER_THIRD_STYLE;

                    const updateStyle = (patch) => {
                      handleUpdateBroadcastConfig({
                        lowerThird: {
                          ...lt,
                          style: { ...st, ...patch },
                        },
                      });
                    };

                    const PRESET_TEMPLATES = [
                      {
                        name: "Church Classic",
                        desc: "Purple & gold, cross badge, accent slash",
                        style: {
                          shape: "rounded-rect",
                          badgeShape: "circle",
                          badgeIcon: "cross",
                          primaryColor: "#581c87",
                          secondaryColor: "#3b0764",
                          accentColor: "#f59e0b",
                          textColor: "#ffffff",
                          subtitleColor: "#cbd5e1",
                          opacity: 0.95,
                          fontSize: "medium",
                          uppercaseTitle: false,
                          showAccentSlash: true,
                        },
                      },
                      {
                        name: "Royal Cathedral",
                        desc: "Emerald & mint, dove badge, clean slash",
                        style: {
                          shape: "rounded-rect",
                          badgeShape: "circle",
                          badgeIcon: "dove",
                          primaryColor: "#064e3b",
                          secondaryColor: "#022c22",
                          accentColor: "#10b981",
                          textColor: "#ffffff",
                          subtitleColor: "#a7f3d0",
                          opacity: 0.95,
                          fontSize: "medium",
                          uppercaseTitle: false,
                          showAccentSlash: true,
                        },
                      },
                      {
                        name: "Modern Broadcast",
                        desc: "Sapphire blue, angled cut, mic badge",
                        style: {
                          shape: "angled-cut",
                          badgeShape: "circle",
                          badgeIcon: "mic",
                          primaryColor: "#0f172a",
                          secondaryColor: "#020617",
                          accentColor: "#38bdf8",
                          textColor: "#ffffff",
                          subtitleColor: "#bae6fd",
                          opacity: 0.92,
                          fontSize: "medium",
                          uppercaseTitle: true,
                          showAccentSlash: true,
                        },
                      },
                      {
                        name: "Clean Minimal",
                        desc: "Charcoal bar, no badge, crisp subtitle",
                        style: {
                          shape: "minimal-bar",
                          badgeShape: "none",
                          badgeIcon: "user",
                          primaryColor: "#18181b",
                          secondaryColor: "#09090b",
                          accentColor: "#a855f7",
                          textColor: "#ffffff",
                          subtitleColor: "#94a3b8",
                          opacity: 0.9,
                          fontSize: "small",
                          uppercaseTitle: false,
                          showAccentSlash: false,
                        },
                      },
                    ];

                    const COLOR_SWATCHES = [
                      { label: "Purple", primary: "#581c87", secondary: "#3b0764", accent: "#a855f7" },
                      { label: "Gold", primary: "#78350f", secondary: "#451a03", accent: "#f59e0b" },
                      { label: "Emerald", primary: "#064e3b", secondary: "#022c22", accent: "#10b981" },
                      { label: "Sapphire", primary: "#0c4a6e", secondary: "#082f49", accent: "#38bdf8" },
                      { label: "Crimson", primary: "#881337", secondary: "#4c0519", accent: "#f43f5e" },
                      { label: "Slate", primary: "#18181b", secondary: "#09090b", accent: "#a1a1aa" },
                    ];

                    return (
                      <div className="flex flex-col gap-3">
                        {/* Live Air Action & Header */}
                        <div className="flex items-center justify-between p-2.5 rounded-[12px] bg-white/[0.03] border border-white/10">
                          <div className="flex items-center gap-2">
                            <PiPaintBrush size={16} className="text-purple-400" />
                            <span className="text-xs font-bold text-white">Lower Third Designer</span>
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-[12px] border ${
                              lt.enabled
                                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
                                : "bg-white/5 border-white/10 text-white/40"
                            }`}>
                              {lt.enabled ? "ON AIR" : "OFF AIR"}
                            </span>
                          </div>
                          <button
                            onClick={() => handleUpdateBroadcastConfig({ lowerThird: { ...lt, enabled: !lt.enabled } })}
                            className={`px-3 py-1 rounded-[12px] text-xs font-bold transition-all border shadow-sm active:scale-95 ${
                              lt.enabled
                                ? "bg-red-500/20 border-red-500/40 text-red-300 hover:bg-red-500/30"
                                : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500"
                            }`}
                          >
                            {lt.enabled ? "Hide From Air" : "Show On Air"}
                          </button>
                        </div>

                        {/* Quick Presets Swatches */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                              Design Templates
                            </span>
                            <button
                              onClick={() => {
                                handleUpdateBroadcastConfig({
                                  lowerThird: {
                                    ...lt,
                                    x: 22,
                                    y: 88,
                                    width: 36,
                                    style: DEFAULT_LOWER_THIRD_STYLE,
                                  },
                                });
                                showFeedback("Reset to default design", true);
                              }}
                              className="text-[9px] text-white/40 hover:text-white transition-colors"
                            >
                              Reset Defaults
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            {PRESET_TEMPLATES.map((tmpl) => (
                              <button
                                key={tmpl.name}
                                onClick={() => {
                                  updateStyle(tmpl.style);
                                  showFeedback(`Applied "${tmpl.name}" style`, true);
                                }}
                                className="p-2 rounded-[12px] bg-white/[0.02] border border-white/5 hover:border-purple-500/40 hover:bg-white/[0.05] text-left transition-all group"
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-[11px] font-bold text-white group-hover:text-purple-300">{tmpl.name}</p>
                                  <div
                                    className="w-3 h-3 rounded-full border border-white/20"
                                    style={{ backgroundColor: tmpl.style.primaryColor }}
                                  />
                                </div>
                                <p className="text-[9px] text-white/40 leading-tight truncate">{tmpl.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Shape Tools: Rectangles, Circles, Triangles */}
                        <div className="p-2.5 rounded-[12px] bg-white/[0.02] border border-white/10 flex flex-col gap-2.5">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">
                            Shape & Geometry Tools
                          </span>

                          {/* 1. Base Container Shape (Rectangles & Pills) */}
                          <div>
                            <label className="text-[10px] font-bold text-white/60 block mb-1 flex items-center gap-1.5">
                              <PiRectangle size={12} className="text-white/40" />
                              <span>Container Shape (Rectangles)</span>
                            </label>
                            <div className="grid grid-cols-2 gap-1.5">
                              {[
                                { id: "rounded-rect", label: "12px Rounded Rect" },
                                { id: "angled-cut", label: "Angled Slash Cut" },
                                { id: "minimal-bar", label: "Minimal Floating Bar" },
                                { id: "pill", label: "Modern Pill" },
                              ].map(({ id, label }) => (
                                <button
                                  key={id}
                                  onClick={() => updateStyle({ shape: id })}
                                  className={`py-1.5 px-2 rounded-[12px] text-[10px] font-bold border transition-all text-center ${
                                    (st.shape || "rounded-rect") === id
                                      ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                      : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 2. Badge Element Shape (Circles, Triangles, Rectangles) */}
                          <div>
                            <label className="text-[10px] font-bold text-white/60 block mb-1 flex items-center gap-1.5">
                              <PiCircle size={12} className="text-white/40" />
                              <span>Badge Holder Shape (Circles & Geometries)</span>
                            </label>
                            <div className="grid grid-cols-4 gap-1">
                              {[
                                { id: "circle", label: "Circle", icon: PiCircle },
                                { id: "triangle", label: "Triangle", icon: PiTriangle },
                                { id: "rect", label: "12px Rect", icon: PiRectangle },
                                { id: "none", label: "None", icon: PiX },
                              ].map(({ id, label, icon: Icon }) => (
                                <button
                                  key={id}
                                  onClick={() => updateStyle({ badgeShape: id })}
                                  className={`py-1 rounded-[12px] text-[10px] font-bold border transition-all flex flex-col items-center gap-0.5 ${
                                    (st.badgeShape || "circle") === id
                                      ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                      : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white"
                                  }`}
                                >
                                  <Icon size={12} />
                                  <span>{label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* 3. Badge Icon Selection (When badge is enabled) */}
                          {st.badgeShape !== "none" && st.badgeShape !== "triangle" && (
                            <div>
                              <label className="text-[10px] font-bold text-white/60 block mb-1">
                                Badge Icon
                              </label>
                              <div className="grid grid-cols-6 gap-1">
                                {[
                                  { id: "cross", label: "✝" },
                                  { id: "dove", label: "🕊" },
                                  { id: "user", label: "👤" },
                                  { id: "mic", label: "🎙" },
                                  { id: "star", label: "⭐" },
                                  { id: "bible", label: "📖" },
                                ].map(({ id, label }) => (
                                  <button
                                    key={id}
                                    onClick={() => updateStyle({ badgeIcon: id })}
                                    className={`py-1 rounded-[12px] text-xs font-bold border transition-all text-center ${
                                      (st.badgeIcon || "cross") === id
                                        ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                        : "bg-white/[0.02] border-white/5 text-white/50 hover:text-white"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 4. Triangular Accent Slash Divider */}
                          <div className="flex items-center justify-between pt-1 border-t border-white/5">
                            <div className="flex items-center gap-1.5">
                              <PiTriangle size={12} className="text-amber-400" />
                              <span className="text-[10px] font-bold text-white/70">Triangular Accent Divider</span>
                            </div>
                            <button
                              onClick={() => updateStyle({ showAccentSlash: !st.showAccentSlash })}
                              className={`px-2.5 py-0.5 rounded-[12px] text-[10px] font-bold border transition-all ${
                                st.showAccentSlash
                                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                                  : "bg-white/5 border-white/10 text-white/40"
                              }`}
                            >
                              {st.showAccentSlash ? "ACTIVE" : "OFF"}
                            </button>
                          </div>
                        </div>

                        {/* Color & Gradient Styling Engine */}
                        <div className="p-2.5 rounded-[12px] bg-white/[0.02] border border-white/10 flex flex-col gap-2.5">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">
                            Colors & Styling
                          </span>

                          {/* Swatches */}
                          <div className="grid grid-cols-6 gap-1">
                            {COLOR_SWATCHES.map((sw) => (
                              <button
                                key={sw.label}
                                onClick={() => updateStyle({
                                  primaryColor: sw.primary,
                                  secondaryColor: sw.secondary,
                                  accentColor: sw.accent,
                                })}
                                className="h-6 rounded-[12px] border border-white/20 transition-transform hover:scale-105"
                                style={{ background: `linear-gradient(135deg, ${sw.primary}, ${sw.secondary})` }}
                                title={sw.label}
                              />
                            ))}
                          </div>

                          {/* Color Inputs */}
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="text-[9px] font-bold text-white/50 block mb-0.5">Primary BG</label>
                              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-[12px] p-1">
                                <input
                                  type="color"
                                  value={st.primaryColor || "#581c87"}
                                  onChange={(e) => updateStyle({ primaryColor: e.target.value })}
                                  className="w-5 h-5 rounded-[12px] bg-transparent cursor-pointer border-0"
                                />
                                <span className="text-[9px] text-white/70 font-mono truncate">{st.primaryColor || "#581c87"}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-white/50 block mb-0.5">Secondary BG</label>
                              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-[12px] p-1">
                                <input
                                  type="color"
                                  value={st.secondaryColor || "#3b0764"}
                                  onChange={(e) => updateStyle({ secondaryColor: e.target.value })}
                                  className="w-5 h-5 rounded-[12px] bg-transparent cursor-pointer border-0"
                                />
                                <span className="text-[9px] text-white/70 font-mono truncate">{st.secondaryColor || "#3b0764"}</span>
                              </div>
                            </div>
                            <div>
                              <label className="text-[9px] font-bold text-white/50 block mb-0.5">Accent Line</label>
                              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-[12px] p-1">
                                <input
                                  type="color"
                                  value={st.accentColor || "#a855f7"}
                                  onChange={(e) => updateStyle({ accentColor: e.target.value })}
                                  className="w-5 h-5 rounded-[12px] bg-transparent cursor-pointer border-0"
                                />
                                <span className="text-[9px] text-white/70 font-mono truncate">{st.accentColor || "#a855f7"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Opacity Slider */}
                          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                            <span className="text-[10px] text-white/50 w-24 shrink-0 font-semibold">
                              Opacity: <b className="text-white font-mono">{Math.round((st.opacity ?? 0.95) * 100)}%</b>
                            </span>
                            <input
                              type="range"
                              min="30"
                              max="100"
                              value={Math.round((st.opacity ?? 0.95) * 100)}
                              onChange={(e) => updateStyle({ opacity: parseInt(e.target.value, 10) / 100 })}
                              className="flex-1 accent-purple-500 h-1 bg-white/20 rounded-[12px] cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Content & Typography */}
                        <div className="p-2.5 rounded-[12px] bg-white/[0.02] border border-white/10 flex flex-col gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">
                            Presenter & Content
                          </span>
                          <div>
                            <label className="text-[9px] font-bold text-white/50 block mb-0.5">Presenter Name</label>
                            <input
                              type="text"
                              value={lt.title || ""}
                              onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...lt, title: e.target.value } })}
                              placeholder="e.g. Pastor John Doe"
                              className="w-full px-2 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-white/50 block mb-0.5">Role / Subtitle</label>
                            <input
                              type="text"
                              value={lt.subtitle || ""}
                              onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...lt, subtitle: e.target.value } })}
                              placeholder="e.g. Senior Pastor"
                              className="w-full px-2 py-1.5 rounded-[12px] bg-black/40 border border-white/15 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500"
                            />
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-white/50">Font Size:</span>
                              {["small", "medium", "large"].map((sz) => (
                                <button
                                  key={sz}
                                  onClick={() => updateStyle({ fontSize: sz })}
                                  className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold capitalize border transition-all ${
                                    (st.fontSize || "medium") === sz
                                      ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                      : "bg-white/[0.02] border-white/5 text-white/40"
                                  }`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                            <button
                              onClick={() => updateStyle({ uppercaseTitle: !st.uppercaseTitle })}
                              className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold border transition-all ${
                                st.uppercaseTitle
                                  ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                  : "bg-white/5 border-white/10 text-white/40"
                              }`}
                            >
                              ALL CAPS
                            </button>
                          </div>
                        </div>

                        {/* Size & Position Adjuster */}
                        <div className="p-2.5 rounded-[12px] bg-white/[0.02] border border-white/10 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">
                              Size & Placement
                            </span>
                            <span className="text-[10px] font-mono text-purple-300 font-bold">
                              {lt.width || 36}% width
                            </span>
                          </div>

                          {/* Width Slider */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-white/50 w-16 shrink-0 font-semibold">Width:</span>
                            <input
                              type="range"
                              min="20"
                              max="75"
                              value={lt.width || 36}
                              onChange={(e) => handleUpdateBroadcastConfig({ lowerThird: { ...lt, width: parseInt(e.target.value, 10) } })}
                              className="flex-1 accent-purple-500 h-1 bg-white/20 rounded-[12px] cursor-pointer"
                            />
                            <span className="text-[10px] font-mono text-white/70 w-8 text-right">{lt.width || 36}%</span>
                          </div>

                          {/* Quick Position Snaps */}
                          <div className="grid grid-cols-3 gap-1 pt-1">
                            {[
                              { label: "Bottom Left", x: 22, y: 88 },
                              { label: "Bottom Center", x: 50, y: 88 },
                              { label: "Bottom Right", x: 78, y: 88 },
                            ].map((pos) => {
                              const isCur = Math.abs((lt.x ?? 22) - pos.x) < 2 && Math.abs((lt.y ?? 88) - pos.y) < 2;
                              return (
                                <button
                                  key={pos.label}
                                  onClick={() => handleUpdateBroadcastConfig({ lowerThird: { ...lt, x: pos.x, y: pos.y } })}
                                  className={`py-1 rounded-[12px] text-[9px] font-bold border transition-all text-center ${
                                    isCur
                                      ? "bg-purple-600/30 border-purple-500/60 text-purple-200"
                                      : "bg-white/[0.02] border-white/5 text-white/40 hover:text-white"
                                  }`}
                                >
                                  {pos.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── TAB 2: CHURCH MEDIA LIBRARY ASSETS ────────────────────── */}
                  {studioModalTab === "media" && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between pb-1">
                        <div>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                            Church Media Library
                          </span>
                          <p className="text-[10px] text-white/40">Click any image to add as an overlay layer</p>
                        </div>
                        <button
                          onClick={handleImportMediaForStudio}
                          className="text-[10px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 px-2.5 py-1 rounded-[12px] bg-sky-500/10 border border-sky-500/20 transition-all"
                        >
                          <PiPlus size={11} /> Import Image
                        </button>
                      </div>

                      {isLoadingStudioMedia ? (
                        <div className="p-8 text-center text-xs text-white/40">
                          <PiArrowsClockwise size={24} className="animate-spin mx-auto mb-2 text-white/20" />
                          <span>Loading church media assets…</span>
                        </div>
                      ) : studioMediaFiles.length === 0 ? (
                        <div className="p-6 rounded-[12px] bg-white/[0.02] border border-white/10 text-center flex flex-col items-center gap-2">
                          <PiImage size={32} className="text-white/20" />
                          <p className="text-xs font-bold text-white/70">No media images found</p>
                          <p className="text-[10px] text-white/40 max-w-xs">
                            Import event logos, speaker headshots, sponsor logos, or background graphics into the church library.
                          </p>
                          <button
                            onClick={handleImportMediaForStudio}
                            className="mt-1 px-3 py-1.5 rounded-[12px] bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all shadow-md"
                          >
                            + Import First Image
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 max-h-[420px] overflow-y-auto pr-0.5">
                          {studioMediaFiles.map((fileUrl, i) => {
                            const name = fileUrl.split("/").pop()?.split("\\").pop() || `Image ${i + 1}`;
                            return (
                              <div
                                key={fileUrl}
                                onClick={() => handleAddImageLayer(fileUrl, name)}
                                className="group relative rounded-[12px] bg-black/40 border border-white/10 hover:border-purple-500/50 overflow-hidden cursor-pointer flex flex-col transition-all p-1.5 hover:shadow-lg"
                              >
                                <div className="aspect-video w-full rounded-[12px] overflow-hidden bg-white/5 flex items-center justify-center relative">
                                  <img src={fileUrl} alt={name} className="w-full h-full object-contain" />
                                  <div className="absolute inset-0 bg-purple-600/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-opacity rounded-[12px]">
                                    + Add Layer
                                  </div>
                                </div>
                                <span className="text-[10px] font-medium text-white/70 truncate mt-1 px-1">
                                  {name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── TAB 4: FRAMING & CANVAS SCALING ──────────────────────── */}
                  {studioModalTab === "scale" && (
                    <div className="flex flex-col gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                          Canvas Scaling & Insets
                        </span>
                        <p className="text-[10px] text-white/40 mt-0.5">
                          Scale down live camera feed to create margins for large graphics
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { scale: 1.0, label: "100% Full Screen" },
                          { scale: 0.95, label: "95% Safe Inset" },
                          { scale: 0.9, label: "90% Frame Margin" },
                          { scale: 0.85, label: "85% Studio Box" },
                          { scale: 0.8, label: "80% PIP Window" },
                          { scale: 0.75, label: "75% Inset" },
                        ].map(({ scale, label }) => {
                          const isCur = Math.abs((cfg.scale || 1.0) - scale) < 0.02;
                          return (
                            <button
                              key={scale}
                              onClick={() => handleUpdateBroadcastConfig({ scale })}
                              className={`p-2.5 rounded-[12px] border text-xs font-bold transition-all text-center ${
                                isCur
                                  ? "bg-purple-600/25 border-purple-500/60 text-purple-200"
                                  : "bg-white/[0.03] border-white/10 text-white/60 hover:text-white"
                              }`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                          Fit Mode
                        </span>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {[
                            { mode: "cover", label: "Cover (Fill Screen)" },
                            { mode: "contain", label: "Contain (Safe Frame)" },
                          ].map(({ mode, label }) => {
                            const isCur = (cfg.fitMode || "cover") === mode;
                            return (
                              <button
                                key={mode}
                                onClick={() => handleUpdateBroadcastConfig({ fitMode: mode })}
                                className={`p-2 rounded-[12px] border text-xs font-bold transition-all ${
                                  isCur
                                    ? "bg-purple-600/25 border-purple-500/60 text-purple-200"
                                    : "bg-white/[0.03] border-white/10 text-white/60 hover:text-white"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Native Broadcast & Recording Studio Modal (P0-01 & P0-05) — Stage 8 Simulstream ───────────── */}
      {showBroadcastModal && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
          <div className="bg-[#12141a] border border-white/10 rounded-[12px] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-[12px] border flex items-center justify-center ${
                  isAnyStreaming ? "bg-rose-500 text-white border-rose-400 animate-pulse" : "bg-purple-600/20 text-purple-300 border-purple-500/30"
                }`}>
                  <PiBroadcast size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Simulstream Broadcast Studio
                    {isAnyStreaming && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-[12px] bg-rose-500 text-white uppercase tracking-wider animate-pulse">
                        ● ON AIR
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-white/40">FFmpeg Hardware-Accelerated RTMP/SRT · Up to 2 simultaneous destinations</p>
                </div>
              </div>
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="w-8 h-8 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <PiX size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[75vh]">

              {/* ── Destination Cards ── */}
              <div className="flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Stream Destinations</span>
                {destinations.map((dest, idx) => {
                  const status = multiStreamStatus[dest.id] || {};
                  const isLive = status.isStreaming;
                  const health = status.health || 'offline';
                  return (
                    <div key={dest.id} className={`flex flex-col gap-3 p-4 rounded-[12px] border transition-all ${
                      status.state === 'live'
                        ? 'border-rose-500/50 bg-rose-950/10'
                        : (status.state === 'transmitting' || status.state === 'encoding')
                        ? 'border-sky-500/50 bg-sky-950/10'
                        : status.state === 'failed'
                        ? 'border-red-500/40 bg-red-950/10'
                        : dest.enabled
                        ? 'border-purple-500/30 bg-purple-950/5'
                        : 'border-white/10 bg-white/[0.02]'
                    }`}>
                      {/* Destination header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                            {idx === 0 ? 'Primary' : 'Secondary'} Destination
                          </span>
                          {status.state === 'live' && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-[12px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping inline-block" />
                              LIVE
                            </span>
                          )}
                          {(status.state === 'transmitting' || status.state === 'encoding') && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-[12px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" />
                              TRANSMITTING
                            </span>
                          )}
                          {(status.state === 'connecting' || status.state === 'starting' || (!status.state && health === 'connecting')) && (
                            <span className="text-[9px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-[12px] uppercase">Connecting…</span>
                          )}
                          {status.state === 'reconnecting' && (
                            <span className="text-[9px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-[12px] uppercase animate-pulse">Reconnecting…</span>
                          )}
                          {status.state === 'failed' && (
                            <span className="text-[9px] font-black text-rose-400 bg-rose-950/40 border border-rose-500/40 px-2 py-0.5 rounded-[12px] uppercase">Connection Failed</span>
                          )}
                        </div>
                        {/* Enable toggle */}
                        <button
                          disabled={isAnyStreaming}
                          onClick={() => updateDestination(dest.id, { enabled: !dest.enabled })}
                          className={`px-3 py-1 rounded-[12px] text-[10px] font-bold border transition-all ${
                            dest.enabled
                              ? 'bg-purple-600/25 border-purple-500/50 text-purple-200'
                              : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                          } disabled:opacity-40`}
                        >
                          {dest.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </div>

                      {/* Platform presets */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {PLATFORM_PRESETS.map(p => {
                          const isSel = p.url && dest.url.startsWith(p.url);
                          return (
                            <button
                              key={p.label}
                              disabled={isAnyStreaming}
                              onClick={() => updateDestination(dest.id, { label: p.label, url: p.url })}
                              className={`p-2 rounded-[12px] border text-[10px] font-bold transition-all text-center ${
                                isSel
                                  ? 'bg-purple-600/30 border-purple-500 text-white'
                                  : 'bg-white/[0.02] border-white/10 text-white/50 hover:text-white hover:bg-white/[0.05]'
                              } disabled:opacity-40`}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>

                      {/* URL + Key row */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-white/50">RTMP / SRT URL</label>
                          <input
                            type="text"
                            value={dest.url}
                            disabled={isAnyStreaming}
                            onChange={e => updateDestination(dest.id, { url: e.target.value })}
                            placeholder="rtmp://a.rtmp.youtube.com/live2"
                            className="px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-[12px] text-[11px] text-white placeholder-white/20 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-white/50">Stream Key</label>
                          <div className="relative">
                            <input
                              type={dest.showKey ? 'text' : 'password'}
                              value={dest.key}
                              disabled={isAnyStreaming}
                              onChange={e => updateDestination(dest.id, { key: e.target.value })}
                              placeholder="Paste stream key…"
                              className="w-full px-2.5 py-1.5 pr-8 bg-black/40 border border-white/10 rounded-[12px] text-[11px] text-white placeholder-white/20 focus:outline-none focus:border-purple-500 disabled:opacity-50"
                            />
                            <button
                              type="button"
                              onClick={() => updateDestination(dest.id, { showKey: !dest.showKey })}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                            >
                              {dest.showKey ? <PiEyeSlash size={13} /> : <PiEye size={13} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Live telemetry for this destination */}
                      {(status.isStreaming || status.state === 'transmitting' || status.state === 'live') && (
                        <div className="grid grid-cols-4 gap-1.5 pt-1 text-center border-t border-white/5 mt-1">
                          {[
                            { label: 'Uptime', val: `${status.uptimeSec || 0}s` },
                            { label: 'FPS', val: status.fps != null ? status.fps : '—' },
                            { label: 'Bitrate', val: status.bitrateKbps != null ? `${status.bitrateKbps.toFixed(0)}k` : '—' },
                            { label: 'Drops', val: status.droppedFrames || 0 },
                          ].map(m => (
                            <div key={m.label} className="p-1.5 rounded-[12px] bg-black/40 border border-white/5">
                              <span className="text-[9px] text-white/40 block">{m.label}</span>
                              <span className="text-[11px] font-bold text-white">{m.val}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* ── Encoding Quality ── */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-[12px] bg-white/[0.02] border border-white/10">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Output Resolution</span>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: '720p', w: 1280, h: 720 },
                      { label: '1080p', w: 1920, h: 1080 },
                    ].map(r => (
                      <button
                        key={r.label}
                        disabled={isAnyStreaming}
                        onClick={() => { setStreamWidth(r.w); setStreamHeight(r.h); }}
                        className={`p-2 rounded-[12px] border text-xs font-bold transition-all ${
                          streamWidth === r.w
                            ? 'bg-purple-600/30 border-purple-500 text-white'
                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white'
                        } disabled:opacity-40`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">A/V Lip-Sync Delay</span>
                    <span className="text-xs font-bold text-purple-300">{audioDelayMs} ms</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={audioDelayMs}
                    onChange={handleAudioDelayChange}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-white/30">Compensates HDMI capture card latency</p>
                </div>
              </div>

              {/* ── Local Program MP4 Recorder (P0-05) ── */}
              <div className="flex items-center justify-between p-4 rounded-[12px] bg-black/40 border border-white/10">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-[12px] border flex items-center justify-center ${
                    isRecordingProgram ? "bg-red-600 text-white border-red-500 animate-pulse" : "bg-white/5 border-white/10 text-white/40"
                  }`}>
                    <PiCircle size={14} className={isRecordingProgram ? "fill-white" : ""} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">Program MP4 Recorder</span>
                    <span className="text-[10px] text-white/40 block">
                      {isRecordingProgram
                        ? `Recording: ${recorderStats.elapsedSec}s · ${recorderStats.framesRecorded} frames · Crash-Resilient`
                        : "Record composite program output to crash-resilient fragmented MP4"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={toggleRecording}
                  className={`px-3 py-1.5 rounded-[12px] text-xs font-bold border transition-all ${
                    isRecordingProgram
                      ? "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                      : "bg-white/10 border-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {isRecordingProgram ? "Stop Recording" : "Record Local MP4"}
                </button>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 rounded-[12px] bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                Close
              </button>
              <div className="flex items-center gap-2">
                {isAnyStreaming && (
                  <span className="text-[10px] text-white/40 font-mono">
                    {Object.values(multiStreamStatus).filter(s => s?.isStreaming).length} destination(s) live ·{' '}
                    {Object.values(multiStreamStatus).reduce((sum, s) => sum + (s?.bitrateKbps || 0), 0).toFixed(0)} kbps total
                  </span>
                )}
                <button
                  onClick={toggleSimulstream}
                  disabled={!isAnyStreaming && !destinations.some(d => d.enabled && (d.url || d.key))}
                  className={`px-6 py-2.5 rounded-[12px] text-xs font-bold border flex items-center gap-2 transition-all shadow-lg disabled:opacity-40 ${
                    isAnyStreaming
                      ? "bg-red-600 border-red-500 text-white hover:bg-red-500 shadow-red-950/40"
                      : "bg-purple-600 border-purple-500 text-white hover:bg-purple-500 shadow-purple-950/40"
                  }`}
                >
                  <PiRadio size={16} />
                  {isAnyStreaming ? "Stop All Streams" : "Start Simulstream"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


