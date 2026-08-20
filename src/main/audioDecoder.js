/**
 * Audio decoder utility:
 * Transcodes arbitrary audio buffers (m4a, webm, wav, mp3, ogg, aac)
 * into raw 16kHz 16-bit Mono Little-Endian PCM expected by Whisper / Vosk.
 */
const { spawn } = require('child_process');
const { getFfmpegPath } = require('./sessionAudio');

async function decodeAudioToPcm16k(inputBuffer) {
  if (!Buffer.isBuffer(inputBuffer)) {
    inputBuffer = Buffer.from(inputBuffer);
  }

  // Check if buffer is already raw PCM or very short
  if (inputBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    console.warn('[AudioDecoder] FFmpeg not found, returning raw buffer fallback');
    // If it's a WAV file with RIFF header, strip the 44-byte header
    if (inputBuffer.length > 44 && inputBuffer.toString('utf8', 0, 4) === 'RIFF') {
      return inputBuffer.slice(44);
    }
    return inputBuffer;
  }

  return new Promise((resolve, reject) => {
    // spawn ffmpeg reading from stdin, writing s16le 16kHz mono to stdout
    const proc = spawn(ffmpegPath, [
      '-i', 'pipe:0',
      '-ar', '16000',
      '-ac', '1',
      '-f', 's16le',
      'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    const chunks = [];
    const errorChunks = [];

    proc.stdout.on('data', (data) => chunks.push(data));
    proc.stderr.on('data', (data) => errorChunks.push(data));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        const errStr = Buffer.concat(errorChunks).toString('utf8');
        console.warn(`[AudioDecoder] FFmpeg exit code ${code}: ${errStr}`);
        // Fallback to original buffer if decode fails
        resolve(inputBuffer);
      }
    });

    proc.on('error', (err) => {
      console.warn('[AudioDecoder] FFmpeg error:', err.message);
      resolve(inputBuffer);
    });

    proc.stdin.on('error', () => {});
    proc.stdin.write(inputBuffer);
    proc.stdin.end();
  });
}

module.exports = {
  decodeAudioToPcm16k,
};
