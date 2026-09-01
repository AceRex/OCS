import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PiVideoCamera,
  PiDeviceMobile,
  PiPlay,
  PiStop,
  PiArrowsOut,
  PiWarning,
  PiSlidersHorizontal,
  PiPlus,
  PiCheckCircle,
  PiArrowClockwise,
  PiEye,
  PiArrowsDownUp,
  PiSparkle,
  PiArticle,
  PiPencilSimple,
  PiRecord,
  PiCaretLeft,
  PiCaretRight,
} from "react-icons/pi";
import TeleprompterScriptModal from "./TeleprompterScriptModal";
import TeleprompterFullscreenOverlay from "./TeleprompterFullscreenOverlay";
import TeleprompterConsentModal from "./TeleprompterConsentModal";
import { createAudioDownsamplerNode } from "./audioWorkletDownsampler";
const { TeleprompterSegmentedMode } = require("../../main/aligner/teleprompterSegmentedMode");

const { ReferenceAligner } = require("../../main/aligner/referenceAligner");

const STORAGE_SCRIPTS_KEY = "ocs_teleprompter_scripts";
const STORAGE_ACTIVE_SCRIPT_ID_KEY = "ocs_teleprompter_active_script_id";

const DEFAULT_SCRIPTS = [
  {
    id: "script-sample-1",
    title: "Sunday Sermon: Walking by Faith",
    pages: [
      {
        id: "p1",
        label: "Introduction",
        text: "Good morning everyone. Today we are looking at faith and perseverance in times of trial and uncertainty.",
      },
      {
        id: "p2",
        label: "Core Scripture",
        text: "For we walk by faith, not by sight. When the road ahead seems clouded, God's promise remains our guiding light.",
      },
      {
        id: "p3",
        label: "Application & Close",
        text: "Whatever challenges you face this week, know that His grace is sufficient and His love endures forever. Amen.",
      },
    ],
    updatedAt: Date.now(),
  },
];

