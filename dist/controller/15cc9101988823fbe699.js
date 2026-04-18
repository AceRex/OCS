"use strict";

// AudioWorklet to capture and stream audio buffers
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // Stream in decent sized chunks
    this.buffer = new Float32Array(this.bufferSize);
    this.ptr = 0;
  }
  process(inputs, outputs, parameters) {
    var input = inputs[0];
    if (input.length > 0) {
      var channelData = input[0];
      for (var i = 0; i < channelData.length; ++i) {
        this.buffer[this.ptr++] = channelData[i];
        if (this.ptr >= this.bufferSize) {
          var rms = Math.sqrt(sum / this.buffer.length);
          var isSpeaking = rms > 0.001; // Ultra-sensitive threshold for all mics

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