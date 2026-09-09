/**
 * OCS Broadcast Audio Mixer & Master Limiter Bus — P0-02
 *
 * Implements a 4-channel broadcast summing mixer with:
 * - Channel 1: Pulpit Mic
 * - Channel 2: Wireless Handheld / Lapel
 * - Channel 3: Media Playout (Videos, Songs)
 * - Channel 4: Room Ambience / Mobile Intercom
 *
 * Audio Features:
 * - Gain & Mute/Solo logic per channel.
 * - Circular delay buffer (0–500ms) for A/V Lip-Sync calibration.
 * - Peak & RMS metering.
 * - Brickwall master limiter strictly capping peaks to -1.0 dBFS (preventing digital clipping).
 *
 * Dual-Mode Support:
 * - Operates headlessly via Node PCM buffers (sample rate 48000Hz, 16-bit Float/PCM).
 * - Exposes Web Audio Node graph when running within Chromium / Electron Renderer.
 */

class BroadcastAudioBus {
  constructor(options = {}) {
    this.sampleRate = options.sampleRate || 48000;
    this.channelsCount = 4;
    this.delayMs = Math.min(Math.max(0, options.delayMs || 0), 500);

    // Channel configurations
    this.channels = {
      1: { name: 'Pulpit Mic', gain: 1.0, muted: false, solo: false, peak: 0, rms: 0, clipping: false },
      2: { name: 'Handheld Mic', gain: 1.0, muted: false, solo: false, peak: 0, rms: 0, clipping: false },
      3: { name: 'Media Playout', gain: 1.0, muted: false, solo: false, peak: 0, rms: 0, clipping: false },
      4: { name: 'Room / Ambience', gain: 0.8, muted: false, solo: false, peak: 0, rms: 0, clipping: false }
    };

    // Master bus configuration
    this.master = {
      gain: 1.0,
      limiterThresholdDb: -1.0, // -1.0 dBFS brickwall ceiling
      limiterLinearCeiling: Math.pow(10, -1.0 / 20), // ~0.89125 linear
      peak: 0,
      rms: 0,
      clipping: false,
      limiterActive: false
    };

    // Circular delay buffer for 0-500ms delay (stereo: 2 channels)
    // Sized to 1.0s (48,000 samples) so delay up to 500ms (24,000 samples) never aliases the write index
    this.maxDelaySamples = Math.ceil(1.0 * this.sampleRate);
    this.delayBufferL = new Float32Array(this.maxDelaySamples);
    this.delayBufferR = new Float32Array(this.maxDelaySamples);
    this.delayWriteIdx = 0;

    // Web Audio API context handles (if running in browser/renderer)
    this.audioCtx = null;
    this.masterGainNode = null;
    this.limiterNode = null;
    this.delayNode = null;
    this.channelNodes = {};
  }

  /**
   * Initializes Web Audio nodes if executed in browser or Electron renderer window.
   */
  initWebAudio(context = null) {
    if (typeof window === 'undefined' && !context) {
      return false;
    }

    const AudioContextClass = context
      ? null
      : (window.AudioContext || window.webkitAudioContext);

    if (!context && !AudioContextClass) return false;

    this.audioCtx = context || new AudioContextClass({ sampleRate: this.sampleRate });

    // Master Gain
    this.masterGainNode = this.audioCtx.createGain();
    this.masterGainNode.gain.value = this.master.gain;

    // A/V Lip-Sync Delay Node (0 to 0.5s)
    this.delayNode = this.audioCtx.createDelay(0.5);
    this.delayNode.delayTime.value = this.delayMs / 1000;

    // DynamicsCompressor configured as a Brickwall Peak Limiter (-1.0 dBFS)
    this.limiterNode = this.audioCtx.createDynamicsCompressor();
    this.limiterNode.threshold.value = this.master.limiterThresholdDb; // -1.0 dBFS
    this.limiterNode.knee.value = 0.0; // Hard knee
    this.limiterNode.ratio.value = 20.0; // Hard limiting
    this.limiterNode.attack.value = 0.003; // 3ms fast attack
    this.limiterNode.release.value = 0.150; // 150ms release

    // Routing: MasterGain -> Delay -> Limiter (PCM tap point for recording and broadcast)
    this.masterGainNode.connect(this.delayNode);
    this.delayNode.connect(this.limiterNode);
    // IMPORTANT: Never connect limiterNode directly to audioCtx.destination!
    // Direct destination connection routes the live pulpit microphone to the laptop/control speakers,
    // causing an immediate acoustic feedback loop and delayed echo.

    // Create 4 input channel gain nodes
    for (let i = 1; i <= this.channelsCount; i++) {
      const chGain = this.audioCtx.createGain();
      chGain.gain.value = this.channels[i].gain;
      chGain.connect(this.masterGainNode);
      this.channelNodes[i] = chGain;
    }

    return true;
  }

