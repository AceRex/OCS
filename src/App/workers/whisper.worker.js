import { pipeline, env } from '@xenova/transformers';

env.allowLocalModels = false;

let transcriber = null;

async function initTranscriber() {
    if (transcriber === null) {
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
    if (max > 0.01) {
        const gain = 0.9 / max;
        for (let i = 0; i < audio.length; ++i) {
            audio[i] = Math.max(-1, Math.min(1, audio[i] * gain));
        }
    }
    return audio;
}

/**
 * Heuristic confidence score — @xenova/transformers does not expose raw
 * log-probs via the public pipeline API, so we proxy from text quality.
 * Returns 0.0–1.0. Threshold in Topbar.js is 0.65.
 */
function estimateConfidence(text, durationSec) {
    if (!text || text.trim().length === 0) return 0;
    const trimmed = text.trim();

    // Transcription that is only punctuation / symbols = noise
    const words = trimmed.split(/\s+/).filter(w => /[a-zA-Z]{2,}/.test(w));
    if (words.length === 0) return 0.1;

    // Words-per-second sanity check: normal speech is ~1.5–4 WPS
    const wps = words.length / Math.max(durationSec, 0.5);
    if (wps > 9 || wps < 0.2) return 0.25;

    // Very short single-word result on a long audio clip → likely noise
    if (words.length === 1 && durationSec > 2.5) return 0.35;

    // Text dominated by repeated chars = model hallucination (e.g. "........")
    const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s/g, '')).size;
    if (uniqueChars < 4) return 0.2;

    return 0.85; // Looks like genuine speech
}

// Dual trigger word system — both "Media" and "OCS" are valid keywords
const OCS_TRIGGERS = [
    // OCS variants
    'ocs', 'o.c.s', 'o-c-s', 'o c s',
    'oasis', 'obvious', 'osiris', 'ocean',
    'oh see', 'oh-see', 'ok see', 'oc-s', 'oc s',
    // Media variants
    'media', 'meeting', 'meter', 'medium', 'video', 'median',
    'me the', 'need a', 'meet a',
];

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
        // Lightweight mid-speech keyword scan (~100-150ms on 2s audio)
        try {
            const tc = transcriber;
            if (!tc) { self.postMessage({ status: 'probe_result', hasKeyword: false, text: '' }); return; }
            const probeAudio = normalizeAudio(message.audio);
            const result = await tc(probeAudio, {
                language: 'english',
                task: 'transcribe',
                return_timestamps: false,
                initial_prompt: 'OCS. Oasis. Ocean. Media. Meeting.',
            });
            const text = (result.text || '').toLowerCase();
            const hasKeyword = OCS_TRIGGERS.some(kw => text.includes(kw));
            self.postMessage({ status: 'probe_result', hasKeyword, text: result.text || '' });
        } catch (e) {
            self.postMessage({ status: 'probe_result', hasKeyword: false, text: '' });
        }
    }
    else if (message.type === 'transcribe') {
        try {
            const transcriber = await initTranscriber();

            let max = 0;
            for (let i = 0; i < message.audio.length; i++) {
                max = Math.max(max, Math.abs(message.audio[i]));
            }

            const durationSec = message.audio.length / 16000;
            console.log(`[WORKER] Transcribing: vol=${max.toFixed(4)}, dur=${durationSec.toFixed(1)}s`);

            const normalizedAudio = normalizeAudio(message.audio);

            // Use short prompt only — long prompt adds decode overhead
            const biblePrompt = message.prompt
                ? `OCS. Media. ${message.prompt.substring(0, 80)}`
                : 'OCS. Media. Genesis Psalms Matthew John Romans Revelation.';

            const result = await transcriber(normalizedAudio, {
                // Do NOT set chunk_length_s / stride_length_s for short clips.
                // Those params force a 30s sliding-window even on 3s audio — huge overhead.
                language: 'english',
                task: 'transcribe',
                return_timestamps: false,
                initial_prompt: biblePrompt,
            });

            const confidence = estimateConfidence(result.text, durationSec);

            self.postMessage({
                status: 'result',
                text: result.text,
                confidence,
                debug: { vol: max, duration: durationSec }
            });
        } catch (error) {
            self.postMessage({ status: 'error', error: error.message });
        }
    }
};
