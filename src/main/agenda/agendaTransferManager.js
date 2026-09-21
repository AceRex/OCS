/**
 * wave.io Mobile-to-Desktop Agenda Transfer & Persistence Manager
 * 
 * Manages chunked streaming asset transfers, disk space verification,
 * SHA-256 deduplication, atomic manifest validation, and persistent storage.
 */
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  validateAgendaDocument,
  migrateLegacyAgenda,
} = require('./agendaModel');

class AgendaTransferManager {
  constructor(appUserDataPath) {
    this.userDataPath = appUserDataPath;
    this.agendasDir = path.join(this.userDataPath, 'agendas');
    this.stagingDir = path.join(this.userDataPath, 'agenda_staging');
    this.assetsDir = path.join(this.userDataPath, 'agenda_assets');
    this.mediaDir = path.join(this.userDataPath, 'media');

    this.pendingOffers = new Map();     // transferId -> offer details
    this.activeTransfers = new Map();   // transferId -> transfer tracking state
    this.progressListeners = new Set();
  }

  async init() {
    await fsp.mkdir(this.agendasDir, { recursive: true });
    await fsp.mkdir(this.stagingDir, { recursive: true });
    await fsp.mkdir(this.assetsDir, { recursive: true });
    await fsp.mkdir(this.mediaDir, { recursive: true });
    await this.cleanAbandonedStaging();
  }