  /**
   * Sets channel gain (0.0 to 2.0).
   */
  setChannelGain(ch, gain) {
    if (!this.channels[ch]) return;
    const clamped = Math.max(0, Math.min(Number(gain), 2.0));
    this.channels[ch].gain = clamped;

    if (this.channelNodes[ch] && this.audioCtx) {
      this.channelNodes[ch].gain.setValueAtTime(clamped, this.audioCtx.currentTime);
    }
  }

  /**
   * Toggles channel mute.
   */
  setChannelMute(ch, muted) {
    if (!this.channels[ch]) return;
    this.channels[ch].muted = Boolean(muted);
    this._syncWebAudioChannelGains();
  }

  /**
   * Toggles channel solo.
   */
  setChannelSolo(ch, solo) {
    if (!this.channels[ch]) return;
    this.channels[ch].solo = Boolean(solo);
    this._syncWebAudioChannelGains();
  }

  /**
   * Sets master bus gain.
   */
  setMasterGain(gain) {
    const clamped = Math.max(0, Math.min(Number(gain), 1.5));
    this.master.gain = clamped;
    if (this.masterGainNode && this.audioCtx) {
      this.masterGainNode.gain.setValueAtTime(clamped, this.audioCtx.currentTime);
    }
  }

  /**
   * Sets lip-sync delay (0 to 500 ms).
   */
  setDelayMs(ms) {
    const clamped = Math.max(0, Math.min(Number(ms), 500));
    this.delayMs = clamped;
    if (this.delayNode && this.audioCtx) {
      this.delayNode.delayTime.setValueAtTime(clamped / 1000, this.audioCtx.currentTime);
    }
  }

  /**
   * Recalculates effective channel gains based on mute and solo states.
   */
  _syncWebAudioChannelGains() {
    const hasAnySolo = Object.values(this.channels).some(c => c.solo);
    for (let i = 1; i <= this.channelsCount; i++) {
      const ch = this.channels[i];
      let effectiveGain = ch.gain;

      if (ch.muted) {
        effectiveGain = 0;
      } else if (hasAnySolo && !ch.solo) {
        effectiveGain = 0;
      }

      if (this.channelNodes[i] && this.audioCtx) {
        this.channelNodes[i].gain.setValueAtTime(effectiveGain, this.audioCtx.currentTime);
      }
    }
  }

