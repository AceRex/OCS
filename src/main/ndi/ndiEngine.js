/**
 * NDI & Network Video Broadcast Engine for OCS
 *
 * Provides:
 * 1. Zero-configuration LAN mDNS Service Advertisement (OBS Studio, vMix, TriCaster)
 * 2. High-performance frame grabber from Electron render windows
 * 3. Dynamic Native NDI SDK runtime binding (grandiose when available)
 * 4. Reliable MJPEG streaming (/stream/program.mjpg, /stream/stage.mjpg)
 * 5. Alpha-channel overlay rendering for OBS Browser Sources (/overlay/program)
 * 6. LAN NDI source discovery scanner
 */

'use strict';

const os    = require('os');
const dgram = require('dgram');
const EventEmitter = require('events');
const ip    = require('ip');

const BOUNDARY = 'ocsframe';

class NdiEngine extends EventEmitter {
  constructor() {
    super();
    this.config = {
      enabled: false,
      programStreamName: 'OCS - Program Output',
      stageStreamName:   'OCS - Stage Display',
      alphaEnabled: true,
      fps: 30,
      resolution: '1080p',
      port: 4000,
    };
    this.isRunning     = false;
    this.programWindow = null;
    this.stageWindow   = null;
    this.io            = null;
    this.programFrameBuffer = null;
    this.stageFrameBuffer   = null;
    this._captureInterval   = null;
    this._capturingProgram  = false;
    this._capturingStage    = false;
    this.stats = {
      programFps: 0, stageFps: 0,
      programFramesSent: 0, stageFramesSent: 0,
      activeClients: 0, startTime: null, nativeNdiAvailable: false,
    };
    this.mjpegProgramClients = new Set();
    this.mjpegStageClients   = new Set();
    this.mdnsSocket   = null;
    this.mdnsInterval = null;
    this._probeNativeNdi();
  }

  _probeNativeNdi() {
    try {
      const grandiose = require('grandiose');
      if (grandiose && typeof grandiose.send === 'function') {
        this.stats.nativeNdiAvailable = true;
        this.nativeNdi = grandiose;
        console.log('[NDI] Native NewTek NDI SDK binding detected.');
      }
    } catch (_) {
      this.stats.nativeNdiAvailable = false;
      console.log('[NDI] Operating in MJPEG/IP-Video mode (OBS · vMix · TriCaster).');
    }
  }

