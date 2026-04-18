import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are in a web worker environment
env.allowLocalModels = false;

let transcriber = null;

async function initTranscriber() {
    if (transcriber === null) {
        // Revert to tiny for absolute stability
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
            quantized: true,
            progress_callback: (p) => {
                if (p.status === 'progress') {
                    self.postMessage({ status: 'progress', progress: p.progress });
                }
            }
        });
    }
    return transcriber;
}

function normalizeAudio(audio) {
    let max = 0;
    for (let i = 0; i < audio.length; ++i) {
        max = Math.max(max, Math.abs(audio[i]));
    }
    if (max > 0 && max < 0.1) {
        // Only boost if it's very quiet (avoid over-amplifying noise)
        const gain = 0.5 / max;
        for (let i = 0; i < audio.length; ++i) {
            audio[i] *= gain;
        }
    }
    return audio;
}

self.onmessage = async (event) => {
    const message = event.data;
    
    if (message.type === 'init') {
        try {
            await initTranscriber();
            self.postMessage({ status: 'ready' });
        } catch (e) {
            self.postMessage({ status: 'error', error: e.message });
        }
    } 
    else if (message.type === 'transcribe') {
        try {
            const transcriber = await initTranscriber();
            
            // Normalize audio before inference to help Whisper hear better
            const normalizedAudio = normalizeAudio(message.audio);
            
            const result = await transcriber(normalizedAudio, {
                // Whisper defaults are usually best
            });
            self.postMessage({ status: 'result', text: result.text });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
};
