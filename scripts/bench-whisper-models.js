/**
 * Benchmark distil-small vs distil-medium (or any present ggml) for OCS NFRs.
 *
 * Usage:
 *   node scripts/bench-whisper-models.js
 *   node scripts/bench-whisper-models.js --report temp_output/whisper-bench/report.json
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const MODEL_DIR = path.join(ROOT, 'voice_server', 'models', 'whisper');
const args = process.argv.slice(2);
const reportIdx = args.indexOf('--report');
const reportPath = reportIdx >= 0
  ? args[reportIdx + 1]
  : path.join(ROOT, 'temp_output/whisper-bench/report.json');

function rssMb() {
  try {
    if (process.platform === 'darwin') {
      const out = spawnSync('ps', ['-o', 'rss=', '-p', String(process.pid)], { encoding: 'utf8' });
      const kb = parseInt(String(out.stdout || '').trim(), 10);
      if (Number.isFinite(kb)) return kb / 1024;
    }
  } catch (_) {}
  return process.memoryUsage().rss / (1024 * 1024);
}

function listModels() {
  if (!fs.existsSync(MODEL_DIR)) return [];
  return fs.readdirSync(MODEL_DIR)
    .filter((f) => f.startsWith('ggml-') && f.endsWith('.bin') && !/silero/i.test(f))
    .map((f) => {
      const p = path.join(MODEL_DIR, f);
      return { name: f, path: p, bytes: fs.statSync(p).size };
    });
}

function makeToneWavPcm(seconds = 2.5, freq = 220) {
  // Generate Int16 PCM then wrap as minimal WAV for fname path; also return float32
  const n = Math.floor(16000 * seconds);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const env = i < 800 ? i / 800 : i > n - 800 ? (n - i) / 800 : 1;
    const s = Math.sin((2 * Math.PI * freq * i) / 16000) * 0.2 * env;
    pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(s * 32767))), i * 2);
  }
  const float32 = new Float32Array(n);
  for (let i = 0; i < n; i++) float32[i] = pcm.readInt16LE(i * 2) / 32768;
  return { pcm, float32, seconds };
}

async function benchModel(whisper, modelPath) {
  const idleRss = rssMb();
  const tLoad0 = Date.now();
  const { float32 } = makeToneWavPcm(1.0);
  // Cold load
  await whisper.transcribe({
    model: modelPath,
    pcmf32: float32,
    language: 'en',
    use_gpu: true,
    no_prints: true,
    no_timestamps: true,
    translate: false,
    initial_prompt: 'Bible books: Genesis John Colossians Thessalonians Philippians Habakkuk.',
  });
  const loadMs = Date.now() - tLoad0;
  const afterLoadRss = rssMb();

  const latencies = [];
  for (let i = 0; i < 5; i++) {
    const { float32: f } = makeToneWavPcm(2.5 + i * 0.1);
    const t0 = Date.now();
    await whisper.transcribe({
      model: modelPath,
      pcmf32: f,
      language: 'en',
      use_gpu: true,
      no_prints: true,
      no_timestamps: true,
      translate: false,
    });
    latencies.push(Date.now() - t0);
  }
  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)];
  const activeRss = rssMb();

  return {
    loadMs,
    latenciesMs: latencies,
    latencyP50Ms: latencies[Math.floor(latencies.length / 2)],
    latencyP95Ms: p95,
    idleRssMb: idleRss,
    afterLoadRssMb: afterLoadRss,
    activeRssMb: activeRss,
    deltaRssMb: activeRss - idleRss,
    nfr4_load_lt_3s: loadMs < 3000,
    nfr1_p95_lt_3s: p95 < 3000,
  };
}

async function main() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const models = listModels();
  const diskBytes = models.reduce((s, m) => s + m.bytes, 0);
  const report = {
    generatedAt: new Date().toISOString(),
    host: {
      platform: process.platform,
      arch: process.arch,
      totalMemGb: +(os.totalmem() / 1024 ** 3).toFixed(2),
      cpus: os.cpus()?.[0]?.model,
    },
    licensing: {
      whisperCpp: 'MIT (ggml-org/whisper.cpp)',
      distilWhisper: 'MIT (inherits OpenAI Whisper MIT — commercial use permitted)',
      sileroVad: 'Confirm at download — ggml-org whisper-vad typically MIT',
    },
    modelsFound: models,
    diskFootprintMb: +(diskBytes / 1e6).toFixed(1),
    results: [],
    recommendation: null,
    nfrRebaseline: null,
    goNoGo: null,
  };

  if (!models.length) {
    report.goNoGo = 'NO-GO';
    report.recommendation = 'No ggml models in voice_server/models/whisper — run npm run setup:voice (or scripts/download-whisper-models.js). Network must reach HuggingFace.';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.error(report.recommendation);
    console.log('Wrote', reportPath);
    process.exitCode = 2;
    return;
  }

  let whisper;
  try {
    // Prefer local loader (darwin→mac-arm64 + rpath patch); package main looks for darwin-*
    whisper = require('../src/main/whisperAddon');
  } catch (e) {
    try {
      whisper = require('@kutalia/whisper-node-addon');
    } catch (e2) {
      report.goNoGo = 'NO-GO';
      report.recommendation = `whisper-node-addon load failed: ${e2.message}`;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.error(report.recommendation);
      process.exitCode = 1;
      return;
    }
  }

  for (const m of models) {
    console.log('\n=== Bench', m.name, '===');
    try {
      const r = await benchModel(whisper, m.path);
      report.results.push({ model: m.name, bytes: m.bytes, ...r });
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      report.results.push({ model: m.name, error: e.message });
      console.error('FAIL', m.name, e.message);
    }
  }

  const small = report.results.find((r) => /distil-small/.test(r.model) && !r.error);
  const medium = report.results.find((r) => /distil-medium/.test(r.model) && !r.error);
  const anyOk = report.results.find((r) => !r.error && r.nfr1_p95_lt_3s && r.nfr4_load_lt_3s);

  if (small && small.nfr1_p95_lt_3s && small.nfr4_load_lt_3s) {
    report.recommendation = 'SHIP DEFAULT: distil-small.en (meets NFR-1 and NFR-4 on this host)';
    report.goNoGo = 'CONDITIONAL-GO'; // accuracy suite still required
  } else if (medium && medium.nfr1_p95_lt_3s && medium.nfr4_load_lt_3s) {
    report.recommendation = 'SHIP DEFAULT: distil-medium.en (small missed latency/load gates)';
    report.goNoGo = 'CONDITIONAL-GO';
  } else if (anyOk) {
    report.recommendation = `SHIP FALLBACK MODEL: ${anyOk.model} until distil weights available`;
    report.goNoGo = 'CONDITIONAL-GO';
  } else {
    report.recommendation = 'NO-GO: no model met NFR-1/NFR-4 — keep Vosk as default';
    report.goNoGo = 'NO-GO';
  }

  const pick = small || medium || anyOk;
  report.nfrRebaseline = {
    'NFR-4 model load': pick ? `${pick.loadMs}ms (target <3000)` : 'n/a',
    'NFR-1 utterance P95': pick ? `${pick.latencyP95Ms}ms (target <3000)` : 'n/a',
    'NFR-20 disk whisper models': `${report.diskFootprintMb} MB ggml (+ app)`,
    'NFR-23/24 note': 'Electron 3-window baseline dominates; whisper deltaRss measured here',
    whisperDeltaRssMb: pick?.deltaRssMb,
    activeRssMb: pick?.activeRssMb,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('\nRecommendation:', report.recommendation);
  console.log('Go/No-Go:', report.goNoGo);
  console.log('Wrote', reportPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