  /**
   * Pure DSP headless frame processing for buffers or arrays of Float32 samples.
   *
   * @param {object} inputMap - Map of channel ID (1..4) to Float32Array samples or null
   * @param {number} numSamples - Number of samples per channel
   * @returns {{ left: Float32Array, right: Float32Array, limiterActive: boolean }} Mixed, delayed, limited stereo output
   */
  processFrame(inputMap, numSamples) {
    const outL = new Float32Array(numSamples);
    const outR = new Float32Array(numSamples);

    const hasAnySolo = Object.values(this.channels).some(c => c.solo);
    const ceiling = this.master.limiterLinearCeiling; // ~0.891 (-1.0 dBFS)

    // 1. Sum channels into raw master bus
    for (let i = 0; i < numSamples; i++) {
      let sumL = 0;
      let sumR = 0;

      for (let chId = 1; chId <= this.channelsCount; chId++) {
        const ch = this.channels[chId];
        const samples = inputMap[chId];

        if (ch.muted || (hasAnySolo && !ch.solo) || !samples) {
          continue;
        }

        let sample = samples[i];
        if (!Number.isFinite(sample)) {
          sample = 0;
        }

        const channelOutput = sample * ch.gain;

        // Sum mono input equally to Left and Right
        sumL += channelOutput;
        sumR += channelOutput;

        // Update channel meters
        const absVal = Math.abs(channelOutput);
        ch.peak = Math.max(ch.peak * 0.95, absVal);
        ch.rms = Math.sqrt(ch.rms * ch.rms * 0.95 + absVal * absVal * 0.05);
        ch.clipping = absVal >= 0.99;
      }

      // Apply master gain with finite safety
      const mGain = Number.isFinite(this.master.gain) ? this.master.gain : 1.0;
      outL[i] = Number.isFinite(sumL) ? sumL * mGain : 0;
      outR[i] = Number.isFinite(sumR) ? sumR * mGain : 0;
    }

    // 2. Apply Lip-Sync Circular Delay Buffer
    const delaySampleCount = Math.round((this.delayMs / 1000) * this.sampleRate);
    const delayedL = new Float32Array(numSamples);
    const delayedR = new Float32Array(numSamples);

    if (delaySampleCount > 0) {
      for (let i = 0; i < numSamples; i++) {
        // Store current in ring buffer
        this.delayBufferL[this.delayWriteIdx] = outL[i];
        this.delayBufferR[this.delayWriteIdx] = outR[i];

        // Read delayed index
        let readIdx = this.delayWriteIdx - delaySampleCount;
        if (readIdx < 0) readIdx += this.maxDelaySamples;

        delayedL[i] = this.delayBufferL[readIdx];
        delayedR[i] = this.delayBufferR[readIdx];

        this.delayWriteIdx = (this.delayWriteIdx + 1) % this.maxDelaySamples;
      }
    } else {
      delayedL.set(outL);
      delayedR.set(outR);
    }

    // 3. Brickwall Master Peak Limiter (-1.0 dBFS ceiling)
    let limiterTriggered = false;
    let maxPeak = 0;
    let sumSquares = 0;

    for (let i = 0; i < numSamples; i++) {
      let sL = delayedL[i];
      let sR = delayedR[i];

      if (!Number.isFinite(sL)) sL = 0;
      if (!Number.isFinite(sR)) sR = 0;

      const peakSample = Math.max(Math.abs(sL), Math.abs(sR));

      // Fast brickwall limiting: if peak exceeds -1.0 dBFS ceiling, clamp immediately
      if (peakSample > ceiling) {
        if (Number.isFinite(peakSample) && peakSample > 0) {
          const factor = ceiling / peakSample;
          sL *= factor;
          sR *= factor;
        } else {
          sL = 0;
          sR = 0;
        }
        limiterTriggered = true;
      }

      // Strict finite guarantee
      sL = Number.isFinite(sL) ? Math.max(-ceiling, Math.min(ceiling, sL)) : 0;
      sR = Number.isFinite(sR) ? Math.max(-ceiling, Math.min(ceiling, sR)) : 0;

      delayedL[i] = sL;
      delayedR[i] = sR;

      maxPeak = Math.max(maxPeak, Math.abs(sL), Math.abs(sR));
      sumSquares += sL * sL + sR * sR;
    }

    this.master.limiterActive = limiterTriggered;
    this.master.peak = Math.max(this.master.peak * 0.95, maxPeak);
    this.master.rms = Math.sqrt(sumSquares / (numSamples * 2));
    this.master.clipping = maxPeak >= 1.0; // Strictly impossible due to limiter clamping to -1.0 dBFS

    return {
      left: delayedL,
      right: delayedR,
      limiterActive: limiterTriggered
    };
  }

  /**
   * Connects an external MediaStream (e.g. microphone or WebRTC audio track) to an input channel.
   *
   * @param {number} ch - Channel ID (1: Pulpit Mic, 2: Handheld Mic, 4: Room Ambience)
   * @param {MediaStream} mediaStream - Input media stream
   */
  connectMediaStream(ch, mediaStream) {
    if (!this.audioCtx || !this.channelNodes[ch]) {
      this.initWebAudio();
    }
    if (!this.audioCtx || !this.channelNodes[ch] || !mediaStream) return false;

    try {
      const srcNode = this.audioCtx.createMediaStreamSource(mediaStream);
      srcNode.connect(this.channelNodes[ch]);
      return true;
    } catch (e) {
      console.error(`[BroadcastAudioBus] Failed to connect MediaStream to channel ${ch}:`, e);
      return false;
    }
  }

  /**
   * Connects an HTMLMediaElement (<video> or <audio>) to Channel 3 (Media Playout).
   *
   * @param {HTMLMediaElement} mediaElement
   */
  connectMediaElement(mediaElement) {
    if (!this.audioCtx || !this.channelNodes[3]) {
      this.initWebAudio();
    }
    if (!this.audioCtx || !this.channelNodes[3] || !mediaElement) return false;

    try {
      const srcNode = this.audioCtx.createMediaElementSource(mediaElement);
      srcNode.connect(this.channelNodes[3]);
      // Also connect to audioCtx.destination for local room playback
      srcNode.connect(this.audioCtx.destination);
      return true;
    } catch (e) {
      console.error('[BroadcastAudioBus] Failed to connect MediaElement to channel 3:', e);
      return false;
    }
  }