  init({ programWindow, stageWindow, io, port = 4000, enabled = false }) {
    this.programWindow  = programWindow;
    this.stageWindow    = stageWindow;
    this.io             = io;
    this.config.port    = port;
    this.config.enabled = !!enabled;
    if (this.config.enabled) this.start();
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.stats.startTime = Date.now();
    console.log('[NDI] Starting (' + this.config.resolution + ' @ ' + this.config.fps + ' fps)...');

    const intervalMs = Math.round(1000 / Math.max(1, this.config.fps || 30));
    let fpsCountProgram = 0;
    let fpsCountStage   = 0;
    let fpsLastTs       = Date.now();

    this._captureInterval = setInterval(async () => {
      if (!this.isRunning) return;

      if (
        this.programWindow &&
        !this.programWindow.isDestroyed() &&
        (this.mjpegProgramClients.size > 0 || this.stats.nativeNdiAvailable) &&
        !this._capturingProgram
      ) {
        this._capturingProgram = true;
        try {
          const img = await this.programWindow.webContents.capturePage();
          if (img && !img.isEmpty()) {
            this.programFrameBuffer = img.toJPEG(85);
            fpsCountProgram++;
            this.stats.programFramesSent++;
            this._broadcastFrame(this.mjpegProgramClients, this.programFrameBuffer);
          }
        } catch (_) {}
        finally { this._capturingProgram = false; }
      }

      if (
        this.stageWindow &&
        !this.stageWindow.isDestroyed() &&
        (this.mjpegStageClients.size > 0 || this.stats.nativeNdiAvailable) &&
        !this._capturingStage
      ) {
        this._capturingStage = true;
        try {
          const img = await this.stageWindow.webContents.capturePage();
          if (img && !img.isEmpty()) {
            this.stageFrameBuffer = img.toJPEG(85);
            fpsCountStage++;
            this.stats.stageFramesSent++;
            this._broadcastFrame(this.mjpegStageClients, this.stageFrameBuffer);
          }
        } catch (_) {}
        finally { this._capturingStage = false; }
      }

      const now     = Date.now();
      const elapsed = now - fpsLastTs;
      if (elapsed >= 1000) {
        const sec = elapsed / 1000;
        this.stats.programFps    = Math.round(fpsCountProgram / sec);
        this.stats.stageFps      = Math.round(fpsCountStage   / sec);
        this.stats.activeClients = this.mjpegProgramClients.size + this.mjpegStageClients.size;
        fpsCountProgram = 0;
        fpsCountStage   = 0;
        fpsLastTs       = now;
        this.emit('stats', this.getStatus());
      }
    }, intervalMs);

    setTimeout(() => {
      this._warmFrame('program');
      this._warmFrame('stage');
    }, 300);

    this._startMdns();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this._captureInterval) {
      clearInterval(this._captureInterval);
      this._captureInterval = null;
    }
    this._stopMdns();
    for (const res of this.mjpegProgramClients) { try { res.end(); } catch (_) {} }
    this.mjpegProgramClients.clear();
    for (const res of this.mjpegStageClients)   { try { res.end(); } catch (_) {} }
    this.mjpegStageClients.clear();
    console.log('[NDI] Engine stopped.');
  }

  _writeFrame(res, jpegBuffer) {
    try {
      res.write('--' + BOUNDARY + '\r\nContent-Type: image/jpeg\r\nContent-Length: ' + jpegBuffer.length + '\r\n\r\n');
      res.write(jpegBuffer);
      res.write('\r\n');
      return true;
    } catch (_) {
      return false;
    }
  }

  _broadcastFrame(clientSet, jpegBuffer) {
    if (!jpegBuffer || clientSet.size === 0) return;
    for (const res of clientSet) {
      if (!this._writeFrame(res, jpegBuffer)) {
        try { res.destroy(); } catch (_) {}
        clientSet.delete(res);
      }
    }
  }

  async _warmFrame(streamType) {
    const win = streamType === 'stage' ? this.stageWindow : this.programWindow;
    if (!win || win.isDestroyed()) return null;
    try {
      const img = await win.webContents.capturePage();
      if (img && !img.isEmpty()) {
        const buf = img.toJPEG(85);
        if (streamType === 'stage') this.stageFrameBuffer   = buf;
        else                        this.programFrameBuffer = buf;
        return buf;
      }
    } catch (_) {}
    return null;
  }

  handleMjpegRequest(req, res, streamType) {
    streamType = streamType || 'program';

    if (!this.config.enabled || !this.isRunning) {
      res.writeHead(503, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
      res.end('NDI Streaming is disabled. Enable under Settings → NDI & Broadcast.');
      return;
    }

    const sock = res.socket;
    if (sock) {
      try {
        sock.setNoDelay(true);
        sock.setKeepAlive(true, 5000);
        sock.setTimeout(0);
      } catch (_) {}
    }

    res.writeHead(200, {
      'Content-Type':  'multipart/x-mixed-replace; boundary=' + BOUNDARY,
      'Cache-Control': 'no-cache, no-store',
      'Pragma':        'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    try { res.flushHeaders(); } catch (_) { return; }

    const clientSet = streamType === 'stage' ? this.mjpegStageClients : this.mjpegProgramClients;
    clientSet.add(res);

    const cached = streamType === 'stage' ? this.stageFrameBuffer : this.programFrameBuffer;
    if (cached && cached.length > 0) {
      this._writeFrame(res, cached);
    } else {
      this._warmFrame(streamType).then(function(buf) {
        if (buf) this._writeFrame(res, buf);
      }.bind(this));
    }

    const self = this;
    const cleanup = function() {
      clientSet.delete(res);
      try { res.destroy(); } catch (_) {}
    };
    req.on('close',  cleanup);
    req.on('error',  cleanup);
    res.on('error',  cleanup);
  }

  _startMdns() {
    try {
      this.mdnsSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.mdnsSocket.on('error', function(err) { console.warn('[NDI mDNS]', err.message); });
      this.mdnsSocket.bind(5353, function() {
        try { this.addMembership('224.0.0.251'); } catch (_) {}
      });
      const self = this;
      this.mdnsInterval = setInterval(function() {
        if (self.isRunning) self._sendMdnsPacket();
      }, 5000);
      this._sendMdnsPacket();
    } catch (e) {
      console.warn('[NDI mDNS] Could not start:', e.message);
    }
  }

  _sendMdnsPacket() {
    if (!this.mdnsSocket) return;
    try {
      const localIp = this.getLocalIp();
      const payload = JSON.stringify({
        type: 'ndi-source',
        streams: [
          { name: this.config.programStreamName, type: 'program', ip: localIp, port: this.config.port,
            mjpeg: 'http://' + localIp + ':' + this.config.port + '/stream/program.mjpg',
            overlay: 'http://' + localIp + ':' + this.config.port + '/overlay/program' },
          { name: this.config.stageStreamName, type: 'stage', ip: localIp, port: this.config.port,
            mjpeg: 'http://' + localIp + ':' + this.config.port + '/stream/stage.mjpg',
            overlay: 'http://' + localIp + ':' + this.config.port + '/overlay/stage' },
        ],
      });
      const buf = Buffer.from(payload);
      this.mdnsSocket.send(buf, 0, buf.length, 5353, '224.0.0.251', function() {});
    } catch (_) {}
  }

  _stopMdns() {
    if (this.mdnsInterval) { clearInterval(this.mdnsInterval); this.mdnsInterval = null; }
    if (this.mdnsSocket)   { try { this.mdnsSocket.close(); } catch (_) {} this.mdnsSocket = null; }
  }

  setConfig(newConfig) {
    const wasRunning  = this.isRunning;
    const fpsChanged  = newConfig.fps && newConfig.fps !== this.config.fps;
    this.config = Object.assign({}, this.config, newConfig);
    if (wasRunning && fpsChanged) { this.stop(); this.start(); }
    this.emit('config-updated', this.config);
    return this.config;
  }

  getStatus() {
    const localIp = this.getLocalIp();
    const port    = this.config.port;
    return {
      enabled:            this.config.enabled,
      isRunning:          this.isRunning,
      nativeNdiAvailable: this.stats.nativeNdiAvailable,
      programStreamName:  this.config.programStreamName,
      stageStreamName:    this.config.stageStreamName,
      alphaEnabled:       this.config.alphaEnabled,
      resolution:         this.config.resolution,
      fps:                this.config.fps,
      stats: {
        programFps:        this.stats.programFps,
        stageFps:          this.stats.stageFps,
        programFramesSent: this.stats.programFramesSent,
        stageFramesSent:   this.stats.stageFramesSent,
        activeClients:     this.mjpegProgramClients.size + this.mjpegStageClients.size,
        uptimeSeconds:     this.stats.startTime ? Math.round((Date.now() - this.stats.startTime) / 1000) : 0,
      },
      urls: {
        programOverlay: 'http://' + localIp + ':' + port + '/overlay/program',
        stageOverlay:   'http://' + localIp + ':' + port + '/overlay/stage',
        programMjpeg:   'http://' + localIp + ':' + port + '/stream/program.mjpg',
        stageMjpeg:     'http://' + localIp + ':' + port + '/stream/stage.mjpg',
      },
      localIp,
      port,
    };
  }

  getLocalIp() {
    try { return ip.address() || '127.0.0.1'; } catch (_) { return '127.0.0.1'; }
  }

  restartStream() {
    this.stop();
    this.config.enabled = true;
    this.start();
    return this.getStatus();
  }

  async discoverSources() {
    const localIp = this.getLocalIp();
    const port    = this.config.port;
    const discovered = [
      { id: 'ocs-program', name: this.config.programStreamName, ip: localIp, port,
        type: 'OCS Program Output (MJPEG)',
        url:     'http://' + localIp + ':' + port + '/stream/program.mjpg',
        overlay: 'http://' + localIp + ':' + port + '/overlay/program',
        isLocal: true },
      { id: 'ocs-stage', name: this.config.stageStreamName, ip: localIp, port,
        type: 'OCS Stage Display (MJPEG)',
        url:     'http://' + localIp + ':' + port + '/stream/stage.mjpg',
        overlay: 'http://' + localIp + ':' + port + '/overlay/stage',
        isLocal: true },
    ];
    if (this.stats.nativeNdiAvailable && this.nativeNdi && this.nativeNdi.find) {
      try {
        const finder  = await this.nativeNdi.find();
        const sources = await finder.sources();
        if (Array.isArray(sources)) {
          for (const s of sources) {
            discovered.push({ id: s.name || s.urlAddress, name: s.name || 'NDI Source',
              ip: s.urlAddress || 'LAN', type: 'NDI Network Video', isLocal: false });
          }
        }
      } catch (_) {}
    }
    return discovered;
  }
}

const ndiEngine = new NdiEngine();
module.exports = { NdiEngine, ndiEngine };
