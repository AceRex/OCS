/**
 * AudioWorklet Downsampler Helper for OCS
 *
 * Runs 16 kHz Mono Int16 downsampling on the dedicated Web Audio thread,
 * eliminating main JS UI thread contention during active speech recognition,
 * high-resolution camera feeds, and video rendering.
 */

const WORKLET_PROCESSOR_CODE = `
class PcmDownsamplerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.targetSampleRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;
    const channelData = input[0];

    const inputRate = sampleRate;
    const ratio = inputRate / this.targetSampleRate;
    const outLen = Math.max(1, Math.floor(channelData.length / ratio));
    const int16 = new Int16Array(outLen);

    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
      sum += channelData[i] * channelData[i];
    }
    const rms = Math.sqrt(sum / channelData.length);

    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(channelData.length, Math.floor((i + 1) * ratio) || start + 1);
      let acc = 0;
      const count = Math.max(1, end - start);
      for (let j = start; j < end; j++) acc += channelData[j];
      const s = Math.max(-1, Math.min(1, acc / count));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage({ buffer: int16.buffer, rms }, [int16.buffer]);
    return true;
  }
}
registerProcessor('pcm-downsampler-processor', PcmDownsamplerProcessor);
`;

let workletBlobUrl = null;

export function getWorkletBlobUrl() {
  if (!workletBlobUrl && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
    const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
    workletBlobUrl = URL.createObjectURL(blob);
  }
  return workletBlobUrl;
}

/**
 * Creates an AudioWorkletNode or falls back to ScriptProcessorNode
 */
export async function createAudioDownsamplerNode(audioCtx, onPcmChunk, targetSampleRate = 16000) {
  if (audioCtx.audioWorklet && typeof audioCtx.audioWorklet.addModule === 'function') {
    try {
      const blobUrl = getWorkletBlobUrl();
      await audioCtx.audioWorklet.addModule(blobUrl);
      const workletNode = new AudioWorkletNode(audioCtx, 'pcm-downsampler-processor', {
        processorOptions: { targetSampleRate },
      });
      workletNode.port.onmessage = (e) => {
        if (e.data && onPcmChunk) {
          if (e.data instanceof ArrayBuffer) {
            onPcmChunk(new Uint8Array(e.data), 0);
          } else if (e.data.buffer) {
            onPcmChunk(new Uint8Array(e.data.buffer), e.data.rms || 0);
          }
        }
      };
      return { node: workletNode, isWorklet: true };
    } catch (err) {
      console.warn('[AudioWorklet] Fallback to ScriptProcessor due to:', err.message);
    }
  }

  // Fallback for environments where AudioWorklet is unavailable
  const inputRate = audioCtx.sampleRate || 48000;
  const processor = audioCtx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    const rms = Math.sqrt(sum / input.length);

    const ratio = inputRate / targetSampleRate;
    const outLen = Math.max(1, Math.floor(input.length / ratio));
    const int16 = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.min(input.length, Math.floor((i + 1) * ratio) || start + 1);
      let acc = 0;
      const count = Math.max(1, end - start);
      for (let j = start; j < end; j++) acc += input[j];
      const s = Math.max(-1, Math.min(1, acc / count));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    if (onPcmChunk) {
      onPcmChunk(new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength), rms);
    }
  };
  return { node: processor, isWorklet: false };
}
