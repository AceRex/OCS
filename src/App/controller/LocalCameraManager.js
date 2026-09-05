/**
 * LocalCameraManager
 *
 * Discovers and manages physical video input hardware:
 * - HDMI Camcorders via USB capture cards (Elgato Cam Link, Blackmagic, Magewell, generic UVC HDMI dongles)
 * - PTZ Cameras & USB Studio Video Cameras
 * - Built-in & External Webcams
 * - Virtual Cameras (OBS Virtual Camera)
 *
 * Provides lifecycle management, hot-plug detection, and high-fidelity MediaStreams.
 */

class LocalCameraManager {
  constructor() {
    this.activeStreams = new Map(); // deviceId -> MediaStream
    this.listeners = new Set();
    this._deviceChangeHandler = () => this._notifyListeners();

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", this._deviceChangeHandler);
    }
  }

  /**
   * Enumerate all connected physical and virtual video capture hardware.
   * Returns cleaned metadata and detects likely camcorders/capture cards.
   */
  async enumerateVideoDevices() {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }

    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter((d) => d.kind === "videoinput");

      return videoDevices.map((d, index) => {
        const rawLabel = (d.label || "").trim();
        const label = rawLabel || `Video Camera ${index + 1}`;
        const lower = label.toLowerCase();

        const isCamcorder =
          lower.includes("cam link") ||
          lower.includes("capture") ||
          lower.includes("hdmi") ||
          lower.includes("camcorder") ||
          lower.includes("blackmagic") ||
          lower.includes("magewell") ||
          lower.includes("ultrastudio") ||
          lower.includes("intensity") ||
          lower.includes("uvc video");

        const isVirtual = lower.includes("obs") || lower.includes("virtual");

        return {
          deviceId: d.deviceId,
          groupId: d.groupId,
          label,
          isCamcorder,
          isVirtual,
          category: isCamcorder ? "Camcorder / Capture Card" : isVirtual ? "Virtual Camera" : "Webcam / USB Camera",
        };
      });
    } catch (err) {
      console.error("[LocalCameraManager] Error enumerating video devices:", err);
      return [];
    }
  }

  /**
   * Acquire a high-definition MediaStream from a hardware device.
   * Prefers 1080p/720p 60fps/30fps broadcast resolution.
   */
  async startStream(deviceId, preferredQuality = "hd") {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("getUserMedia not supported in this environment");
    }

    // Stop existing stream for this device if already running
    this.stopStream(deviceId);

    const isHd = preferredQuality === "hd";
    const constraintsCandidates = [
      // 1080p 60/30fps ideal for HDMI camcorders
      {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: isHd ? 1920 : 1280 },
          height: { ideal: isHd ? 1080 : 720 },
          frameRate: { ideal: 60, min: 24 },
        },
        audio: false,
      },
      // 720p fallback
      {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      },
      // Exact device with unconstrained dimensions
      {
        video: { deviceId: { exact: deviceId } },
        audio: false,
      },
    ];

    let lastError = null;
    for (const constraints of constraintsCandidates) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.activeStreams.set(deviceId, stream);
        console.log(`[LocalCameraManager] Started stream for device: ${deviceId}`);
        return stream;
      } catch (err) {
        lastError = err;
        console.warn("[LocalCameraManager] getUserMedia constraint attempt failed:", constraints, err);
      }
    }

    throw lastError || new Error(`Could not start stream for device ${deviceId}`);
  }

  /**
   * Get an already running stream for a device
   */
  getStream(deviceId) {
    return this.activeStreams.get(deviceId) || null;
  }

  /**
   * Stop an active stream and release the hardware sensor
   */
  stopStream(deviceId) {
    const stream = this.activeStreams.get(deviceId);
    if (stream) {
      try {
        stream.getTracks().forEach((track) => track.stop());
      } catch (_) {}
      this.activeStreams.delete(deviceId);
      console.log(`[LocalCameraManager] Stopped stream for device: ${deviceId}`);
    }
  }

  /**
   * Release all hardware streams on shutdown
   */
  stopAll() {
    for (const deviceId of this.activeStreams.keys()) {
      this.stopStream(deviceId);
    }
  }

  /**
   * Subscribe to device connection/disconnection events
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _notifyListeners() {
    this.enumerateVideoDevices().then((devices) => {
      for (const listener of this.listeners) {
        try {
          listener(devices);
        } catch (_) {}
      }
    });
  }

  destroy() {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener("devicechange", this._deviceChangeHandler);
    }
    this.stopAll();
    this.listeners.clear();
  }
}

export const localCameraManager = new LocalCameraManager();
export default localCameraManager;
