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
          // Send the full chunk to the main thread
          this.port.postMessage(this.buffer);
          this.ptr = 0;
          // Note: We should technically clone or create a new buffer to avoid race conditions, 
          // but for simple cases like this, postMessage clones it or we can re-allocate.
          this.buffer = new Float32Array(this.bufferSize);
        }
      }
    }
    return true;
  }
}
registerProcessor('audio-processor', AudioProcessor);