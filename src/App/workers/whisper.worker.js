import { pipeline, env } from '@xenova/transformers';

// Skip local model checks since we are in a web worker environment
env.allowLocalModels = false;

let transcriber = null;

async function initTranscriber() {
    if (transcriber === null) {
        // whisper-base.en gives far better accuracy on proper nouns (Bible books)
        // while still being fast enough for real-time use
        transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en', {
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

// Always peak-normalize so Whisper receives a consistent ~0.9 peak signal
function normalizeAudio(audio) {
    let max = 0;
    for (let i = 0; i < audio.length; ++i) {
        max = Math.max(max, Math.abs(audio[i]));
    }
    if (max > 0.01) { // Only normalize non-silent audio
        const gain = 0.9 / max;
        for (let i = 0; i < audio.length; ++i) {
            // Clamp to [-1, 1] to avoid distortion after gain
            audio[i] = Math.max(-1, Math.min(1, audio[i] * gain));
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
    else if (message.type === 'probe') {
        // Lightweight keyword scan while user is still speaking.
        // Runs in ~100-150ms on 2s audio — intentionally minimal prompt.
        try {
            const tc = transcriber; // Don't block on init; if not ready, skip.
            if (!tc) { self.postMessage({ status: 'probe_result', hasKeyword: false, text: '' }); return; }
            const probeAudio = normalizeAudio(message.audio);
            const result = await tc(probeAudio, {
                language: 'english',
                task: 'transcribe',
                return_timestamps: false,
                initial_prompt: 'Media. Meeting. Video. Meter.',
            });
            const text = (result.text || '').toLowerCase();
            const TRIGGERS = ['media', 'meeting', 'meter', 'medium', 'video', 'median', 'me the', 'need a', 'meet a'];
            const hasKeyword = TRIGGERS.some(kw => text.includes(kw));
            self.postMessage({ status: 'probe_result', hasKeyword, text: result.text || '' });
        } catch (e) {
            // Probe failure is silent — falls back to normal VAD detection
            self.postMessage({ status: 'probe_result', hasKeyword: false, text: '' });
        }
    }
    else if (message.type === 'transcribe') {
        try {
            const transcriber = await initTranscriber();
            
            // Normalize audio before inference to help Whisper hear better
            let max = 0;
            for (let i = 0; i < message.audio.length; i++) {
                max = Math.max(max, Math.abs(message.audio[i]));
            }
            
            const durationSec = message.audio.length / 16000;
            
            // Log diagnostics to hidden console
            console.log(`[WORKER] Transcribing: vol=${max.toFixed(4)}, dur=${durationSec.toFixed(1)}s`);

            const normalizedAudio = normalizeAudio(message.audio);

            // Build an initial_prompt to heavily bias the decoder toward:
            // - The "Media" trigger keyword
            // - Common Bible book names and navigation words
            // This dramatically improves recognition of proper nouns.
            const biblePrompt = message.prompt
                ? `Media. ${message.prompt}`
                : 'Media. Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs Ecclesiastes Isaiah Jeremiah Ezekiel Daniel Hosea Amos Obadiah Jonah Micah Nahum Habakkuk Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Romans Corinthians Galatians Ephesians Philippians Colossians Thessalonians Timothy Titus Philemon Hebrews James Peter Revelation. Chapter verse highlight next previous.';

            const result = await transcriber(normalizedAudio, {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: 'english',
                task: 'transcribe',
                return_timestamps: false,
                // initial_prompt biases the decoder without forcing specific tokens
                initial_prompt: biblePrompt,
            });
            
            self.postMessage({ 
                status: 'result', 
                text: result.text,
                debug: { 
                    vol: max, 
                    duration: durationSec 
                }
            });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
};