export default function TeleprompterController() {
  // ─── Script Library State ───
  const [scripts, setScripts] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SCRIPTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Failed to load teleprompter scripts:", e);
    }
    return DEFAULT_SCRIPTS;
  });

  const [activeScriptId, setActiveScriptId] = useState(() => {
    return localStorage.getItem(STORAGE_ACTIVE_SCRIPT_ID_KEY) || DEFAULT_SCRIPTS[0].id;
  });

  const activeScript = scripts.find((s) => s.id === activeScriptId) || scripts[0] || DEFAULT_SCRIPTS[0];

  // ─── Camera Capture State ───
  const [cameraSource, setCameraSource] = useState("laptop"); // "laptop" | "phone"
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoStream, setVideoStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isMirrored, setIsMirrored] = useState(true);
  const [pairedDevices, setPairedDevices] = useState([]);
  const [selectedMobileDeviceId, setSelectedMobileDeviceId] = useState(null);

  // ─── Segmented Mode State (FR-5.48 [NEW]) ───
  const segmentedModeRef = useRef(null); // TeleprompterSegmentedMode instance
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [segmentSuggestPrompt, setSegmentSuggestPrompt] = useState(null);

  // ─── Camera Test Mode & Countdown State (FR-5.44, FR-5.45 [NEW]) ───
  const [isTestMode, setIsTestMode] = useState(false);
  const [countdownValue, setCountdownValue] = useState(null); // null | 5..0
  const countdownTimerRef = useRef(null);

  const [sessionSaveToast, setSessionSaveToast] = useState(null);
  const sessionStartTimeRef = useRef(0);

  // ─── Settings State ───
  const [cameraOpacity, setCameraOpacity] = useState(15); // 1% - 40%, default 15%
  const [fontSize, setFontSize] = useState(36);
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  
  // ─── Scene & Line Animation Preferences ───
  const [sceneBreakStyle, setSceneBreakStyle] = useState(() => {
    return localStorage.getItem("tp_scene_break_style") || "scroll-out";
  }); // "scroll-out" | "fade" | "badge" | "spotlight"

  const [wordTransitionStyle, setWordTransitionStyle] = useState(() => {
    return localStorage.getItem("tp_word_transition_style") || "text-glow";
  }); // "text-glow" | "underline" | "text-pop"

  // ─── Reading & Alignment State ───
  const [activeWordIndex, setActiveWordIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(1); // 0.5 to 2.5
  const alignerRef = useRef(new ReferenceAligner());

  // ─── Modals State ───
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [scriptToEdit, setScriptToEdit] = useState(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState(false);

  // DOM Refs
  const videoPreviewRef = useRef(null);
  const textPreviewContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const processorRef = useRef(null);

  // Save scripts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SCRIPTS_KEY, JSON.stringify(scripts));
    } catch (e) {
      console.warn("Failed to persist teleprompter scripts:", e);
    }
  }, [scripts]);

  // Cleanup segmented mode and countdown on unmount
  useEffect(() => {
    return () => {
      if (segmentedModeRef.current) segmentedModeRef.current.stop();
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_ACTIVE_SCRIPT_ID_KEY, activeScriptId);
    } catch (e) {}
  }, [activeScriptId]);

  useEffect(() => {
    try {
      localStorage.setItem("tp_scene_break_style", sceneBreakStyle);
    } catch (_) {}
  }, [sceneBreakStyle]);

  useEffect(() => {
    try {
      localStorage.setItem("tp_word_transition_style", wordTransitionStyle);
    } catch (_) {}
  }, [wordTransitionStyle]);

  // Sync script tokens to ReferenceAligner
  const scriptFullText = React.useMemo(() => {
    if (!activeScript) return "";
    if (activeScript.pages && activeScript.pages.length > 0) {
      return activeScript.pages.map((p) => p.text || "").join(" ");
    }
    return activeScript.rawText || "";
  }, [activeScript]);

  const scriptTokens = React.useMemo(() => {
    return scriptFullText.split(/\s+/).filter(Boolean);
  }, [scriptFullText]);

  // Structured Scene-by-Scene & Line-by-Line Token Mapping
  const processedSections = React.useMemo(() => {
    if (!activeScript) return [];
    const pages =
      activeScript.pages && activeScript.pages.length > 0
        ? activeScript.pages
        : [{ id: "p1", label: activeScript.title || "Scene 1", text: activeScript.rawText || "" }];

    let currentWordIdx = 0;
    return pages.map((page, pIdx) => {
      const rawLines = (page.text || "").split(/\n+/).filter(Boolean);
      const lines = rawLines.length > 0 ? rawLines : [page.text || ""];

      const parsedLines = lines.map((lineText, lIdx) => {
        const words = lineText.split(/\s+/).filter(Boolean).map((word) => {
          const idx = currentWordIdx++;
          return { word, index: idx };
        });
        return {
          id: `${page.id || `p${pIdx}`}-l${lIdx}`,
          text: lineText,
          words,
          startIdx: words[0]?.index ?? currentWordIdx,
          endIdx: words[words.length - 1]?.index ?? currentWordIdx,
        };
      });

      return {
        ...page,
        sectionIndex: pIdx,
        lines: parsedLines,
        startIdx: parsedLines[0]?.words[0]?.index ?? 0,
        endIdx: currentWordIdx - 1,
      };
    });
  }, [activeScript]);

  useEffect(() => {
    if (alignerRef.current && scriptFullText) {
      alignerRef.current.setReference(activeScript?.id || "script-1", scriptFullText);
      setActiveWordIndex(0);
    }
  }, [scriptFullText, activeScript?.id]);

  // Sync Segmented Mode (FR-5.48 [NEW])
  useEffect(() => {
    const scrollMode = activeScript?.scrollMode || "continuous";
    if (scrollMode === "segmented") {
      if (!segmentedModeRef.current) {
        const seg = new TeleprompterSegmentedMode();
        seg.on("segment:advance", ({ sectionIndex }) => {
          setCurrentSegmentIndex(sectionIndex);
        });
        seg.on("segment:prev", ({ sectionIndex }) => {
          setCurrentSegmentIndex(sectionIndex);
        });
        seg.on("segment:suggest", (prompt) => {
          setSegmentSuggestPrompt(prompt);
        });
        seg.on("segment:suggest:clear", () => {
          setSegmentSuggestPrompt(null);
        });
        seg.on("word:update", (update) => {
          if (typeof update?.wordIndex === "number") {
            setActiveWordIndex(update.wordIndex);
          }
        });
        segmentedModeRef.current = seg;
      }
      segmentedModeRef.current.startScript(activeScript, 0);
      setCurrentSegmentIndex(0);
    } else {
      if (segmentedModeRef.current) {
        segmentedModeRef.current.stop();
        segmentedModeRef.current = null;
      }
      setCurrentSegmentIndex(0);
      setSegmentSuggestPrompt(null);
    }
  }, [activeScript]);

  const handleManualAdvanceSegment = () => {
    if (segmentedModeRef.current) {
      segmentedModeRef.current.manualAdvance();
    } else {
      setCurrentSegmentIndex((prev) => Math.min(prev + 1, (activeScript?.pages?.length || 1) - 1));
    }
  };

  const handleManualPrevSegment = () => {
    if (segmentedModeRef.current) {
      segmentedModeRef.current.manualPrev();
    } else {
      setCurrentSegmentIndex((prev) => Math.max(prev - 1, 0));
    }
  };

  // Check for paired mobile devices via electron IPC / Socket.IO
  const refreshPairedDevices = useCallback(async () => {
    if (window.electron?.Network?.getPairedDevices) {
      try {
        const devices = await window.electron.Network.getPairedDevices();
        setPairedDevices(devices || []);
        if (devices && devices.length > 0 && !selectedMobileDeviceId) {
          setSelectedMobileDeviceId(devices[0].id);
        }
      } catch (e) {
        console.warn("Failed to query paired devices:", e);
      }
    }
  }, [selectedMobileDeviceId]);

  useEffect(() => {
    refreshPairedDevices();
    const interval = setInterval(refreshPairedDevices, 4000);
    return () => clearInterval(interval);
  }, [refreshPairedDevices]);

  // Listen to live ASR transcript events from Electron IPC Asr bridge and BroadcastEngine DOM events
  useEffect(() => {
    const handleRawTranscript = (payload) => {
      const text =
        typeof payload === "string"
          ? payload
          : payload?.text || payload?.partial || payload?.transcript || "";
      if (text && isCapturing) {
        const scrollMode = activeScript?.scrollMode || "continuous";
        if (scrollMode === "segmented" && segmentedModeRef.current) {
          // FR-5.48 [NEW]: Feed into SceneAutoAdvanceManager via adapter
          segmentedModeRef.current.feed(text);
        } else if (alignerRef.current) {
          // FR-5.47 [NEW]: Continuous mode — existing ReferenceAligner path
          const res = alignerRef.current.feed(text);
          if (res && typeof res.activeWordIndex === "number") {
            setActiveWordIndex(res.activeWordIndex);
          } else if (res && typeof res.wordIndex === "number" && res.wordIndex >= 0) {
            setActiveWordIndex(res.wordIndex);
          }
        }
      }
    };

    // 1. Listen via Electron IPC Asr bridge
    let unsubAsr = null;
    const AsrApi = window.electron?.Asr || window.electron?.Vosk;
    if (AsrApi?.onTranscript) {
      unsubAsr = AsrApi.onTranscript(handleRawTranscript);
    }

    // 2. Listen via DOM Custom Events
    const domListener = (e) => {
      handleRawTranscript(e.detail);
    };
    window.addEventListener("ocs:voice-transcript", domListener);
    window.addEventListener("ocs:asr-final", domListener);

    return () => {
      if (typeof unsubAsr === "function") unsubAsr();
      window.removeEventListener("ocs:voice-transcript", domListener);
      window.removeEventListener("ocs:asr-final", domListener);
    };
  }, [isCapturing]);

  // Auto-scroll the text preview pane to active word across all sections
  useEffect(() => {
    const wordEl = document.getElementById(`tp-preview-word-${activeWordIndex}`);
    if (wordEl && textPreviewContainerRef.current) {
      const container = textPreviewContainerRef.current;
      const elRect = wordEl.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      const relativeTop = elRect.top - contRect.top + container.scrollTop;
      const targetTop = relativeTop - container.clientHeight * 0.35;
      container.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }
  }, [activeWordIndex]);

  // Auto-scroll the text preview pane to active segment in segmented mode (FR-5.48 [NEW])
  useEffect(() => {
    if (activeScript?.scrollMode === "segmented") {
      const secEl = document.getElementById(`tp-preview-sec-${currentSegmentIndex}`);
      if (secEl && textPreviewContainerRef.current) {
        const container = textPreviewContainerRef.current;
        const elRect = secEl.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const relativeTop = elRect.top - contRect.top + container.scrollTop;
        container.scrollTo({
          top: Math.max(0, relativeTop - 30),
          behavior: "smooth",
        });
      }
    }
  }, [currentSegmentIndex, activeScript?.scrollMode]);

  // Synchronize video stream to preview video element
  useEffect(() => {
    if (videoPreviewRef.current) {
      if (videoStream && isCapturing) {
        videoPreviewRef.current.srcObject = videoStream;
        videoPreviewRef.current.play().catch((err) => {
          console.warn("[Teleprompter] Video play notice:", err.message);
        });
      } else {
        videoPreviewRef.current.srcObject = null;
      }
    }
  }, [videoStream, isCapturing]);

  // Audio Ingest & ASR Pipeline for Teleprompter (AudioWorklet off-main-thread downsampler)
  const startAudioIngest = async (mediaStream) => {
    try {
      const AsrApi = window.electron?.Asr || window.electron?.Vosk;
      if (AsrApi?.start) {
        await AsrApi.init().catch(() => {});
        await AsrApi.start().catch(() => {});
      }

      if (!mediaStream || mediaStream.getAudioTracks().length === 0) return;

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }
      const source = audioCtx.createMediaStreamSource(mediaStream);
      sourceNodeRef.current = source;

      const sink = audioCtx.createMediaStreamDestination();
      const { node: processor } = await createAudioDownsamplerNode(audioCtx, (uint8) => {
        if (AsrApi?.sendAudio) {
          AsrApi.sendAudio(uint8);
        }
      }, 16000);
      processorRef.current = processor;

      source.connect(processor);
      processor.connect(sink);
    } catch (err) {
      console.warn("[Teleprompter] Audio ingest notice:", err);
    }
  };

  const stopAudioIngest = () => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch (_) {}
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch (_) {}
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch (_) {}
      audioCtxRef.current = null;
    }
  };

  // Helper to reliably acquire webcam stream across various desktop camera drivers
  const acquireDesktopCameraStream = async ({ withAudio = true } = {}) => {
    // Explicitly ask for macOS system camera permission via Electron IPC first
    if (window.electron?.Camera?.requestPermission) {
      try {
        const perm = await window.electron.Camera.requestPermission();
        console.log("[Teleprompter] Electron camera permission request result:", perm);
      } catch (pErr) {
        console.warn("[Teleprompter] Electron camera permission notice:", pErr);
      }
    }

    let videoDevices = [];
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      videoDevices = allDevices.filter((d) => d.kind === "videoinput");
      console.log("[Teleprompter] Detected videoinput devices:", videoDevices.map(d => ({ label: d.label, id: d.deviceId })));
    } catch (_) {}

    // Multi-tier fallback constraint candidates (no facingMode, which breaks desktop webcams)
    const videoCandidates = [
      { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      { width: { ideal: 1920 }, height: { ideal: 1080 } },
      true, // unconstrained fallback
    ];

    let lastError = null;
    for (const vConstraint of videoCandidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: vConstraint,
          audio: withAudio
            ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            : false,
        });
        return stream;
      } catch (err) {
        lastError = err;
        console.warn("[Teleprompter] Video constraint attempt failed:", vConstraint, err.name, err.message);
        if (withAudio) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: vConstraint,
              audio: true,
            });
            return stream;
          } catch (_) {}
        }
      }
    }

    if (withAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        console.warn("[Teleprompter] Acquired video-only stream (audio device unavailable or busy)");
        return stream;
      } catch (_) {}
    }

    throw lastError || new Error("No camera device accessible on this system");
  };

  const handleRequestCameraPermission = async () => {
    try {
      setCameraError(null);
      if (window.electron?.Camera?.requestPermission) {
        const res = await window.electron.Camera.requestPermission();
        console.log("[Teleprompter] Manual permission response:", res);
      }
      // Re-trigger test camera to check if stream is now accessible
      await handleTestCamera();
    } catch (err) {
      console.error("[Teleprompter] Manual permission request error:", err);
      setCameraError("Camera permission request failed: " + (err.message || String(err)));
    }
  };

  const handleOpenCameraSettings = async () => {
    try {
      if (window.electron?.Camera?.openSettings) {
        await window.electron.Camera.openSettings();
      } else if (window.electron?.openExternal) {
        await window.electron.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Camera");
      }
    } catch (err) {
      console.warn("[Teleprompter] Failed to open System Settings:", err);
    }
  };

  const formatCameraErrorMessage = (err) => {
    let errorMsg = err?.message || String(err);
    if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
      errorMsg = "Camera access denied. Please enable Camera permissions in macOS System Settings > Privacy & Security > Camera.";
    } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError" || errorMsg.includes("Requested device not found")) {
      errorMsg = "No webcam detected. If using a MacBook or external camera, please ensure Camera permission is granted in macOS System Settings > Privacy & Security > Camera.";
    } else if (err?.name === "NotReadableError" || err?.name === "TrackStartError") {
      errorMsg = "Camera is currently locked by another application (e.g. Zoom, Teams, FaceTime). Please close other camera apps and retry.";
    }
    return errorMsg;
  };

  // Desktop Webcam & Microphone Capture
  const startDesktopCamera = async () => {
    try {
      setCameraError(null);
      sessionStartTimeRef.current = Date.now();
      const stream = await acquireDesktopCameraStream({ withAudio: true });

      setVideoStream(stream);
      setIsCapturing(true);

      // Start audio ingestion to ASR engine for real-time word tracking
      startAudioIngest(stream);

      // Start video + audio session recording
      startRecording(stream);
    } catch (err) {
      console.error("[Teleprompter] Camera capture error:", err);
      setCameraError(formatCameraErrorMessage(err));
      setIsCapturing(false);
    }
  };

  // Mobile WebRTC Camera Streaming
  const startMobileCamera = async () => {
    if (!pairedDevices || pairedDevices.length === 0) {
      setCameraError("No mobile phone is currently paired. Pair a device in the 'Remote' tab first.");
      return;
    }

    try {
      setCameraError(null);
      const targetDevice = pairedDevices.find((d) => d.id === selectedMobileDeviceId) || pairedDevices[0];

      // Setup WebRTC PeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          const stream = event.streams[0];
          setVideoStream(stream);
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
            videoPreviewRef.current.play().catch(() => {});
          }
          setIsCapturing(true);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && window.electron?.Network?.sendSocketMessage) {
          window.electron.Network.sendSocketMessage("teleprompter:camera-ice-candidate", {
            targetId: targetDevice.id,
            candidate: event.candidate,
          });
        }
      };

      // Request camera stream from phone
      if (window.electron?.Network?.sendSocketMessage) {
        window.electron.Network.sendSocketMessage("teleprompter:request-camera", {
          targetId: targetDevice.id,
          scriptTitle: activeScript.title,
        });
      }

      setIsCapturing(true);
    } catch (err) {
      console.error("[Teleprompter] Mobile WebRTC error:", err);
      setCameraError(`Failed to establish WebRTC connection with mobile: ${err.message}`);
      setIsCapturing(false);
    }
  };

  // Stop Camera & Audio Capture and Save Session Recording
  const stopCamera = () => {
    stopAudioIngest();
    stopRecording();
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setIsCapturing(false);
  };

  // Start MediaRecorder session (Video + Audio)
  const startRecording = async (stream) => {
    try {
      const mime = MediaRecorder.isTypeSupported("video/webm; codecs=vp9,opus")
        ? "video/webm; codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm; codecs=vp8,opus")
        ? "video/webm; codecs=vp8,opus"
        : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

      // FR-5.40 [NEW]: 8 Mbps default for sharp 1080p. Configurable via appSettings.
      const videoBitrate = (window.electron?.Settings?.get && await window.electron.Settings.get('teleprompter.videoBitrateBps').catch(() => null)) || 8_000_000;
      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: videoBitrate,
      });
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        // Stop stream tracks only after recording has cleanly finalized
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
        }
        setVideoStream(null);

        const blob = new Blob(chunks, { type: mime });
        console.log("[Teleprompter] Session video recorded, size:", blob.size);
        const duration = Math.max(1000, Date.now() - sessionStartTimeRef.current);

        if (blob.size > 0 && window.electron?.Session?.saveVideoRecording) {
          setSessionSaveToast("Saving raw session...");
          const reader = new FileReader();
          reader.onloadend = async () => {
            try {
              const res = await window.electron.Session.saveVideoRecording({
                title: `Teleprompter - ${activeScript.title}`,
                videoBase64: reader.result,
                mime,
                durationMs: duration,
                transcript: scriptFullText,
                requestPostProcess: true, // FR-5.42 [NEW]: trigger background polish pass
              });
              console.log("[Teleprompter] saveVideoRecording response:", res);
              setSessionSaveToast(`Saved (${(blob.size / 1024 / 1024).toFixed(2)} MB) — polishing in background...`);
              setTimeout(() => setSessionSaveToast(null), 8000);
            } catch (err) {
              console.error("[Teleprompter] saveVideoRecording error:", err);
              setSessionSaveToast(null);
            }
          };
          reader.readAsDataURL(blob);
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecordingActive(true);
    } catch (e) {
      console.warn("Failed to initialize MediaRecorder:", e);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (mr && mr.state !== "inactive") {
      try {
        if (typeof mr.requestData === "function") mr.requestData();
      } catch (_) {}
      try {
        mr.stop();
      } catch (_) {}
    }
    setIsRecordingActive(false);
  };

  // FR-5.44 [NEW]: Camera Test Mode — preview without recording
  const handleTestCamera = async () => {
    if (isCapturing || isTestMode) return;
    try {
      setCameraError(null);
      const stream = await acquireDesktopCameraStream({ withAudio: false });
      setVideoStream(stream);
      setIsTestMode(true);
      setIsCapturing(true); // reuse preview logic — no recording started
    } catch (err) {
      console.error("[Teleprompter] Camera test error:", err);
      setCameraError("Camera test failed: " + formatCameraErrorMessage(err));
    }
  };

  const handleStopTest = () => {
    if (videoStream) videoStream.getTracks().forEach((t) => t.stop());
    setVideoStream(null);
    setIsTestMode(false);
    setIsCapturing(false);
  };

  // FR-5.45 [NEW]: Pre-recording countdown (5 → 0)
  const handleStartCountdown = () => {
    if (isCapturing || countdownValue !== null) return;
    setCountdownValue(5);
    let count = 5;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      setCountdownValue(count);
      if (count <= 0) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        setCountdownValue(null);
        // Emit countdown signal to paired mobile (FR-5.54 [NEW])
        if (window.electron?.Network?.sendSocketMessage) {
          window.electron.Network.sendSocketMessage("teleprompter:countdown", { value: 0, action: "start" });
        }
        // Start actual recording
        if (cameraSource === "laptop") {
          startDesktopCamera();
        } else {
          startMobileCamera();
        }
      } else {
        // Broadcast countdown tick to mobile (FR-5.54 [NEW])
        if (window.electron?.Network?.sendSocketMessage) {
          window.electron.Network.sendSocketMessage("teleprompter:countdown", { value: count });
        }
      }
    }, 1000);
  };

  const handleCancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownValue(null);
    if (window.electron?.Network?.sendSocketMessage) {
      window.electron.Network.sendSocketMessage("teleprompter:countdown", { value: null, action: "cancel" });
    }
  };

  const handleToggleCapture = () => {
    if (isTestMode) {
      handleStopTest();
      return;
    }
    if (isCapturing) {
      stopCamera();
    } else {
      handleStartCountdown();
    }
  };

  const handleConfirmedConsentStart = () => {
    handleStartCountdown();
  };

  const handleSaveScript = (savedScript) => {
    setScripts((prev) => {
      const existing = prev.findIndex((s) => s.id === savedScript.id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = savedScript;
        return next;
      }
      return [savedScript, ...prev];
    });
    setActiveScriptId(savedScript.id);
  };

  const handleDeleteScript = (id, e) => {
    e.stopPropagation();
    if (scripts.length <= 1) return;
    const next = scripts.filter((s) => s.id !== id);
    setScripts(next);
    if (activeScriptId === id) {
      setActiveScriptId(next[0].id);
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 bg-[#0a0a0f] text-white font-outfit overflow-hidden">
      
      {/* ─── 2-Column × 6-Row Grid Layout ─── */}
      <div className="flex-1 grid grid-cols-2 grid-rows-6 gap-4 min-h-0 h-full">
        
        {/* ─── PANE 1: Camera Preview (Col 1, Rows 1–3) ─── */}
        <div className="col-start-1 col-end-2 row-start-1 row-end-4 bg-[#111019]/90 border border-white/10 rounded-2xl p-4 flex flex-col overflow-hidden relative shadow-xl backdrop-blur-md">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isCapturing ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-white/40"
              }`}>
                <PiVideoCamera size={18} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-white tracking-wide flex items-center gap-2">
                  Camera Feed
                  {isCapturing && (
                    <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[9px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Live
                    </span>
                  )}
                  {isRecordingActive && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 border border-red-400/30 text-red-300 text-[9px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Rec
                    </span>
                  )}
                </h3>
                <span className="text-[10px] text-white/40 font-mono">
                  {isCapturing
                    ? cameraSource === "laptop" ? "Desktop Webcam (720p)" : "Paired Mobile Feed"
                    : "Camera standby"}
                </span>
              </div>
            </div>

            {/* Quick Actions (Mirror + Test Camera) */}
            <div className="flex items-center gap-1.5">
              {/* FR-5.44 [NEW]: Test Camera — clearly distinct from recording */}
              {!isCapturing && !isTestMode && countdownValue === null && (
                <button
                  id="tp-test-camera-btn"
                  onClick={handleTestCamera}
                  className="px-2.5 py-1 rounded-xl text-[10px] font-bold border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 transition-all flex items-center gap-1"
                  title="Preview camera without recording"
                >
                  <PiEye size={12} />
                  <span>Test Camera</span>
                </button>
              )}
              {isTestMode && (
                <button
                  id="tp-stop-test-btn"
                  onClick={handleStopTest}
                  className="px-2.5 py-1 rounded-xl text-[10px] font-bold border border-amber-500/50 bg-amber-500/20 text-amber-200 transition-all flex items-center gap-1 animate-pulse"
                >
                  <PiEye size={12} />
                  <span>Stop Test</span>
                </button>
              )}
              {isCapturing && !isTestMode && (
                <button
                  onClick={() => setIsMirrored((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border transition-all ${
                    isMirrored
                      ? "bg-purple-600/30 border-purple-500/50 text-purple-200"
                      : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                  }`}
                  title="Mirror video horizontally"
                >
                  <PiArrowClockwise size={12} className="inline mr-1" />
                  Mirror
                </button>
              )}
            </div>
          </div>

          {/* Video Container */}
          <div className="flex-1 flex items-center justify-center bg-black/60 rounded-xl overflow-hidden mt-3 relative border border-white/5">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              style={{
                // FR-5.41 [NEW]: Raw camera feed — no CSS filter applied
                transform: isMirrored ? "scaleX(-1) translateZ(0)" : "translateZ(0)",
                willChange: "transform",
                backfaceVisibility: "hidden",
              }}
              className={`w-full h-full object-cover transition-transform duration-200 ${
                isCapturing ? "block" : "hidden"
              }`}
            />
            {/* FR-5.44 [NEW]: Test mode banner — unambiguously NOT recording */}
            {isTestMode && isCapturing && (
              <div className="absolute top-2 left-2 right-2 bg-amber-500/90 text-black text-[10px] font-black uppercase tracking-widest text-center py-1.5 rounded-lg shadow-lg z-10">
                📷 CAMERA TEST — NOT RECORDING
              </div>
            )}
            {!isCapturing && (
              <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
                  <PiVideoCamera size={26} />
                </div>
                <span className="text-xs font-semibold text-white/50">
                  Camera feed is stopped
                </span>
                <span className="text-[10px] text-white/30 max-w-xs">
                  Select a camera source below and click "Start Capture" to view live video
                </span>
              </div>
            )}

            {/* Error Banner with Interactive Permission Actions */}
            {cameraError && (
              <div className="absolute inset-x-3 bottom-3 bg-red-950/90 border border-red-500/50 text-red-200 p-3 rounded-xl text-xs flex flex-col gap-2 backdrop-blur-md shadow-xl z-10">
                <div className="flex items-start gap-2">
                  <PiWarning size={16} className="shrink-0 mt-0.5 text-red-400" />
                  <span className="flex-1 text-[11px] leading-relaxed">{cameraError}</span>
                </div>
                <div className="flex items-center gap-2 pl-6 pt-1 border-t border-red-500/20">
                  <button
                    onClick={handleRequestCameraPermission}
                    className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-100 text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95"
                  >
                    <span>Ask for Permission</span>
                  </button>
                  <button
                    onClick={handleOpenCameraSettings}
                    className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white/90 text-[10px] font-bold transition-all flex items-center gap-1 active:scale-95"
                  >
                    <span>Open macOS Camera Settings ↗</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── PANE 2: Settings & Controls (Col 1, Rows 4–6) ─── */}
        <div className="col-start-1 col-end-2 row-start-4 row-end-7 bg-[#111019]/90 border border-white/10 rounded-2xl p-4 flex flex-col overflow-y-auto no-scrollbar shadow-xl backdrop-blur-md gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <PiSlidersHorizontal size={14} className="text-purple-400" />
              Teleprompter Controls
            </h3>
          </div>

          {/* Primary Action Buttons (FR-5.44, FR-5.45 [NEW]) */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              id="tp-start-stop-btn"
              onClick={handleToggleCapture}
              disabled={countdownValue !== null && !isCapturing && !isTestMode}
              className={`py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 ${
                isTestMode
                  ? "bg-amber-600/90 hover:bg-amber-600 text-white shadow-amber-600/20"
                  : isCapturing
                  ? "bg-red-600/90 hover:bg-red-600 text-white shadow-red-600/20"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
              }`}
            >
              {isCapturing || isTestMode ? <PiStop size={16} /> : <PiPlay size={16} />}
              <span>
                {isTestMode ? "Stop Test" : isCapturing ? "Stop Recording" : countdownValue !== null ? `Starting in ${countdownValue}...` : "Start Recording"}
              </span>
            </button>

            <button
              onClick={() => setIsFullscreenOpen(true)}
              className="py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition-all active:scale-98"
            >
              <PiArrowsOut size={16} />
              <span>Go Fullscreen</span>
            </button>
          </div>

          {/* Camera Source Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Camera Source
            </label>
            <div className="grid grid-cols-2 gap-2 bg-[#181624] p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setCameraSource("laptop")}
                disabled={isCapturing}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  cameraSource === "laptop"
                    ? "bg-white/15 text-white shadow-sm"
                    : "text-white/40 hover:text-white"
                } ${isCapturing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <PiVideoCamera size={14} /> Laptop Camera
              </button>

              <button
                onClick={() => setCameraSource("phone")}
                disabled={isCapturing || pairedDevices.length === 0}
                title={pairedDevices.length === 0 ? "No phone paired. Pair a mobile device in Remote tab first." : ""}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all relative ${
                  cameraSource === "phone"
                    ? "bg-purple-600 text-white shadow-sm"
                    : pairedDevices.length > 0
                    ? "text-white/40 hover:text-white"
                    : "text-white/20 cursor-not-allowed opacity-40"
                } ${isCapturing ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <PiDeviceMobile size={14} /> Phone Camera
                {pairedDevices.length === 0 && (
                  <span className="text-[8px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded ml-1">
                    Unpaired
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Background Opacity Slider (1% - 40%, default 15%) */}
          <div className="flex flex-col gap-1.5 bg-[#181624]/60 p-3 rounded-xl border border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                <PiEye size={13} className="text-cyan-400" />
                Camera Background Opacity
              </span>
              <span className="font-mono font-bold text-cyan-300 text-xs">
                {cameraOpacity}%
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="40"
              value={cameraOpacity}
              onChange={(e) => setCameraOpacity(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-400 cursor-pointer mt-1"
            />
            <span className="text-[9px] text-white/30">
              Blends camera feed behind text in fullscreen reading mode (Recommended: 15%)
            </span>
          </div>

          {/* Scene Break & Line Animation Customization Controls */}
          <div className="flex flex-col gap-2.5 bg-[#181624]/60 p-3 rounded-xl border border-white/5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <PiSparkle size={13} />
              Scene Break & Line Animation
            </span>

            {/* Scene Break Style Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-white/50 uppercase">Scene Break Style</label>
              <div className="grid grid-cols-4 gap-1 bg-[#100e1a] p-1 rounded-lg border border-white/5 text-[10px] font-bold">
                {[
                  { id: "scroll-out", label: "Scroll Out" },
                  { id: "fade", label: "Fade" },
                  { id: "spotlight", label: "Spotlight" },
                  { id: "badge", label: "Divider" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSceneBreakStyle(opt.id)}
                    className={`py-1 rounded-md transition-all text-center ${
                      sceneBreakStyle === opt.id
                        ? "bg-purple-600 text-white shadow-sm"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Word Animation Style Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-white/50 uppercase">Word Pacing Animation</label>
              <div className="grid grid-cols-3 gap-1 bg-[#100e1a] p-1 rounded-lg border border-white/5 text-[10px] font-bold">
                {[
                  { id: "text-glow", label: "Glow" },
                  { id: "underline", label: "Underline" },
                  { id: "text-pop", label: "Pop" },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setWordTransitionStyle(opt.id)}
                    className={`py-1 rounded-md transition-all text-center ${
                      wordTransitionStyle === opt.id
                        ? "bg-cyan-600 text-white shadow-sm"
                        : "text-white/40 hover:text-white"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Automatic Session Video & Audio Recording Badge */}
          <div className="flex items-center justify-between bg-[#181624]/60 p-3 rounded-xl border border-white/5">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isRecordingActive ? "bg-red-500/20 text-red-400 border border-red-500/30" : "bg-white/5 text-white/40"
              }`}>
                <PiRecord size={16} className={isRecordingActive ? "animate-pulse" : ""} />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Session Video Recording
                </span>
                <span className="text-[9px] text-white/40">
                  {isRecordingActive ? "Recording video & audio • Saves on Stop" : "Automatically captures video & audio"}
                </span>
              </div>
            </div>

            <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
              isRecordingActive
                ? "bg-red-500/20 border border-red-500/30 text-red-300 animate-pulse"
                : "bg-white/5 border border-white/10 text-white/40"
            }`}>
              {isRecordingActive ? "● Recording" : "Auto-Armed"}
            </div>
          </div>
        </div>

        {/* ─── PANE 3: Teleprompter Text Preview & Library (Col 2, Rows 1–6) ─── */}
        <div className="col-start-2 col-end-3 row-start-1 row-end-7 bg-[#111019]/90 border border-white/10 rounded-2xl p-5 flex flex-col overflow-hidden shadow-xl backdrop-blur-md">
          {/* Header & Controls */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <PiArticle size={18} />
              </div>
              <div>
                <select
                  value={activeScriptId}
                  onChange={(e) => setActiveScriptId(e.target.value)}
                  className="bg-[#1b1926] text-xs font-bold text-white px-3 py-1.5 rounded-xl border border-white/10 outline-none focus:border-purple-500/50 cursor-pointer"
                >
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-white/40 font-mono mt-0.5">
                  {scriptTokens.length} words • {activeScript.pages?.length || 1} sections
                </div>
              </div>
            </div>

            {/* Script Management Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setScriptToEdit(activeScript);
                  setIsScriptModalOpen(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <PiPencilSimple size={13} /> Edit
              </button>

              <button
                onClick={() => {
                  setScriptToEdit(null);
                  setIsScriptModalOpen(true);
                }}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-purple-600/30 transition-all active:scale-95"
              >
                <PiPlus size={14} /> Add Content
              </button>
            </div>
          </div>

          {/* Reading Horizon Guide Banner */}
          <div className="py-2 flex items-center justify-between text-[10px] text-white/40 font-mono border-b border-white/5">
            <span>Reading Horizon (~35%)</span>
            <span>Word {activeWordIndex + 1} of {scriptTokens.length}</span>
          </div>

          {/* Segmented Mode Toolbar (FR-5.48 [NEW]) */}
          {activeScript?.scrollMode === "segmented" && (
            <div className="py-2 px-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl mt-2 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-xs font-bold text-cyan-200">
                  Section {currentSegmentIndex + 1} of {processedSections.length || 1}:{" "}
                  <span className="text-white">{processedSections[currentSegmentIndex]?.label || "Current"}</span>
                </span>
                {segmentSuggestPrompt && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                    {segmentSuggestPrompt.prompt || "Say: Next section"}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  id="tp-prev-segment-btn"
                  onClick={handleManualPrevSegment}
                  disabled={currentSegmentIndex <= 0}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white/5 hover:bg-white/10 text-white/80 disabled:opacity-30 disabled:pointer-events-none border border-white/10 flex items-center gap-1 transition-all"
                >
                  <PiCaretLeft size={14} /> Prev
                </button>
                <button
                  id="tp-next-segment-btn"
                  onClick={handleManualAdvanceSegment}
                  disabled={currentSegmentIndex >= (processedSections.length - 1)}
                  className="px-3 py-1 rounded-lg text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-30 disabled:pointer-events-none shadow-md shadow-cyan-600/20 flex items-center gap-1 active:scale-95 transition-all"
                >
                  Next <PiCaretRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Teleprompter Scrolling Viewport (Scene-by-Scene & Line-by-Line) */}
          <div
            ref={textPreviewContainerRef}
            className="flex-1 overflow-y-auto px-6 py-8 text-center bg-[#07070b]/60 rounded-xl mt-3 border border-white/5 relative no-scrollbar space-y-8"
          >
            {processedSections.length > 0 ? (
              processedSections.map((sec, secIdx) => {
                const isSegmented = activeScript?.scrollMode === "segmented";
                const isSecActive = isSegmented
                  ? secIdx === currentSegmentIndex
                  : (sec.startIdx <= activeWordIndex && activeWordIndex <= sec.endIdx);
                const isSecPast = isSegmented
                  ? secIdx < currentSegmentIndex
                  : (sec.endIdx < activeWordIndex);

                return (
                  <div
                    key={sec.id || `sec-${secIdx}`}
                    id={`tp-preview-sec-${secIdx}`}
                    className={`transition-all duration-300 ${
                      sceneBreakStyle === "scroll-out" && isSecPast
                        ? "-translate-y-2 opacity-40 scale-[0.98]"
                        : sceneBreakStyle === "fade" && isSecPast
                        ? "opacity-35"
                        : sceneBreakStyle === "spotlight"
                        ? isSecActive
                          ? "opacity-100 scale-100"
                          : "opacity-30 scale-95"
                        : isSecActive
                        ? "opacity-100"
                        : "opacity-50"
                    }`}
                  >
                    {/* Scene Divider Header */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[11px] font-bold text-purple-300 mb-4 tracking-wider uppercase">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      {sec.label || `Scene ${secIdx + 1}`}
                    </div>

                    {/* Lines inside this Scene */}
                    <div className="space-y-4 max-w-xl mx-auto font-sans font-bold leading-relaxed">
                      {sec.lines.map((line) => {
                        const isLineActive = line.startIdx <= activeWordIndex && activeWordIndex <= line.endIdx;
                        const isLinePast = line.endIdx < activeWordIndex;

                        return (
                          <div
                            key={line.id}
                            className={`transition-all duration-200 py-1 rounded-lg ${
                              isLineActive
                                ? "bg-white/[0.04] px-2 shadow-inner"
                                : isLinePast
                                ? "opacity-60"
                                : "opacity-35"
                            }`}
                          >
                            {line.words.map((wObj) => {
                              const isWordActive = wObj.index === activeWordIndex;
                              const isWordPast = wObj.index < activeWordIndex;

                              let activeStyles = {};
                              if (isWordActive) {
                                if (wordTransitionStyle === "text-glow") {
                                  activeStyles = {
                                    color: "#FFFFFF",
                                    transform: "scale(1.1) translateY(-1px)",
                                    textShadow:
                                      "0 0 16px rgba(56,189,248,0.95), 0 0 28px rgba(56,189,248,0.6), 0 2px 10px rgba(0,0,0,0.8)",
                                    borderBottom: "2px solid #38bdf8",
                                  };
                                } else if (wordTransitionStyle === "underline") {
                                  activeStyles = {
                                    color: "#FFFFFF",
                                    borderBottom: "3px solid #38bdf8",
                                    paddingBottom: "2px",
                                  };
                                } else if (wordTransitionStyle === "text-pop") {
                                  activeStyles = {
                                    color: "#38bdf8",
                                    transform: "scale(1.2) translateY(-2px)",
                                    fontWeight: 900,
                                    textShadow: "0 4px 16px rgba(56,189,248,0.8)",
                                  };
                                }
                              }

                              return (
                                <React.Fragment key={`w-${wObj.index}`}>
                                  <span
                                    id={`tp-preview-word-${wObj.index}`}
                                    style={{
                                      display: "inline-block",
                                      color: isWordActive
                                        ? "#FFFFFF"
                                        : isWordPast
                                        ? "rgba(255,255,255,0.75)"
                                        : "rgba(255,255,255,0.35)",
                                      fontSize: "20px",
                                      fontWeight: isWordActive ? 900 : isWordPast ? 700 : 500,
                                      transition: "all 140ms cubic-bezier(0.2, 0.8, 0.2, 1)",
                                      ...activeStyles,
                                    }}
                                    className="mx-1 my-0.5 cursor-pointer"
                                    onClick={() => setActiveWordIndex(wObj.index)}
                                  >
                                    {wObj.word}
                                  </span>{" "}
                                </React.Fragment>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-white/30 text-xs py-12">
                No script content loaded. Click "+ Add Content" to author your first script.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ─── Toast Notification Banner ─── */}
      {sessionSaveToast && (
        <div className="fixed bottom-6 right-6 z-[500] bg-emerald-900/90 border border-emerald-400 text-emerald-100 px-5 py-3 rounded-2xl shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-fade-in text-xs font-bold">
          <PiCheckCircle size={20} className="text-emerald-300" />
          <span>{sessionSaveToast}</span>
        </div>
      )}

      {/* ─── Countdown Overlay (FR-5.45 [NEW]) ─── */}
      {countdownValue !== null && (
        <div
          className="fixed inset-0 z-[900] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={handleCancelCountdown}
        >
          <div className="text-[120px] font-black text-white leading-none tabular-nums animate-bounce">
            {countdownValue === 0 ? "GO" : countdownValue}
          </div>
          <p className="text-white/60 text-sm mt-4 font-semibold tracking-wide">Recording begins at 0</p>
          <button
            onClick={(e) => { e.stopPropagation(); handleCancelCountdown(); }}
            className="mt-8 px-5 py-2 rounded-xl border border-white/20 bg-white/10 text-white/70 text-xs font-bold hover:bg-white/20 transition-all"
          >
            Cancel (Esc)
          </button>
        </div>
      )}

      {/* ─── Script Authoring Modal ─── */}
      <TeleprompterScriptModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
        initialScript={scriptToEdit}
        onSaveScript={handleSaveScript}
      />

      {/* ─── Fullscreen Teleprompter Overlay ─── */}
      <TeleprompterFullscreenOverlay
        isOpen={isFullscreenOpen}
        onClose={() => setIsFullscreenOpen(false)}
        videoStream={videoStream}
        script={activeScript}
        activeWordIndex={activeWordIndex}
        cameraOpacity={cameraOpacity}
        fontSize={fontSize}
        isMirrored={isMirrored}
        sceneBreakStyle={sceneBreakStyle}
        wordTransitionStyle={wordTransitionStyle}
        currentSegmentIndex={currentSegmentIndex}
      />

      {/* ─── Privacy Consent Modal ─── */}
      <TeleprompterConsentModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onConfirmConsent={handleConfirmedConsentStart}
        cameraSource={cameraSource === "laptop" ? "Laptop Camera" : "Phone Camera"}
      />

    </div>
  );
}
