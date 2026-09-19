import ActionButton, { reportActionError } from "../components/feedback/ActionButton";
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
import LiveDesignStudioModal from "./LiveDesignStudioModal";
import LiveStudioControlsRack from "./LiveStudioControlsRack";
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
    enabled: false,
    autoTrigger: false,
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
  activeStudioControls: [],
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
      // Fresh config or load should never start with bible scripture pinned on screen
      isShowing: Boolean(cfg.bibleLowerThird?.isShowing),
    },
    ticker: {
      ...DEFAULT_BROADCAST_CONFIG.ticker,
      ...(cfg.ticker && typeof cfg.ticker === "object" ? cfg.ticker : {}),
    },
    layers: Array.isArray(cfg.layers) ? cfg.layers : DEFAULT_BROADCAST_CONFIG.layers,
    activeStudioControls: Array.isArray(cfg.activeStudioControls) ? cfg.activeStudioControls : DEFAULT_BROADCAST_CONFIG.activeStudioControls,
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

  // ── Native RTMP / SRT Broadcast Engine (P0-01) & Recording (P0-05) ────────
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  // Multi-destination simulstreaming state (Stage 9.3)
  const PLATFORM_PRESETS = [
    { label: 'YouTube Live',    url: 'rtmp://a.rtmp.youtube.com/live2' },
    { label: 'Facebook Live',   url: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    { label: 'Twitch',          url: 'rtmp://live.twitch.tv/app/' },
    { label: 'TikTok Live',     url: 'rtmp://live-push.tiktok.com/live/' },
    { label: 'Instagram Live',  url: 'rtmps://live-upload.instagram.com:443/rtmp/' },
    { label: 'Mixlr (Audio)',   url: 'rtmp://live.mixlr.com/live/' },
    { label: 'Restream.io',     url: 'rtmp://live.restream.io/live' },
    { label: 'Custom RTMP/SRT', url: '' },
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
  const [activeRecordingPath, setActiveRecordingPath] = useState(null);
  const [recorderStats, setRecorderStats] = useState({ elapsedSec: 0, framesRecorded: 0, outputPath: null, state: 'IDLE' });
  const [audioDelayMs, setAudioDelayMs] = useState(0);
  const [streamBitrate, setStreamBitrate] = useState(4500);
  const [streamWidth, setStreamWidth] = useState(1280);
  const [streamHeight, setStreamHeight] = useState(720);

  const [isBroadcastSessionActive, setIsBroadcastSessionActive] = useState(false);
  const isBroadcastSessionActiveRef = useRef(false);
  useEffect(() => {
    isBroadcastSessionActiveRef.current = isBroadcastSessionActive;
  }, [isBroadcastSessionActive]);

  // States where FFmpeg is alive or attempting transport and requires video frame feeding
  const ACTIVE_STREAM_STATES = ['starting', 'connecting', 'encoding', 'transmitting', 'live', 'degraded', 'reconnecting'];
  const isAnyDestinationActive = Object.values(multiStreamStatus).some(s =>
    s && (s.isStreaming || ACTIVE_STREAM_STATES.includes((s.state || '').toLowerCase()))
  );

  // Permission to feed the encoder: active while session is starting, connecting, transmitting, or reconnecting
  const isStreamArmed = isBroadcastSessionActive || isAnyDestinationActive;

  // Actual confirmed media transmission: true ONLY when media is confirmed actively transmitting
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

  const addDestination = () => {
    if (destinations.length >= 6) return;
    const newId = `dest_${Date.now()}`;
    const newDest = {
      id: newId,
      label: 'Custom Stream',
      url: '',
      key: '',
      enabled: false,
      bitrate: 4500,
      showKey: false,
    };
    setDestinations(prev => {
      const updated = [...prev, newDest];
      saveDestinations(updated);
      return updated;
    });
  };

  const removeDestination = (id) => {
    if (destinations.length <= 1) return;
    setDestinations(prev => {
      const updated = prev.filter(d => d.id !== id);
      saveDestinations(updated);
      return updated;
    });
  };

  // Poll multi-stream status and recorder status every second
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        if (window.electron?.Broadcast?.getMultiStatus && isBroadcastSessionActiveRef.current) {
          const status = await window.electron.Broadcast.getMultiStatus();
          if (status) setMultiStreamStatus(status);
        }
        if (window.electron?.Recorder?.getStatus) {
          const r = await window.electron.Recorder.getStatus();
          if (r) {
            setIsRecordingProgram(Boolean(r.isRecording));
            if (r.outputPath) setActiveRecordingPath(r.outputPath);
            setRecorderStats({
              elapsedSec: r.elapsedSec || 0,
              framesRecorded: r.framesRecorded || 0,
              outputPath: r.outputPath || null,
              state: r.state || (r.isRecording ? 'RECORDING' : 'IDLE')
            });
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
      if (typeof broadcastAudioBus.resume === "function") {
        await broadcastAudioBus.resume();
      }
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
    if (!isStreamArmed && !isRecordingProgram && audioUnsubRef.current) {
      audioUnsubRef.current();
      audioUnsubRef.current = null;
    }
  };

  // Start simulstream — spawns one FFmpeg process per enabled destination
  const toggleSimulstream = async () => {
    if (isStreamArmed) {
      try {
        setIsBroadcastSessionActive(false);
        await window.electron?.Broadcast?.stopAll();
        setMultiStreamStatus({});
        stopAudioStreamingIfIdle();
      } catch (e) {
        reportActionError(e);
      }
    } else {
      try {
        const enabledDests = destinations.filter(d => d.enabled && (d.url || d.key));
        if (enabledDests.length === 0) return;

        // Human Operator Safeguard: Validate that cloud destinations requiring a stream key have one entered
        const missingKeyDest = enabledDests.find(d => {
          const url = (d.url || '').toLowerCase();
          const isCloudService = url.includes('youtube') || url.includes('facebook') || url.includes('twitch') || url.includes('tiktok') || url.includes('instagram');
          return isCloudService && (!d.key || !d.key.trim());
        });

        if (missingKeyDest) {
          setFeedback({ text: `Please enter a Stream Key for ${missingKeyDest.label || 'destination'} before starting.`, ok: false });
          setShowBroadcastModal(true);
          return;
        }

        saveDestinations(destinations);

        const destConfigs = enabledDests.map(d => {
          const url = (d.url || '').toLowerCase();
          const label = (d.label || '').toLowerCase();
          const isFb = label.includes('facebook') || url.includes('facebook.com') || url.includes('fbcdn.net');
          return {
            id: d.id,
            label: d.label,
            platform: isFb ? 'facebook' : (url.includes('youtube') ? 'youtube' : 'custom'),
            isFacebook: isFb,
            streamUrl: d.key
              ? (d.url.endsWith('/') ? `${d.url}${d.key}` : `${d.url}/${d.key}`)
              : d.url,
            videoBitrateKbps: d.bitrate || streamBitrate,
          };
        });

        setIsBroadcastSessionActive(true);
        const res = await window.electron?.Broadcast?.startMulti(
          destConfigs,
          { width: streamWidth, height: streamHeight, fps: 30 }
        );

        if (!res?.ok) {
          setIsBroadcastSessionActive(false);
          throw new Error(res?.error || "Broadcast could not start.");
        }
        if (res && res.ok) {
          if (window.electron?.Broadcast?.getMultiStatus) {
            const status = await window.electron.Broadcast.getMultiStatus();
            if (status) setMultiStreamStatus(status);
          }
          await ensureAudioStreaming();
        }
      } catch (e) {
        setIsBroadcastSessionActive(false);
        reportActionError(e);
      }
    }
  };

  const toggleRecording = async () => {
    if (isRecordingProgram) {
      try {
        const res = await window.electron?.Recorder?.stop();
        if (!res?.ok) throw new Error(res?.error || res?.reason || "Recording could not be finalized. Check the recording status before retrying.");
        setIsRecordingProgram(false);
        stopAudioStreamingIfIdle();
        if (res?.outputPath) {
          setActiveRecordingPath(res.outputPath);
          setFeedback({ text: `Recording saved: ${res.outputPath}`, ok: true });
        }
      } catch (e) {
        reportActionError(e);
      }
    } else {
      try {
        // Calling start without hardcoded outputPath lets main.js generate deterministic path
        const res = await window.electron?.Recorder?.start({
          width: streamWidth,
          height: streamHeight,
          fps: 30,
          withAudio: true
        });
        if (!res?.ok) throw new Error(res?.error || "Recording could not start.");
        if (res && res.ok) {
          setIsRecordingProgram(true);
          if (res.outputPath) {
            setActiveRecordingPath(res.outputPath);
            setFeedback({ text: `Recording started: ${res.outputPath}`, ok: true });
          }
          await ensureAudioStreaming();
        }
      } catch (e) {
        reportActionError(e);
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
      if (patch.activeStudioControls) next.activeStudioControls = patch.activeStudioControls;
      return next;
    });
    if (window.electron?.Switcher?.updateBroadcastConfig) {
      await window.electron.Switcher.updateBroadcastConfig(patch);
    }
  }, []);

  // ── Presentation-Style Media & Layer Handlers ────────────────────────────────
  // Program On-Air Overlay status
  const isOverlayOnProgram = (Array.isArray(cfg.layers) && cfg.layers.length > 0) ||
    (Array.isArray(cfg.activeStudioControls) && cfg.activeStudioControls.some(c => c && c.status !== "hidden"));

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
              <ActionButton
                type="button"
                onClick={() => setIsStudioModalOpen(true)}
                className="relative w-full aspect-video rounded-[12px] bg-gradient-to-br from-[#161226] via-[#100d1d] to-[#0c0a17] border border-[#8B5CF6]/40 hover:border-[#8B5CF6]/80 p-3 flex flex-col justify-between text-left transition-all group shadow-lg hover:shadow-[#8B5CF6]/40 cursor-pointer overflow-hidden active:scale-[0.99]"
              >
                {/* Background decorative glow */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-[#8B5CF6]/10 rounded-full blur-2xl pointer-events-none group-hover:bg-[#8B5CF6]/20 transition-all" />

                {/* Top bar header */}
                <div className="flex items-center justify-between z-10 w-full">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-[12px] bg-[#8B5CF6]/25 border border-[#8B5CF6]/40 flex items-center justify-center text-[#8B5CF6]">
                      <PiTelevision size={14} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#8B5CF6]">
                      LIVE DESIGN STUDIO
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {(isOverlayOnProgram || cfg.logo.enabled || cfg.lowerThird.enabled || cfg.bibleLowerThird.isShowing || cfg.ticker.enabled || cfg.scale < 1.0) ? (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-[12px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[8px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ON AIR
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
                  <span className="text-white font-black text-sm tracking-wide group-hover:text-[#8B5CF6] transition-colors">
                    Live Design Studio
                  </span>
                  <span className="text-white/50 text-[10px] mt-0.5">
                    Live Studio · Lower Thirds · Image Overlays · Live Output
                  </span>
                </div>

                {/* Bottom button strip */}
                <div className="z-10 w-full pt-1.5 border-t border-white/10 flex items-center justify-between text-[9px]">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-[12px] bg-[#8B5CF6]/20 text-[#8B5CF6] font-bold border border-[#8B5CF6]/30">
                      Air Layers: {cfg.layers?.length || 0}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded-[12px] font-bold border ${isOverlayOnProgram ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300" : "bg-white/5 border-white/10 text-white/40"}`}>
                      Air: {isOverlayOnProgram ? "Active" : "Hidden"}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-[12px] bg-[#8B5CF6] text-white font-bold group-hover:bg-[#8B5CF6] transition-colors">
                    Open Live Studio ↗
                  </span>
                </div>
              </ActionButton>
            </div>
          </div>

          {/* ── Studio Live Controls Rack ────────────────────────────────────────── */}
          <LiveStudioControlsRack
            onOpenStudio={() => setIsStudioModalOpen(true)}
            showFeedback={showFeedback}
          />

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
                  <ActionButton
                    onClick={handleCut}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-red-500/50 bg-red-600/30 hover:bg-red-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(239,68,68,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiLightning size={14} className="text-red-400" />
                    CUT [C]
                  </ActionButton>

                  <ActionButton
                    onClick={handleAuto}
                    disabled={!isDesktopController}
                    className="py-2 px-3 rounded-[12px] border border-emerald-500/50 bg-emerald-600/30 hover:bg-emerald-600/40 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.2)] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    <PiPlay size={14} className="text-emerald-400" />
                    AUTO [Space]
                  </ActionButton>
                </div>

                {/* Effect and Duration Settings */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10">
                  {/* Effects */}
                  <div className="flex items-center gap-1">
                    {["fade", "wipe", "cut"].map((type) => (
                      <ActionButton
                        key={type}
                        onClick={() => updateTransitionSetting({ type })}
                        className={`px-2 py-0.5 rounded-[12px] text-[9px] font-bold uppercase transition-all border ${
                          transitionSetting.type === type
                            ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                            : "bg-white/5 text-white/40 border-white/10 hover:text-white"
                        }`}
                      >
                        {type}
                      </ActionButton>
                    ))}
                  </div>

                  {/* Durations */}
                  {transitionSetting.type !== "cut" && (
                    <div className="flex items-center gap-1">
                      {[250, 500, 750, 1000].map((ms) => (
                        <ActionButton
                          key={ms}
                          onClick={() => updateTransitionSetting({ duration: ms })}
                          className={`px-1.5 py-0.5 rounded-[12px] text-[9px] font-mono font-bold transition-all border ${
                            transitionSetting.duration === ms
                              ? "bg-white/20 text-white border-white/40"
                              : "bg-white/5 text-white/30 border-white/10 hover:text-white"
                          }`}
                        >
                          {ms}ms
                        </ActionButton>
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
              broadcastConfig={cfg}
              isBroadcastActive={isStreamArmed || isRecordingProgram}
              isStreamingActive={isStreamArmed}
              isRecordingActive={isRecordingProgram}
              outputWidth={streamWidth}
              outputHeight={streamHeight}
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
                <ActionButton
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
                </ActionButton>
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
                <ActionButton
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
                </ActionButton>
              </div>
            </div>

            {/* Quick Swap Displays Button */}
            <ActionButton
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
            </ActionButton>
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
              <ActionButton
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
              </ActionButton>

              {/* Share to Speaker Screen Toggle */}
              <ActionButton
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
              </ActionButton>

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
                      {!isStreaming && isStreamArmed && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />
                      )}
                    </span>
                    <span className="text-[10px] text-white/40 block">
                      {isAnyStreaming
                        ? (() => {
                            const statValues = Object.values(multiStreamStatus).filter(s => s?.isStreaming);
                            const activeCount = statValues.length;
                            const hasLive = statValues.some(s => (s?.state || '').toLowerCase() === 'live');
                            const hasDegraded = statValues.some(s => (s?.state || '').toLowerCase() === 'degraded');
                            const hasTransmitting = statValues.some(s => {
                              const st = (s?.state || '').toLowerCase();
                              return st === 'transmitting' || st === 'encoding';
                            });
                            const validFps = statValues.filter(s => typeof s.fps === 'number' && s.fps > 0);
                            const avgFps = validFps.length ? Math.round(validFps.reduce((a, s) => a + s.fps, 0) / validFps.length) : null;
                            const totalKbps = statValues.reduce((a, s) => a + (s.bitrateKbps || 0), 0);
                            const stateLabel = hasDegraded ? 'degraded' : hasLive ? 'live' : hasTransmitting ? 'transmitting' : 'active';
                            return `${activeCount} ${stateLabel} · ${avgFps != null ? avgFps + ' fps' : '— fps'} · ${totalKbps > 0 ? totalKbps.toFixed(0) + ' kbps' : '— kbps'}`;
                          })()
                        : isStreamArmed
                        ? (() => {
                            const activeCount = Object.values(multiStreamStatus).filter(s => s && ACTIVE_STREAM_STATES.includes((s.state || '').toLowerCase())).length || 1;
                            const isReconnecting = Object.values(multiStreamStatus).some(s => (s?.state || '').toLowerCase() === 'reconnecting');
                            return isReconnecting
                              ? `${activeCount} destination(s) reconnecting…`
                              : `${activeCount} destination(s) connecting…`;
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
                  ) : isStreamArmed ? (
                    <span className="text-[9px] font-bold px-2.5 py-1 rounded-[12px] bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase tracking-wider animate-pulse shadow-sm">
                      CONNECTING
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
                <ActionButton
                  onClick={handleGrantControl}
                  disabled={!grantTarget}
                  className="px-3 py-1.5 rounded-[12px] bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 disabled:opacity-40 transition-all"
                >
                  Grant
                </ActionButton>
              </div>
            )}

            {/* Reclaim control */}
            {!isDesktopController && (
              <ActionButton
                onClick={handleReclaimControl}
                className="w-full py-2 px-3 rounded-[12px] bg-red-600/30 hover:bg-red-600/40 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md"
              >
                <PiArrowCounterClockwise size={14} />
                Reclaim Control Immediately
              </ActionButton>
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
              <ActionButton
                onClick={handleCloseAssignModal}
                className="p-1.5 rounded-[12px] text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Close Modal"
              >
                <PiX size={18} />
              </ActionButton>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-2 px-6 pt-4 pb-2 border-b border-white/10 bg-black/20">
              <ActionButton
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
              </ActionButton>

              <ActionButton
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
              </ActionButton>
            </div>

            {/* Modal Content Body */}
            <div className="p-6 max-h-[380px] overflow-y-auto flex flex-col gap-3">
              {activeAssignTab === "camcorder" ? (
                <>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
                      Detected Hardware Devices
                    </span>
                    <ActionButton
                      onClick={refreshLocalDevices}
                      disabled={isScanningDevices}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50 px-2 py-1 rounded-[12px] bg-sky-500/10 border border-sky-500/20 transition-all"
                    >
                      <PiArrowsClockwise size={12} className={isScanningDevices ? "animate-spin" : ""} />
                      <span>{isScanningDevices ? "Scanning..." : "Rescan Devices"}</span>
                    </ActionButton>
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

                          <ActionButton
                            onClick={() => handleAssignCamcorder(selectedAssignSlotIndex, dev.deviceId, dev.label)}
                            className="px-3.5 py-1.5 rounded-[12px] bg-emerald-600/80 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 transition-all shadow-md active:scale-95"
                          >
                            {isCurrentlyAssigned ? `Move to Slot ${selectedAssignSlotIndex}` : "Connect & Assign"}
                          </ActionButton>
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
                    <ActionButton
                      onClick={refreshMobileDevices}
                      disabled={isScanningMobiles}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-400 hover:text-sky-300 disabled:opacity-50 px-2 py-1 rounded-[12px] bg-sky-500/10 border border-sky-500/20 transition-all"
                    >
                      <PiArrowsClockwise size={12} className={isScanningMobiles ? "animate-spin" : ""} />
                      <span>{isScanningMobiles ? "Scanning..." : "Rescan Mobile"}</span>
                    </ActionButton>
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

                            <ActionButton
                              onClick={() => handleAssignMobile(selectedAssignSlotIndex, dev)}
                              className="px-3.5 py-1.5 rounded-[12px] bg-sky-600/80 hover:bg-sky-500 text-white font-bold text-xs shrink-0 transition-all shadow-md active:scale-95"
                            >
                              {isCurrentlyAssigned ? `Move to Slot ${selectedAssignSlotIndex}` : `Assign to Slot ${selectedAssignSlotIndex}`}
                            </ActionButton>
                          </div>
                        );
                      })
                  )}
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-3.5 border-t border-white/10 bg-white/[0.02]">
              <ActionButton
                onClick={handleCloseAssignModal}
                className="px-4 py-2 rounded-[12px] bg-white/10 hover:bg-white/15 text-white/80 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </ActionButton>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Canva-Style Live Design Studio Modal ──── */}
      <LiveDesignStudioModal
        isOpen={isStudioModalOpen}
        onClose={() => setIsStudioModalOpen(false)}
        cameraStreams={cameraStreams}
        effectiveProgramSourceId={effectiveProgramSourceId}
        getSourceName={getSourceName}
        liveBroadcastConfig={cfg}
        onUpdateBroadcastConfig={handleUpdateBroadcastConfig}
        showFeedback={showFeedback}
      />

      {/* ── Native Broadcast & Recording Studio Modal (P0-01 & P0-05) — Stage 8 Simulstream ───────────── */}
      {showBroadcastModal && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
          <div className="bg-[#12141a] border border-white/10 rounded-[12px] w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden text-white animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-[12px] border flex items-center justify-center ${
                  isAnyStreaming ? "bg-rose-500 text-white border-rose-400 animate-pulse" : isStreamArmed ? "bg-amber-500 text-white border-amber-400 animate-pulse" : "bg-[#8B5CF6]/20 text-[#8B5CF6] border-[#8B5CF6]/30"
                }`}>
                  <PiBroadcast size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Simulstream Broadcast Studio
                    {isAnyStreaming ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-[12px] bg-rose-500 text-white uppercase tracking-wider animate-pulse">
                        ● ON AIR
                      </span>
                    ) : isStreamArmed ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-[12px] bg-amber-500/20 border border-amber-500/40 text-amber-300 uppercase tracking-wider animate-pulse">
                        CONNECTING
                      </span>
                    ) : null}
                  </h3>
                  <p className="text-[11px] text-white/40">FFmpeg Hardware-Accelerated RTMP/SRT · Up to 2 simultaneous destinations</p>
                </div>
              </div>
              <ActionButton
                onClick={() => setShowBroadcastModal(false)}
                className="w-8 h-8 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                <PiX size={16} />
              </ActionButton>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[75vh]">

              {/* ── Destination Cards ── */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Stream Destinations</span>
                  <span className="text-[10px] text-white/30 font-mono">{destinations.length}/6 Destinations</span>
                </div>
                {destinations.map((dest, idx) => {
                  const status = multiStreamStatus[dest.id] || {};
                  const isLive = status.isStreaming;
                  const st = (status.state || '').toLowerCase();
                  const health = status.health || 'offline';
                  return (
                    <div key={dest.id} className={`flex flex-col gap-3 p-4 rounded-[12px] border transition-all ${
                      st === 'live'
                        ? 'border-rose-500/50 bg-rose-950/10'
                        : st === 'degraded'
                        ? 'border-amber-500/50 bg-amber-950/15'
                        : (st === 'transmitting' || st === 'encoding')
                        ? 'border-sky-500/50 bg-sky-950/10'
                        : st === 'failed'
                        ? 'border-red-500/40 bg-red-950/10'
                        : dest.enabled
                        ? 'border-[#8B5CF6]/30 bg-[#8B5CF6]/5'
                        : 'border-white/10 bg-white/[0.02]'
                    }`}>
                      {/* Destination header row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">
                            {idx === 0 ? 'Primary Destination' : idx === 1 ? 'Secondary Destination' : `Destination #${idx + 1}`}
                          </span>
                          {st === 'live' && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-[12px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping inline-block" />
                              LIVE
                            </span>
                          )}
                          {st === 'degraded' && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-[12px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                              DEGRADED
                            </span>
                          )}
                          {(st === 'transmitting' || st === 'encoding') && (
                            <span className="flex items-center gap-1 text-[9px] font-black text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-[12px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse inline-block" />
                              TRANSMITTING
                            </span>
                          )}
                          {(st === 'connecting' || st === 'starting' || (!status.state && health === 'connecting')) && (
                            <span className="text-[9px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-[12px] uppercase">Connecting…</span>
                          )}
                          {st === 'reconnecting' && (
                            <span className="text-[9px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-[12px] uppercase animate-pulse">Reconnecting…</span>
                          )}
                          {st === 'failed' && (
                            <span className="text-[9px] font-black text-rose-400 bg-rose-950/40 border border-rose-500/40 px-2 py-0.5 rounded-[12px] uppercase">Connection Failed</span>
                          )}
                        </div>
                        {/* Enable toggle & Delete */}
                        <div className="flex items-center gap-2">
                          {destinations.length > 1 && (
                            <ActionButton
                              disabled={isStreamArmed}
                              onClick={() => removeDestination(dest.id)}
                              className="p-1 rounded-[12px] text-white/30 hover:text-red-400 hover:bg-white/5 transition-all disabled:opacity-30"
                              title="Remove Destination"
                            >
                              <PiTrash size={14} />
                            </ActionButton>
                          )}
                          <ActionButton
                            disabled={isStreamArmed}
                            onClick={() => updateDestination(dest.id, { enabled: !dest.enabled })}
                            className={`px-3 py-1 rounded-[12px] text-[10px] font-bold border transition-all ${
                              dest.enabled
                                ? 'bg-[#8B5CF6]/25 border-[#8B5CF6]/50 text-[#8B5CF6]'
                                : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            } disabled:opacity-40`}
                          >
                            {dest.enabled ? 'Enabled' : 'Disabled'}
                          </ActionButton>
                        </div>
                      </div>

                      {/* Platform presets */}
                      <div className="grid grid-cols-4 gap-1.5">
                        {PLATFORM_PRESETS.map(p => {
                          const isSel = p.url && dest.url.startsWith(p.url);
                          return (
                            <ActionButton
                              key={p.label}
                              disabled={isStreamArmed}
                              onClick={() => updateDestination(dest.id, { label: p.label, url: p.url })}
                              className={`p-2 rounded-[12px] border text-[10px] font-bold transition-all text-center ${
                                isSel
                                  ? 'bg-[#8B5CF6]/30 border-[#8B5CF6]/50 text-white'
                                  : 'bg-white/[0.02] border-white/10 text-white/50 hover:text-white hover:bg-white/[0.05]'
                              } disabled:opacity-40`}
                            >
                              {p.label}
                            </ActionButton>
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
                            disabled={isStreamArmed}
                            onChange={e => updateDestination(dest.id, { url: e.target.value })}
                            placeholder="rtmp://a.rtmp.youtube.com/live2"
                            className="px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-[12px] text-[11px] text-white placeholder-white/20 focus:outline-none focus:border-[#8B5CF6]/50 disabled:opacity-50"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-white/50">Stream Key</label>
                          <div className="relative">
                            <input
                              type={dest.showKey ? 'text' : 'password'}
                              value={dest.key}
                              disabled={isStreamArmed}
                              onChange={e => updateDestination(dest.id, { key: e.target.value })}
                              placeholder="Paste stream key…"
                              className="w-full px-2.5 py-1.5 pr-8 bg-black/40 border border-white/10 rounded-[12px] text-[11px] text-white placeholder-white/20 focus:outline-none focus:border-[#8B5CF6]/50 disabled:opacity-50"
                            />
                            <ActionButton
                              type="button"
                              onClick={() => updateDestination(dest.id, { showKey: !dest.showKey })}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                            >
                              {dest.showKey ? <PiEyeSlash size={13} /> : <PiEye size={13} />}
                            </ActionButton>
                          </div>
                        </div>
                      </div>

                      {/* Live telemetry for this destination */}
                      {(status.isStreaming || st === 'transmitting' || st === 'live' || st === 'degraded') && (
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

                {/* Add Destination Button (Up to 6) */}
                {destinations.length < 6 && (
                  <ActionButton
                    disabled={isStreamArmed}
                    onClick={addDestination}
                    className="flex items-center justify-center gap-1.5 p-2.5 rounded-[12px] border border-dashed border-white/20 hover:border-[#8B5CF6]/50 bg-white/[0.01] hover:bg-[#8B5CF6]/10 text-white/60 hover:text-white text-xs font-bold transition-all disabled:opacity-40"
                  >
                    <PiPlus size={14} />
                    Add Broadcast Destination (Simulstream)
                  </ActionButton>
                )}

                {/* Outbound Bandwidth Network Capacity Audit */}
                {(() => {
                  const enabledDests = destinations.filter(d => d.enabled);
                  const totalMbps = (enabledDests.length * (streamBitrate || 4500)) / 1000;
                  const isHighBandwidth = totalMbps > 12;
                  return (
                    <div className="flex items-center justify-between p-3 rounded-[12px] bg-white/[0.02] border border-white/10 text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="text-white/40">Est. Outbound Bandwidth:</span>
                        <span className="font-bold text-white font-mono">{totalMbps.toFixed(1)} Mbps</span>
                        <span className="text-white/40">({enabledDests.length} target{enabledDests.length === 1 ? '' : 's'})</span>
                      </div>
                      {isHighBandwidth && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-[12px] border border-amber-500/20">
                          <PiWarning size={12} /> High Uplink Required (≥25 Mbps)
                        </span>
                      )}
                    </div>
                  );
                })()}
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
                      <ActionButton
                        key={r.label}
                        disabled={isStreamArmed}
                        onClick={() => { setStreamWidth(r.w); setStreamHeight(r.h); }}
                        className={`p-2 rounded-[12px] border text-xs font-bold transition-all ${
                          streamWidth === r.w
                            ? 'bg-[#8B5CF6]/30 border-[#8B5CF6]/50 text-white'
                            : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white'
                        } disabled:opacity-40`}
                      >
                        {r.label}
                      </ActionButton>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">A/V Lip-Sync Delay</span>
                    <span className="text-xs font-bold text-[#8B5CF6]">{audioDelayMs} ms</span>
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
              <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-black/40 border border-white/10">
                <div className="flex items-center justify-between">
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
                  <div className="flex items-center gap-2">
                    <ActionButton
                      onClick={async () => {
                        try {
                          await window.electron?.Recorder?.showInFolder(activeRecordingPath);
                        } catch (_) {}
                      }}
                      className="px-2.5 py-1.5 rounded-[12px] text-xs font-medium border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-all"
                      title="Open recording destination folder"
                    >
                      Open Folder
                    </ActionButton>
                    <ActionButton
                      onClick={toggleRecording} loadingLabel={isRecordingProgram ? "Saving recording…" : "Starting recording…"}
                      className={`px-3 py-1.5 rounded-[12px] text-xs font-bold border transition-all ${
                        isRecordingProgram
                          ? "bg-red-500/20 border-red-500/50 text-red-300 hover:bg-red-500/30"
                          : "bg-white/10 border-white/10 text-white hover:bg-white/20"
                      }`}
                    >
                      {isRecordingProgram ? "Stop Recording" : "Record Local MP4"}
                    </ActionButton>
                  </div>
                </div>
                {(activeRecordingPath || recorderStats.outputPath) && (
                  <div className="text-[10px] text-white/40 truncate font-mono bg-black/50 px-2 py-1 rounded-[12px] border border-white/5">
                    Path: {activeRecordingPath || recorderStats.outputPath}
                  </div>
                )}
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between gap-3">
              <ActionButton
                onClick={() => setShowBroadcastModal(false)}
                className="px-4 py-2 rounded-[12px] bg-white/5 border border-white/10 text-xs font-bold text-white/60 hover:text-white hover:bg-white/10 transition-all"
              >
                Close
              </ActionButton>
              <div className="flex items-center gap-2">
                {isAnyStreaming && (
                  <span className="text-[10px] text-white/40 font-mono">
                    {Object.values(multiStreamStatus).filter(s => s?.isStreaming).length} destination(s) live ·{' '}
                    {Object.values(multiStreamStatus).reduce((sum, s) => sum + (s?.bitrateKbps || 0), 0).toFixed(0)} kbps total
                  </span>
                )}
                <ActionButton
                  onClick={toggleSimulstream} loadingLabel={isStreamArmed ? "Stopping broadcast…" : "Starting broadcast…"}
                  disabled={!isStreamArmed && !destinations.some(d => d.enabled && (d.url || d.key))}
                  className={`px-6 py-2.5 rounded-[12px] text-xs font-bold border flex items-center gap-2 transition-all shadow-lg disabled:opacity-40 ${
                    isStreamArmed
                      ? "bg-red-600 border-red-500 text-white hover:bg-red-500 shadow-red-950/40"
                      : "bg-[#8B5CF6] border-[#8B5CF6]/50 text-white hover:bg-[#8B5CF6] shadow-[#8B5CF6]/40"
                  }`}
                >
                  <PiRadio size={16} />
                  {isStreamArmed ? "Stop All Streams" : "Start Simulstream"}
                </ActionButton>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}


