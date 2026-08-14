/**
 * Optional AI helpers (Ollama chat + Piper TTS) — no Python required.
 * Voice ASR is handled by voskEngine.js; these are secondary features.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

const OLLAMA_HOST = '127.0.0.1';
const OLLAMA_PORT = 11434;

function httpJson(method, hostname, port, urlPath, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const req = http.request({
      hostname,
      port,
      path: urlPath,
      method,
      headers: data
        ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        : {},
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(buf.toString()); } catch (_) {}
        resolve({ status: res.statusCode, body: buf, json, contentType: res.headers['content-type'] || '' });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (data) req.write(data);
    req.end();
  });
}

async function ollamaStatus() {
  try {
    const r = await httpJson('GET', OLLAMA_HOST, OLLAMA_PORT, '/api/tags', null, 2000);
    if (r.status !== 200 || !r.json) return { running: false, models: [], model: null };
    const models = (r.json.models || []).map((m) => m.name);
    return { running: true, models, model: models[0] || null };
  } catch (_) {
    return { running: false, models: [], model: null };
  }
}

async function ollamaChat({ prompt, system, model, timeoutMs = 60000 }) {
  const status = await ollamaStatus();
  if (!status.running) return { ok: false, error: 'Ollama not running' };
  const modelName = (model && status.models.includes(model)) ? model : (status.model || 'llama3.2');
  const start = Date.now();
  const r = await httpJson('POST', OLLAMA_HOST, OLLAMA_PORT, '/api/chat', {
    model: modelName,
    messages: [
      { role: 'system', content: system || 'You are a helpful church media assistant for OCS.' },
      { role: 'user', content: prompt },
    ],
    stream: false,
  }, timeoutMs);
  if (r.status !== 200 || !r.json) {
    return { ok: false, error: (r.json && r.json.error) || 'Chat failed' };
  }
  const text = (r.json.message && r.json.message.content || '').trim();
  return { ok: true, response: text, latency: +( (Date.now() - start) / 1000 ).toFixed(2), model: modelName };
}

function resolvePiper(rootDir) {
  const IS_WIN = process.platform === 'win32';
  const binName = IS_WIN ? 'piper.exe' : 'piper';
  const bundled = path.join(rootDir, 'voice_server', 'piper', binName);
  if (fs.existsSync(bundled)) return bundled;
  return null;
}

function resolvePiperVoice(rootDir, voice = 'en_US-amy-medium') {
  const base = path.join(rootDir, 'voice_server', 'piper_voices', voice);
  const onnx = `${base}.onnx`;
  const cfg = `${base}.onnx.json`;
  if (fs.existsSync(onnx) && fs.existsSync(cfg)) return { onnx, cfg };
  // Some installs use .json without .onnx prefix in name
  const cfgAlt = `${base}.json`;
  if (fs.existsSync(onnx) && fs.existsSync(cfgAlt)) return { onnx, cfg: cfgAlt };
  return null;
}

function piperAvailable(rootDir) {
  return !!(resolvePiper(rootDir) && resolvePiperVoice(rootDir));
}

async function piperSpeak(rootDir, text, voice) {
  const bin = resolvePiper(rootDir);
  if (!bin) return { ok: false, error: 'Piper binary not found. Run: npm run setup:voice' };
  const voiceFiles = resolvePiperVoice(rootDir, voice || 'en_US-amy-medium');
  if (!voiceFiles) return { ok: false, error: 'Piper voice model not found. Run: npm run setup:voice' };

  const outPath = path.join(os.tmpdir(), `ocs-piper-${crypto.randomBytes(8).toString('hex')}.wav`);

  await new Promise((resolve, reject) => {
    const child = spawn(bin, [
      '--model', voiceFiles.onnx,
      '--config', voiceFiles.cfg,
      '--output_file', outPath,
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Piper exited ${code}`));
    });
    child.stdin.write(text);
    child.stdin.end();
  });

  try {
    const wav = await fs.promises.readFile(outPath);
    return { ok: true, audio: wav.toString('base64') };
  } finally {
    fs.promises.unlink(outPath).catch(() => {});
  }
}

module.exports = {
  ollamaStatus,
  ollamaChat,
  piperAvailable,
  piperSpeak,
};
