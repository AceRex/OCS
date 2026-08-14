// AudioWorklet — Enhanced VAD with Spectral Energy Gating
// Improvements over v1:
//  1. Zero-Crossing Rate (ZCR): Human voice has moderate ZCR (~0.05-0.35).
//     High ZCR + low RMS = background hiss/noise, not speech.
//  2. Mid-Band Energy Ratio: Voice energy concentrates in 300–3400 Hz.
//     We compute a coarse approximation using the autocorrelation of the
//     signal to detect periodicity (voiced speech is periodic).
//  3. Adaptive noise floor: Updated every 5 silent chunks to handle
//     changing acoustic environments (AC turning on, crowd noise rising).

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.ptr = 0;

    // Adaptive noise floor — updated during silence
    this.noiseFloor = 0.004;
    this.silenceChunkCount = 0;
    this.noiseFloorSamples = [];
    this.NOISE_FLOOR_UPDATE_INTERVAL = 8; // Update every 8 silent chunks (~1s)
    this.NOISE_FLOOR_MIN = 0.005; // Increased from 0.002
    this.NOISE_FLOOR_MAX = 0.025;

    // VAD Hangover: wait ~640ms (5 chunks * 128ms) of silence before dropping isSpeaking
    this.hangoverLimit = 5;
    this.hangoverCount = 0;
    this.wasSpeaking = false;
  }

  /**
   * Zero-Crossing Rate: fraction of samples where sign changes.
   * Voice: 0.05–0.35. Noise/hiss: > 0.40. Silence: near 0.
   */
  computeZCR(buffer) {
    let crossings = 0;
    for (let i = 1; i < buffer.length; i++) {
      if ((buffer[i] >= 0) !== (buffer[i - 1] >= 0)) crossings++;
    }
    return crossings / buffer.length;
  }

  /**
   * Coarse periodicity check via autocorrelation peak.
   * Voiced speech has a strong autocorrelation peak at the pitch period.
   * Noise does not. Returns a "voicing score" 0–1.
   */
  computeVoicingScore(buffer) {
    // Only check a subset for performance (first 512 samples)
    const N = Math.min(buffer.length, 512);
    const maxLag = Math.min(N / 2, 160); // Up to ~100Hz at 16kHz
    const minLag = 20; // ~800Hz — below typical voice, prevents noise peak

    let r0 = 0;
    for (let i = 0; i < N; i++) r0 += buffer[i] * buffer[i];
    if (r0 < 0.0001) return 0;

    let maxR = 0;
    for (let lag = minLag; lag < maxLag; lag++) {
      let r = 0;
      for (let i = 0; i < N - lag; i++) {
        r += buffer[i] * buffer[i + lag];
      }
      if (r > maxR) maxR = r;
    }

    return Math.min(1, maxR / r0);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.ptr++] = channelData[i];

      if (this.ptr >= this.bufferSize) {
        // ── 1. RMS Energy + ZCR in one pass ──────────────────────────
        let sum = 0;
        let crossings = 0;
        let prev = this.buffer[0];
        for (let j = 0; j < this.buffer.length; j++) {
          const sample = this.buffer[j];
          sum += sample * sample;
          if (j > 0 && ((sample >= 0) !== (prev >= 0))) crossings++;
          prev = sample;
        }
        const rms = Math.sqrt(sum / this.buffer.length);
        const zcr = crossings / this.buffer.length;

        // ── 3. Voicing Score (periodicity) ───────────────────────────
        let voicingScore = 0;
        if (rms > this.noiseFloor * 2 && zcr < 0.5) {
          voicingScore = this.computeVoicingScore(this.buffer);
        }

        // ── 4. Adaptive noise floor update (during silence) ──────────
        const isLikelySilent = rms < this.noiseFloor * 1.5;
        if (isLikelySilent) {
          this.silenceChunkCount++;
          this.noiseFloorSamples.push(rms);

          if (this.silenceChunkCount >= this.NOISE_FLOOR_UPDATE_INTERVAL) {
            // Use median of recent silence samples as new noise floor
            this.noiseFloorSamples.sort((a, b) => a - b);
            const newFloor = this.noiseFloorSamples[Math.floor(this.noiseFloorSamples.length / 2)];
            this.noiseFloor = Math.max(
              this.NOISE_FLOOR_MIN,
              Math.min(this.NOISE_FLOOR_MAX, newFloor * 1.2)
            );
            this.silenceChunkCount = 0;
            this.noiseFloorSamples = [];
          }
        } else {
          this.silenceChunkCount = 0;
        }

        // ── 5. Multi-feature VAD Decision ────────────────────────────
        // Primary: RMS must exceed the adaptive noise floor (with headroom)
        const energyOk = rms > this.noiseFloor * 4.0; // Increased from 2.5 to be very conservative

        // Secondary: ZCR must be in the voice range (< 0.42)
        // High ZCR with low energy = white noise / hiss, not voice
        const zcrOk = zcr < 0.42;

        // Tertiary: Either voicing score is present OR energy is very strong
        // (loud transients — claps, door slams — get through but will be filtered
        //  by confidence gating in the Vosk layer)
        const periodicityOk = voicingScore > 0.15 || rms > this.noiseFloor * 6;

        const isCurrentSpeaking = energyOk && zcrOk && periodicityOk;

        let isSpeaking = false;
        if (isCurrentSpeaking) {
            this.hangoverCount = 0;
            this.wasSpeaking = true;
            isSpeaking = true;
        } else {
            if (this.wasSpeaking) {
                this.hangoverCount++;
                if (this.hangoverCount < this.hangoverLimit) {
                    isSpeaking = true; // Still in hangover period
                } else {
                    this.wasSpeaking = false;
                    isSpeaking = false;
                }
            }
        }

        // Compute a spectral confidence value for the debug bar
        const spectralConfidence = isSpeaking
          ? Math.min(1.0, (voicingScore * 0.5) + ((rms / (this.noiseFloor * 4)) * 0.5))
          : 0;

        this.port.postMessage({
          audio: this.buffer,
          isSpeaking,
          rms,
          zcr: Math.round(zcr * 100) / 100,
          voicingScore: Math.round(voicingScore * 100) / 100,
          spectralConfidence: Math.round(spectralConfidence * 100) / 100,
          noiseFloor: Math.round(this.noiseFloor * 10000) / 10000,
        });

        this.ptr = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
