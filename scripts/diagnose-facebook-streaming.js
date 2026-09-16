#!/usr/bin/env node
/**
 * Facebook RTMPS Streaming Diagnostic
 * 
 * Tests whether h264_videotoolbox CBR parameters affect RTMPS stability.
 * Compares current OCS config (missing -bufsize, -sc_threshold 0) vs fixed config.
 */

const { spawn, spawnSync } = require('child_process');
const net = require('net');

function findFFmpeg() {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
  for (const c of candidates) {
    const r = spawnSync(c.includes('/') ? c : 'which', c.includes('/') ? ['--version'] : [c], { timeout: 5000 });
    if (r.status === 0) return c.includes('/') ? c : r.stdout.toString().trim();
  }
  return 'ffmpeg';
}

async function runDiagnostic() {
  const ffmpegBin = findFFmpeg();
  console.log(`[Diag] FFmpeg: ${ffmpegBin}`);

  const encCheck = spawnSync(ffmpegBin, ['-encoders'], { timeout: 5000 });
  const hasVT = encCheck.stdout?.toString().includes('h264_videotoolbox');
  console.log(`[Diag] h264_videotoolbox available: ${hasVT}`);
  const encoder = hasVT ? 'h264_videotoolbox' : 'libx264';

  const fps = 30;
  const width = 1280;
  const height = 720;
  const gopSize = fps * 2;
  const bitrate = 4500;

  function buildCurrentArgs(url) {
    const args = [
      '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`, '-r', `${fps}`, '-i', 'pipe:0',
      '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3',
    ];
    if (encoder === 'h264_videotoolbox') {
      args.push('-c:v', encoder, '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-realtime', '1');
    } else {
      args.push('-c:v', encoder, '-preset', 'veryfast', '-tune', 'zerolatency',
        '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`, '-profile:v', 'main');
    }
    args.push('-g', String(gopSize), '-keyint_min', String(gopSize), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-flvflags', 'no_duration_filesize', '-tcp_nodelay', '1',
      '-max_interleave_delta', '1000000', '-rw_timeout', '15000000',
      '-flush_packets', '1', '-f', 'flv', url);
    return args;
  }

  function buildFixedArgs(url) {
    const args = [
      '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba',
      '-s', `${width}x${height}`, '-r', `${fps}`, '-i', 'pipe:0',
      '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:3',
    ];
    if (encoder === 'h264_videotoolbox') {
      args.push('-c:v', encoder, '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`, '-constant_bit_rate', '1', '-realtime', '1', '-profile:v', 'main');
    } else {
      args.push('-c:v', encoder, '-preset', 'veryfast', '-tune', 'zerolatency',
        '-b:v', `${bitrate}k`, '-maxrate', `${bitrate}k`, '-bufsize', `${bitrate * 2}k`,
        '-profile:v', 'main', '-sc_threshold', '0');
    }
    args.push('-g', String(gopSize), '-keyint_min', String(gopSize), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
      '-flvflags', 'no_duration_filesize', '-tcp_nodelay', '1',
      '-max_interleave_delta', '1000000', '-rw_timeout', '30000000',
      '-flush_packets', '1', '-f', 'flv', url);
    return args;
  }

  const testDurationSec = 10;
  console.log(`\n[Diag] Testing with local TCP sink (${testDurationSec}s)...`);

  for (const variant of ['current', 'fixed']) {
    console.log(`\n── ${variant.toUpperCase()} configuration ──`);
    let receivedBytes = 0;
    let lastStderr = [];
    
    await new Promise((resolve) => {
      const server = net.createServer(conn => {
        conn.on('data', c => { receivedBytes += c.length; });
        conn.on('error', () => {});
      });
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        const url = `rtmp://127.0.0.1:${port}/live/test`;
        const args = variant === 'current' ? buildCurrentArgs(url) : buildFixedArgs(url);
        
        console.log(`[${variant}] Args count: ${args.length}`);

        const proc = spawn(ffmpegBin, args, { stdio: ['pipe', 'ignore', 'pipe', 'pipe'] });
        proc.stdin.on('error', () => {});
        if (proc.stdio[3]) proc.stdio[3].on('error', () => {});
        proc.stderr.on('data', d => {
          d.toString().split(/[\r\n]+/).filter(l => l.trim()).forEach(l => {
            lastStderr.push(l.trim());
            if (lastStderr.length > 10) lastStderr.shift();
          });
        });

        const frameSize = width * height * 4;
        const audioChunkSize = Math.floor((48000 / fps) * 2 * 2);
        let framesSent = 0;

        const feedInterval = setInterval(() => {
          try {
            proc.stdin.write(Buffer.alloc(frameSize));
            if (proc.stdio[3]) proc.stdio[3].write(Buffer.alloc(audioChunkSize));
            framesSent++;
          } catch (_) {}
        }, 1000 / fps);

        setTimeout(() => {
          clearInterval(feedInterval);
          try { proc.kill('SIGTERM'); } catch (_) {}
        }, testDurationSec * 1000);

        proc.on('exit', (code, signal) => {
          console.log(`[${variant}] Exit: code=${code}, signal=${signal}, frames=${framesSent}, sink=${receivedBytes}b`);
          console.log(`[${variant}] Last stderr:`);
          lastStderr.slice(-5).forEach(l => console.log(`  ${l}`));
          server.close();
          resolve();
        });
      });
    });
  }

  console.log('\n[Diag] Summary of missing Facebook-required parameters in current config:');
  console.log('  1. -bufsize (CBR enforcement) — Facebook rejects VBR after ~2-5 min');
  console.log('  2. -sc_threshold 0 (GOP uniformity) — Random extra keyframes violate GOP');
  console.log('  3. -profile:v main — VideoToolbox may default to high profile');
  console.log('  4. -rw_timeout 15s — Too tight for RTMPS TLS renegotiation (should be 30s)');
}

runDiagnostic().catch(console.error);