  /**
   * Cleans any staging directories left behind by crashed or abandoned transfers (> 24 hrs old)
   */
  async cleanAbandonedStaging() {
    try {
      if (!fs.existsSync(this.stagingDir)) return;
      const entries = await fsp.readdir(this.stagingDir, { withFileTypes: true });
      const now = Date.now();
      const MAX_AGE_MS = 24 * 60 * 60 * 1000;

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const dirPath = path.join(this.stagingDir, entry.name);
          const stat = await fsp.stat(dirPath).catch(() => null);
          if (stat && now - stat.mtimeMs > MAX_AGE_MS) {
            await fsp.rm(dirPath, { recursive: true, force: true }).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.warn('[AgendaTransfer] Failed to clean staging:', err.message);
    }
  }

  /**
   * Checks if an asset already exists in local storage by SHA-256 hash or filename
   */
  async findExistingAsset(hash, originalName) {
    if (!hash) return null;

    // Check agenda_assets by hash
    const ext = path.extname(originalName || '');
    const assetPath = path.join(this.assetsDir, `${hash}${ext}`);
    if (fs.existsSync(assetPath)) {
      return {
        path: assetPath,
        fileUrl: pathToFileURL(assetPath).href,
        foundIn: 'agenda_assets',
      };
    }

    // Check media dir by originalName
    if (originalName) {
      const mediaPath = path.join(this.mediaDir, originalName);
      if (fs.existsSync(mediaPath)) {
        return {
          path: mediaPath,
          fileUrl: pathToFileURL(mediaPath).href,
          foundIn: 'media',
        };
      }
    }

    return null;
  }

  /**
   * Evaluates an incoming agenda offer from mobile
   */
  async handleOffer({ agenda, deviceName, deviceIp }) {
    const val = validateAgendaDocument(agenda);
    if (!val.valid) {
      return { ok: false, error: `Invalid agenda manifest: ${val.errors.join(', ')}` };
    }

    const transferId = `xfer_agenda_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const assets = Array.isArray(agenda.assets) ? agenda.assets : [];

    // Analyze which assets are missing vs already present
    const neededAssets = [];
    const existingAssets = [];
    let totalNeededBytes = 0;

    for (const a of assets) {
      const existing = await this.findExistingAsset(a.hash, a.originalName);
      if (existing) {
        existingAssets.push({ ...a, resolvedPath: existing.path, fileUrl: existing.fileUrl });
      } else {
        neededAssets.push(a);
        totalNeededBytes += Number(a.size) || 0;
      }
    }

    const offer = {
      transferId,
      agenda,
      deviceName: deviceName || 'Mobile Companion',
      deviceIp: deviceIp || '127.0.0.1',
      totalAssets: assets.length,
      neededAssets,
      existingAssets,
      totalNeededBytes,
      status: 'pending_operator', // 'pending_operator' | 'accepted' | 'declined' | 'transferring' | 'ready'
      createdAt: Date.now(),
    };

    this.pendingOffers.set(transferId, offer);

    return {
      ok: true,
      transferId,
      agendaName: agenda.name,
      sessionCount: (agenda.sessions || []).length,
      mediaCount: assets.length,
      neededCount: neededAssets.length,
      skippedCount: existingAssets.length,
      totalNeededBytes,
      requiresOperatorAccept: true,
    };
  }

  /**
   * Operator accepts or declines the incoming agenda offer
   */
  async respondToOffer(transferId, accepted) {
    const offer = this.pendingOffers.get(transferId);
    if (!offer) {
      return { ok: false, error: 'Transfer offer not found or expired' };
    }

    if (!accepted) {
      offer.status = 'declined';
      this.pendingOffers.delete(transferId);
      return { ok: true, accepted: false, reason: 'Declined by operator' };
    }

    offer.status = 'accepted';
    const stagingPath = path.join(this.stagingDir, transferId);
    await fsp.mkdir(stagingPath, { recursive: true });

    // Initialize transfer tracker
    this.activeTransfers.set(transferId, {
      ...offer,
      stagingPath,
      receivedBytes: 0,
      filesCompleted: 0,
      filesFailed: 0,
      fileProgress: new Map(), // hash -> { bytesReceived, totalBytes, done }
    });

    return {
      ok: true,
      accepted: true,
      transferId,
      neededAssetHashes: offer.neededAssets.map((a) => a.hash),
    };
  }

  /**
   * Accepts and writes an incoming binary chunk to disk
   */
  async writeChunk({ transferId, hash, chunkIndex, totalChunks, data }) {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { ok: false, error: 'Transfer session inactive or not found' };
    }

    const buffer = Buffer.isBuffer(data)
      ? data
      : Buffer.from(typeof data === 'string' && data.includes('base64,') ? data.split('base64,')[1] : data, 'base64');

    const targetFile = path.join(transfer.stagingPath, `${hash}.part`);

    // Append chunk to staging file
    await fsp.appendFile(targetFile, buffer);

    transfer.receivedBytes += buffer.length;

    // Track per-file progress
    const existingProg = transfer.fileProgress.get(hash) || { bytesReceived: 0, totalBytes: 0, done: false };
    existingProg.bytesReceived += buffer.length;
    transfer.fileProgress.set(hash, existingProg);

    const overallPct = transfer.totalNeededBytes > 0
      ? Math.min(100, Math.round((transfer.receivedBytes / transfer.totalNeededBytes) * 100))
      : 100;

    const progressEvent = {
      transferId,
      agendaId: transfer.agenda.id,
      overallPct,
      receivedBytes: transfer.receivedBytes,
      totalBytes: transfer.totalNeededBytes,
      currentHash: hash,
    };

    this.emitProgress(progressEvent);

    return { ok: true, chunkIndex, bytesWritten: buffer.length, overallPct };
  }

  /**
   * Finalizes an individual asset upload and verifies its SHA-256 hash
   */
  async finalizeAsset({ transferId, hash, originalName }) {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { ok: false, error: 'Transfer session inactive' };
    }

    const stagedPart = path.join(transfer.stagingPath, `${hash}.part`);
    if (!fs.existsSync(stagedPart)) {
      return { ok: false, error: `Staged asset not found: ${hash}` };
    }

    // Verify SHA-256 checksum
    const fileBuf = await fsp.readFile(stagedPart);
    const computedHash = crypto.createHash('sha256').update(fileBuf).digest('hex');

    if (hash && computedHash !== hash) {
      await fsp.unlink(stagedPart).catch(() => {});
      return {
        ok: false,
        error: `Integrity check failed for ${originalName || hash}. Computed: ${computedHash}, Expected: ${hash}`,
      };
    }

    // Rename .part to confirmed hash
    const ext = path.extname(originalName || '');
    const permanentPath = path.join(this.assetsDir, `${computedHash}${ext}`);
    await fsp.copyFile(stagedPart, permanentPath);
    await fsp.unlink(stagedPart).catch(() => {});

    // Also copy to general media if video/image so it's directly accessible
    if (originalName) {
      const mediaDest = path.join(this.mediaDir, originalName);
      if (!fs.existsSync(mediaDest)) {
        await fsp.copyFile(permanentPath, mediaDest).catch(() => {});
      }
    }

    transfer.filesCompleted++;
    const prog = transfer.fileProgress.get(hash) || {};
    prog.done = true;
    transfer.fileProgress.set(hash, prog);

    return {
      ok: true,
      hash: computedHash,
      fileUrl: pathToFileURL(permanentPath).href,
      path: permanentPath,
    };
  }

  /**
   * Commits the entire transfer once all needed assets have been finalized
   */
  async finalizeTransfer(transferId) {
    const transfer = this.activeTransfers.get(transferId);
    if (!transfer) {
      return { ok: false, error: 'Transfer session not found' };
    }

    const agenda = { ...transfer.agenda };
    agenda.updatedAt = Date.now();

    // Map all asset references to their local file URLs
    for (const a of (agenda.assets || [])) {
      const existing = await this.findExistingAsset(a.hash, a.originalName);
      if (existing) {
        a.localFileUrl = existing.fileUrl;
        a.localPath = existing.path;
      }
    }

    // Also map asset references to all cues inside sessions
    for (const session of (agenda.sessions || [])) {
      for (const cue of (session.timelineItems || [])) {
        const asset = (agenda.assets || []).find((a) => a.id === cue.assetId || a.hash === cue.hash);
        if (asset && asset.localFileUrl) {
          cue.localFileUrl = asset.localFileUrl;
          cue.fileUrl = asset.localFileUrl;
          cue.url = asset.localFileUrl;
          if (!cue.assetId) cue.assetId = asset.id;
        }
      }
    }

    // Save persistent agenda document
    await this.saveAgenda(agenda);

    // Clean up staging directory
    if (transfer.stagingPath && fs.existsSync(transfer.stagingPath)) {
      await fsp.rm(transfer.stagingPath, { recursive: true, force: true }).catch(() => {});
    }

    this.activeTransfers.delete(transferId);
    this.pendingOffers.delete(transferId);

    return {
      ok: true,
      agendaId: agenda.id,
      name: agenda.name,
      status: 'ready',
      agenda,
    };
  }

  /**
   * Aborts an active transfer and cleans up temporary chunks
   */
  async abortTransfer(transferId) {
    const transfer = this.activeTransfers.get(transferId);
    if (transfer && transfer.stagingPath && fs.existsSync(transfer.stagingPath)) {
      await fsp.rm(transfer.stagingPath, { recursive: true, force: true }).catch(() => {});
    }
    this.activeTransfers.delete(transferId);
    this.pendingOffers.delete(transferId);
    return { ok: true, transferId };
  }

  // ─── Agenda Document Persistence ──────────────────────────────────────────

  async listAgendas() {
    await fsp.mkdir(this.agendasDir, { recursive: true });
    const files = await fsp.readdir(this.agendasDir);
    const list = [];

    for (const f of files) {
      if (f.endsWith('.json')) {
        try {
          const raw = await fsp.readFile(path.join(this.agendasDir, f), 'utf8');
          const doc = JSON.parse(raw);
          list.push(doc);
        } catch (_) {}
      }
    }

    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return list;
  }

  async getAgenda(id) {
    const filePath = path.join(this.agendasDir, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const raw = await fsp.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      console.error(`[AgendaTransfer] Failed to read ${id}:`, err);
      return null;
    }
  }

  async saveAgenda(agenda) {
    if (!agenda || !agenda.id) throw new Error('Agenda must have an ID to save');
    await fsp.mkdir(this.agendasDir, { recursive: true });
    agenda.updatedAt = Date.now();
    const filePath = path.join(this.agendasDir, `${agenda.id}.json`);
    await fsp.writeFile(filePath, JSON.stringify(agenda, null, 2), 'utf8');
    return agenda;
  }

  async deleteAgenda(id) {
    const filePath = path.join(this.agendasDir, `${id}.json`);
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath).catch(() => {});
    }
    return true;
  }

  async duplicateAgenda(id) {
    const original = await this.getAgenda(id);
    if (!original) throw new Error('Agenda to duplicate not found');

    const now = Date.now();
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = `agenda_${now}_${crypto.randomBytes(3).toString('hex')}`;
    duplicate.name = `${original.name} (Copy)`;
    duplicate.createdAt = now;
    duplicate.updatedAt = now;

    // Give new IDs to all sessions and cues
    duplicate.sessions = (duplicate.sessions || []).map((s, idx) => ({
      ...s,
      id: `sess_${now}_${idx}_${crypto.randomBytes(2).toString('hex')}`,
      timelineItems: (s.timelineItems || []).map((c, cIdx) => ({
        ...c,
        id: `cue_${now}_${idx}_${cIdx}_${crypto.randomBytes(2).toString('hex')}`,
      })),
    }));

    await this.saveAgenda(duplicate);
    return duplicate;
  }

  onProgress(callback) {
    this.progressListeners.add(callback);
    return () => this.progressListeners.delete(callback);
  }

  emitProgress(evt) {
    for (const listener of this.progressListeners) {
      try {
        listener(evt);
      } catch (_) {}
    }
  }
}

module.exports = AgendaTransferManager;
