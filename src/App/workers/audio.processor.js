// AudioWorklet to capture and stream audio buffers
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // Faster streaming for lower latency
    this.buffer = new Float32Array(this.bufferSize);
    this.ptr = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      for (let i = 0; i < channelData.length; ++i) {
        this.buffer[this.ptr++] = channelData[i];
        
        if (this.ptr >= this.bufferSize) {
          // Calculate RMS for basic VAD
          let sum = 0;
          for (let j = 0; j < this.buffer.length; j++) {
            sum += this.buffer[j] * this.buffer[j];
          }
          const rms = Math.sqrt(sum / this.buffer.length);
          const isSpeaking = rms > 0.001; // Ultra-sensitive threshold for all mics

          // Send chunk + volume info to main thread
          this.port.postMessage({
            audio: this.buffer,
            isSpeaking: isSpeaking,
            rms: rms
          });

          this.ptr = 0;
          this.buffer = new Float32Array(this.bufferSize);
        }
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
