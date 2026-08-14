/**
 * Short ASR soak — continuous silence + periodic synthetic utterances.
 * Full 3h can be requested with --hours 3; default 5 minutes for CI/dev.
 *
 * Usage:
 *   node scripts/soak-asr.js
 *   node scripts/soak-asr.js --hours 0.1
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const hours = (() => {
  const i = process.argv.indexOf('--hours');
  return i >= 0 ? parseFloat(process.argv[i + 1]) : 5 / 60;
})();

async function main() {
  const { AsrFacade } = require(path.join(ROOT, 'src/main/asrFacade'));
  const facade = new AsrFacade(ROOT);
  const state = await facade.initialize();
  console.log('[soak] engine', state.asrEngine, state.status, state.model?.name);

  if (state.status === 'error') {
    console.error('[soak] init failed', state.error);
    process.exit(1);
  }

  facade.startSession();
  const start = Date.now();
  const end = start + hours * 3600 * 1000;
  const samples = [];
  let packets = 0;

  facade.on('transcript', (p) => {
    samples.push({ t: Date.now() - start, text: p.text, role: p.role, conf: p.confidence });
  });

  // 20ms frames of near-silence with occasional tone bursts
  const frame = Buffer.alloc(640); // 20ms @ 16k int16
  while (Date.now() < end) {
    if (packets % 250 === 0) {
      // ~every 5s inject a soft tone burst (won't be speech but exercises path)
      for (let i = 0; i < frame.length / 2; i++) {
        frame.writeInt16LE(Math.floor(Math.sin(i / 8) * 800), i * 2);
      }
    } else {
      frame.fill(0);
    }
    facade.pushAudio(frame);
    packets += 1;
    if (packets % 1000 === 0) {
      const rss = process.memoryUsage().rss / 1024 / 1024;
      console.log(`[soak] ${(Date.now() - start) / 1000}s packets=${packets} rss=${rss.toFixed(1)}MB transcripts=${samples.length}`);
    }
    await new Promise((r) => setTimeout(r, 20));
  }

  facade.stopSession();
  facade.shutdown();
  const out = path.join(ROOT, 'temp_output/whisper-bench/soak.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({
    hours,
    packets,
    transcripts: samples.length,
    finalRssMb: process.memoryUsage().rss / 1024 / 1024,
    engine: state.asrEngine,
  }, null, 2));
  console.log('[soak] done →', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