  /**
   * Starts tapping the Master bus post-limiter to produce 48,000 Hz 16-bit PCM chunks
   * and pipes them into recorder & broadcast handlers.
   *
   * @param {function(Buffer): void} onPcmChunk - Callback receiving 16-bit stereo PCM
   */
  startPcmStream(onPcmChunk) {
    if (!this.audioCtx) this.initWebAudio();
    if (!this.audioCtx || !this.limiterNode) return null;

    try {
      // Create ScriptProcessor tap on limiterNode
      const bufferSize = 2048;
      const scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 2, 2);
      this.limiterNode.connect(scriptNode);

      // Connect scriptNode to a silent GainNode (gain=0.0) before audioCtx.destination
      // Chromium Web Audio requires ScriptProcessorNode to have a destination path to fire onaudioprocess,
      // but routing through gain=0.0 ensures 0 sound emerges from physical speakers (zero feedback/echo).
      const silentSink = this.audioCtx.createGain();
      silentSink.gain.value = 0.0;
      scriptNode.connect(silentSink);
      silentSink.connect(this.audioCtx.destination);

      scriptNode.onaudioprocess = (e) => {
        const inputL = e.inputBuffer.getChannelData(0);
        const inputR = e.inputBuffer.numberOfChannels > 1 ? e.inputBuffer.getChannelData(1) : inputL;
        const numSamples = inputL.length;
        // Use DataView + ArrayBuffer instead of Node.js Buffer (renderer has no Buffer global)
        const pcmArrayBuf = new ArrayBuffer(numSamples * 4); // 2 bytes L + 2 bytes R per sample
        const view = new DataView(pcmArrayBuf);

        for (let i = 0; i < numSamples; i++) {
          let sL = inputL[i];
          let sR = inputR[i];
          if (!Number.isFinite(sL)) sL = 0;
          if (!Number.isFinite(sR)) sR = 0;
          sL = Math.max(-1.0, Math.min(1.0, sL));
          sR = Math.max(-1.0, Math.min(1.0, sR));

          view.setInt16(i * 4,     Math.floor(sL * 32767), true); // little-endian
          view.setInt16(i * 4 + 2, Math.floor(sR * 32767), true);
        }

        if (onPcmChunk) onPcmChunk(pcmArrayBuf);
      };

      return () => {
        try {
          scriptNode.disconnect();
          silentSink.disconnect();
          this.limiterNode.disconnect(scriptNode);
        } catch (_) {}
      };
    } catch (err) {
      console.error('[BroadcastAudioBus] Failed to start PCM stream tap:', err);
      return null;
    }
  }

  /**
   * Helper to convert interleaved 16-bit signed PCM buffer to Float32Array.
   */
  static pcm16ToFloat32(arrayBuf) {
    const view = new DataView(arrayBuf instanceof ArrayBuffer ? arrayBuf : arrayBuf.buffer);
    const numSamples = Math.floor(view.byteLength / 2);
    const floats = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      floats[i] = view.getInt16(i * 2, true) / 32768;
    }
    return floats;
  }

  /**
   * Helper to convert stereo Float32Arrays back to interleaved 16-bit signed PCM buffer.
   */
  static float32ToPcm16(left, right) {
    const numSamples = left.length;
    // Use DataView + ArrayBuffer instead of Node.js Buffer (no Buffer in renderer)
    const arrayBuf = new ArrayBuffer(numSamples * 4); // 2 bytes left + 2 bytes right
    const view = new DataView(arrayBuf);
    for (let i = 0; i < numSamples; i++) {
      const sL = Math.max(-1.0, Math.min(1.0, left[i]));
      const sR = Math.max(-1.0, Math.min(1.0, right[i]));
      view.setInt16(i * 4,     Math.floor(sL * 32767), true);
      view.setInt16(i * 4 + 2, Math.floor(sR * 32767), true);
    }
    return new Uint8Array(arrayBuf);
  }

  /**
   * Retrieves instantaneous metering state for UI and controller diagnostics.
   */
  getMeterData() {
    return {
      channels: {
        1: { ...this.channels[1] },
        2: { ...this.channels[2] },
        3: { ...this.channels[3] },
        4: { ...this.channels[4] }
      },
      master: { ...this.master },
      delayMs: this.delayMs
    };
  }
}

const broadcastAudioBus = new BroadcastAudioBus();

module.exports = {
  BroadcastAudioBus,
  broadcastAudioBus
};
