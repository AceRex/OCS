/**
 * OCS Whisper Worker v3 — Optimized Binary Bridge + Python Reference Matching
 *
 * Primary engine: Python faster-whisper sidecar on http://127.0.0.1:5421
 * Fallback engine: @xenova/transformers (WASM) — only used if sidecar is unreachable.
 *
 * Optimizations:
 * 1. Uses raw binary (Float32Array buffer) for audio transfer to Python (no JSON overhead).
 * 2. Integrates Python-based Bible reference matching for instant triggers.
 */

import { pipeline, env } from '@xenova/transformers';

// ── Config ──────────────────────────────────────────────────────────────────
const SIDECAR_URL = 'http://127.0.0.1:5421';
const SIDECAR_HEALTH_TIMEOUT_MS = 2000;
const SIDECAR_TRANSCRIBE_TIMEOUT_MS = 10000;
const PROBE_TIMEOUT_MS = 4000;

const OCS_TRIGGER_WORDS = ["ocs", "o.c.s", "o c s", "oasis", "obvious", "osiris", "ocean", "media", "meeting", "meter", "medium", "video"];

// ── State ────────────────────────────────────────────────────────────────────
let activeEngine = null;       // 'python' | 'wasm' | null
let wasmTranscriber = null;    // @xenova pipeline (lazy)
let sidecarHealthy = false;

// ── Utility: fetch with timeout ───────────────────────────────────────────────
function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ── Python sidecar health check ───────────────────────────────────────────────
async function checkSidecarHealth() {
    try {
        const res = await fetchWithTimeout(`${SIDECAR_URL}/health`, { method: 'GET' }, SIDECAR_HEALTH_TIMEOUT_MS);
        if (res.ok) { sidecarHealthy = true; return true; }
    } catch (_) {}
    sidecarHealthy = false;
    return false;
}

// ── WASM engine initialization ───────────────────────────────────────────────
async function initWasm() {
    if (wasmTranscriber) return;
    env.allowLocalModels = false;
    wasmTranscriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en');
}

// ── Main message handler ─────────────────────────────────────────────────────
self.onmessage = async (event) => {
    const message = event.data;

    if (message.type === 'init') {
        const healthy = await checkSidecarHealth();
        if (healthy) {
            activeEngine = 'python';
            self.postMessage({ status: 'ready', engine: 'python' });
        } else {
            console.warn("[WORKER] Python sidecar not found. Loading WASM fallback...");
            await initWasm();
            activeEngine = 'wasm';
            self.postMessage({ status: 'ready', engine: 'wasm' });
        }
        return;
    }

    if (message.type === 'probe') {
        const audio = message.audio;
        try {
            if (activeEngine === 'python') {
                const formData = new FormData();
                formData.append('audio', new Blob([audio.buffer], { type: 'application/octet-stream' }));

                const res = await fetchWithTimeout(`${SIDECAR_URL}/probe`, {
                    method: 'POST',
                    body: formData
                }, PROBE_TIMEOUT_MS);
                
                if (res.ok) {
                    const data = await res.json();
                    self.postMessage({
                        status: 'probe_result',
                        hasKeyword: data.hasKeyword,
                        text: data.text,
                        bible_match: data.bible_match,
                        engine: 'python'
                    });
                    return;
                }
            }
            
            // WASM Fallback for probe
            if (!wasmTranscriber) await initWasm();
            const result = await wasmTranscriber(audio, { chunk_length_s: 30, stride_length_s: 5 });
            const text = result.text.toLowerCase();
            const hasKeyword = OCS_TRIGGER_WORDS.some(kw => text.includes(kw));
            self.postMessage({ status: 'probe_result', hasKeyword, text, engine: 'wasm' });
        } catch (e) {
            self.postMessage({ status: 'probe_result', hasKeyword: false, text: '', engine: activeEngine });
        }
        return;
    }

    if (message.type === 'transcribe') {
        const audio = message.audio;
        const prompt = message.prompt || '';
        try {
            if (activeEngine === 'python') {
                const formData = new FormData();
                formData.append('audio', new Blob([audio.buffer], { type: 'application/octet-stream' }));
                formData.append('prompt', prompt);

                const res = await fetchWithTimeout(`${SIDECAR_URL}/transcribe`, {
                    method: 'POST',
                    body: formData
                }, SIDECAR_TRANSCRIBE_TIMEOUT_MS);
                
                if (res.ok) {
                    const data = await res.json();
                    self.postMessage({
                        status: 'result',
                        text: data.text,
                        confidence: data.confidence,
                        avg_logprob: data.avg_logprob,
                        bible_match: data.bible_match,
                        engine: 'python',
                        debug: { latency: data.latency_sec }
                    });
                    return;
                }
            }
            
            // WASM Fallback for transcription
            if (!wasmTranscriber) await initWasm();
            const result = await wasmTranscriber(audio, { chunk_length_s: 30, stride_length_s: 5 });
            self.postMessage({
                status: 'result',
                text: result.text,
                confidence: 0.8,
                avg_logprob: -0.5,
                engine: 'wasm',
                debug: { wasm: true }
            });
        } catch (e) {
            self.postMessage({ status: 'error', error: e.message });
        }
    }
};
