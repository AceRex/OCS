/**
 * Authentication & Licensing Service (PRD.md v1.10 Section 4.10 / FR-13.1–FR-13.8)
 * 
 * Features:
 * 1. Hard Login Gate (FR-13.1)
 * 2. Web-Redirect Login Flow with CSRF State Validation (FR-13.3)
 * 3. Secure Token Storage via OS-native credential store / Electron safeStorage (FR-13.4)
 * 4. Cached Grace Period allowing offline launch for up to 72 hours (FR-13.5)
 * 5. Explicit Logout & State Clarity (FR-13.6)
 * 6. Desktop Auth Gating for Mobile Pairing (FR-13.7)
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const appSettings = require('../appSettings');

let safeStorage = null;
try {
  const electron = require('electron');
  safeStorage = electron.safeStorage || null;
} catch (_) {}

const PRODUCTION_AUTH_HOST = 'waveiosoftware.netlify.app';

function assertProductionAuthUrl(customUrl, isPackagedOverride) {
  let isPackaged = false;
  try {
    const electron = require('electron');
    if (electron.app) isPackaged = !!electron.app.isPackaged;
  } catch (_) {}
  if (isPackagedOverride !== undefined) {
    isPackaged = !!isPackagedOverride;
  }

  // dev/test: allow anything
  if (process.env.NODE_ENV !== 'production' && !isPackaged) return;

  const configuredStr = customUrl || (appSettings ? appSettings.get('authLoginUrl') : null) || 'https://waveiosoftware.netlify.app';
  let configured;
  try {
    configured = new URL(configuredStr);
  } catch (err) {
    throw new Error(`Invalid authLoginUrl configured: "${configuredStr}".`);
  }

  if (configured.hostname !== PRODUCTION_AUTH_HOST) {
    throw new Error(
      `Refusing to launch: authLoginUrl is set to "${configured.hostname}" in a production build. ` +
      `Expected "${PRODUCTION_AUTH_HOST}". This usually means a dev override (OCS_AUTH_BASE_URL or ` +
      `a stale settings.json value) leaked into a packaged build. Aborting rather than shipping a ` +
      `build that authenticates against a non-production server.`
    );
  }
}

class AuthService extends EventEmitter {
  constructor() {
    super();
    this.userDataPath = null;
    this.sessionFilePath = null;
    this.cachedSession = null;
    this.pendingAuthState = null;
    this.gracePeriodHours = 72; // default 72h per FR-13.5
    this.defaultAuthHost = null;
  }

  init(userDataPath, { gracePeriodHours = 72, defaultAuthHost } = {}) {
    this.userDataPath = userDataPath;
    this.sessionFilePath = path.join(userDataPath, 'session.enc');
    this.gracePeriodHours = gracePeriodHours || 72;
    let host = defaultAuthHost || (appSettings ? appSettings.get("authLoginUrl") : null) || "https://waveiosoftware.netlify.app";
    if (typeof host === "string" && host.includes("churchocs.com")) {
      host = "https://waveiosoftware.netlify.app";
    }
    this.defaultAuthHost = host;

    // Production safety assertion (fails loudly if dev override leaked into prod)
    assertProductionAuthUrl(this.defaultAuthHost);
  }

  // ── Secure Token Storage (FR-13.4) ──────────────────────────────────────────

  _encrypt(plainText) {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(plainText);
    }
    // Fallback encryption using machine-derived key for headless / test environments
    const key = crypto.createHash('sha256').update(this.userDataPath || 'ocs_secret_key').digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from('FALLBACK_V1:'), iv, tag, encrypted]);
  }

  _decrypt(buffer) {
    if (buffer.subarray(0, 12).toString('utf8') === 'FALLBACK_V1:') {
      const key = crypto.createHash('sha256').update(this.userDataPath || 'ocs_secret_key').digest();
      const iv = buffer.subarray(12, 28);
      const tag = buffer.subarray(28, 44);
      const encrypted = buffer.subarray(44);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
    }
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }
    throw new Error('No compatible secure storage provider available to decrypt session token.');
  }

  async saveSession(sessionData) {
    if (!this.sessionFilePath) throw new Error('AuthService not initialized');
    const payload = {
      token: sessionData.token,
      email: sessionData.email || 'operator@churchocs.com',
      orgName: sessionData.orgName || 'OCS Community Church',
      licenseTier: sessionData.licenseTier || sessionData.subscriptionPlan || 'trial',
      subscriptionPlan: sessionData.subscriptionPlan || sessionData.licenseTier || 'trial',
      daysRemaining: sessionData.daysRemaining !== undefined ? Number(sessionData.daysRemaining) : 60,
      features: sessionData.features || [],
      lastValidatedAt: Date.now(),
      savedAt: Date.now(),
    };

    const encrypted = this._encrypt(JSON.stringify(payload));
    await fsp.writeFile(this.sessionFilePath, encrypted);
    this.cachedSession = payload;
    this.emit('auth-changed', this.getAuthStatus());
    return payload;
  }

  saveSessionSync(sessionData) {
    if (!this.sessionFilePath) throw new Error('AuthService not initialized');
    const payload = {
      token: sessionData.token,
      email: sessionData.email || 'operator@churchocs.com',
      orgName: sessionData.orgName || 'OCS Community Church',
      licenseTier: sessionData.licenseTier || sessionData.subscriptionPlan || 'trial',
      subscriptionPlan: sessionData.subscriptionPlan || sessionData.licenseTier || 'trial',
      daysRemaining: sessionData.daysRemaining !== undefined ? Number(sessionData.daysRemaining) : 60,
      features: sessionData.features || [],
      lastValidatedAt: Date.now(),
      savedAt: Date.now(),
    };

    const encrypted = this._encrypt(JSON.stringify(payload));
    fs.writeFileSync(this.sessionFilePath, encrypted);
    this.cachedSession = payload;
    this.emit('auth-changed', this.getAuthStatus());
    return payload;
  }

  loadSession() {
    if (!this.sessionFilePath) return null;
    if (this.cachedSession) return this.cachedSession;
    try {
      if (!fs.existsSync(this.sessionFilePath)) return null;
      const raw = fs.readFileSync(this.sessionFilePath);
      const decrypted = this._decrypt(raw);
      this.cachedSession = JSON.parse(decrypted);
      return this.cachedSession;
    } catch (err) {
      console.warn('[Auth] Failed to decrypt cached session:', err.message);
      return null;
    }
  }

  // ── Session Verification & Cached Grace Period (FR-13.5) ────────────────────

  checkSession(graceHours = this.gracePeriodHours) {
    const session = this.loadSession();
    if (!session || !session.token) {
      return {
        valid: false,
        reason: 'no_session',
        message: 'No active license found. Log in to activate this workstation.',
      };
    }

    const elapsedMs = Date.now() - (session.lastValidatedAt || session.savedAt || 0);
    const graceMs = (graceHours || 72) * 3600 * 1000;

    if (elapsedMs > graceMs) {
      return {
        valid: false,
        reason: 'grace_period_expired',
        message: `Offline grace period (${graceHours}h) has expired. Re-authentication required.`,
        session,
      };
    }

    const hoursRemaining = Math.max(0, Math.round((graceMs - elapsedMs) / (3600 * 1000)));
    const isGracePeriod = elapsedMs > 2 * 3600 * 1000; // Flag as grace-period if offline >2h since last validation

    return {
      valid: true,
      state: isGracePeriod ? 'grace_period' : 'active',
      hoursRemaining,
      session,
    };
  }

  isAuthenticated() {
    return this.checkSession().valid === true;
  }


  async validateTokenOnline(token) {
    try {
      const apiBase = (appSettings ? appSettings.get("apiBaseUrl") : null) || "https://ocs-backend-ten.vercel.app/api";
      const https = require("https");
      const url = new URL(`${apiBase.replace(/\/+$/, "")}/auth/validate-token`);
      const postData = JSON.stringify({ token: token || this.cachedSession?.token });

      return new Promise((resolve) => {
        const req = https.request(
          url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(postData),
            },
            timeout: 5000,
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
              try {
                const parsed = JSON.parse(data);
                resolve({ valid: res.statusCode === 200 && parsed.valid !== false, data: parsed });
              } catch (_) {
                resolve({ valid: res.statusCode === 200 });
              }
            });
          }
        );
        req.on("error", () => resolve({ valid: false, error: "network_error" }));
        req.on("timeout", () => {
          req.destroy();
          resolve({ valid: false, error: "timeout" });
        });
        req.write(postData);
        req.end();
      });
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  getAuthStatus() {
    const check = this.checkSession();
    if (!check.valid) {
      return {
        authenticated: false,
        state: check.reason === 'grace_period_expired' ? 'expired' : 'logged_out',
        reason: check.reason,
        message: check.message,
        email: check.session?.email || null,
        orgName: check.session?.orgName || null,
      };
    }

    return {
      authenticated: true,
      state: check.state,
      email: check.session.email,
      orgName: check.session.orgName,
      licenseTier: check.session.licenseTier || check.session.subscriptionPlan || 'trial',
      subscriptionPlan: check.session.subscriptionPlan || check.session.licenseTier || 'trial',
      daysRemaining: check.session.daysRemaining !== undefined ? Number(check.session.daysRemaining) : (check.session.licenseTier === 'free' ? 0 : 60),
      features: check.session.features || [],
      hoursRemaining: check.hoursRemaining,
      lastValidatedAt: check.session.lastValidatedAt,
    };
  }

  // ── CSRF State & Web-Redirect Login Flow (FR-13.3) ──────────────────────────

  generateAuthState() {
    const state = crypto.randomBytes(24).toString('hex');
    this.pendingAuthState = {
      state,
      createdAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 min TTL
    };
    return state;
  }

  getLoginUrl(customAuthHost) {
    const state = this.generateAuthState();
    const host = (customAuthHost || this.defaultAuthHost || "https://waveiosoftware.netlify.app").replace(/\/+$/, "");
    const redirectUri = encodeURIComponent("ocs://auth/callback");
    return {
      url: `${host}/auth/desktop?state=${state}&platform=desktop&redirect_uri=${redirectUri}`,
      state,
    };
  }

  validateAuthCallback(rawUrl) {
    try {
      if (!rawUrl || typeof rawUrl !== "string") {
        return { ok: false, error: "Invalid callback: Missing callback URL" };
      }

      // Canonical Scheme: strictly ocs://auth/callback (FR-13.8a)
      if (!rawUrl.startsWith("ocs://auth/callback")) {
        return {
          ok: false,
          error: 'Invalid callback scheme format: Must strictly match canonical URI "ocs://auth/callback"',
        };
      }

      const queryPart = rawUrl.includes("?") ? rawUrl.split("?")[1] : "";
      const params = new URLSearchParams(queryPart);
      const parsed = {
        token: params.get("token"),
        state: params.get("state"),
        email: params.get("email"),
        org: params.get("org") || params.get("orgName"),
        tier: params.get("tier") || params.get("plan") || "trial",
        daysRemaining: params.get("days_left") || params.get("days") || params.get("daysRemaining") || 60,
        features: params.get("features"),
      };

      if (!parsed.token) {
        return { ok: false, error: 'Invalid callback: Missing authentication token' };
      }

      if (!parsed.state) {
        return { ok: false, error: 'Invalid callback: Missing CSRF state parameter' };
      }

      // Validate CSRF state (FR-13.3 step 4)
      if (!this.pendingAuthState) {
        return { ok: false, error: 'No pending authentication state found. Please initiate login again.' };
      }

      if (Date.now() > this.pendingAuthState.expiresAt) {
        this.pendingAuthState = null;
        return { ok: false, error: 'Authentication request has expired. Please try again.' };
      }

      if (parsed.state !== this.pendingAuthState.state) {
        return { ok: false, error: 'CSRF State Mismatch: Security validation failed. Please try again.' };
      }

      // Clear pending state after successful validation
      this.pendingAuthState = null;

      // Save encrypted session
      let parsedFeatures = [];
      try {
        if (parsed.features) parsedFeatures = typeof parsed.features === "string" ? JSON.parse(parsed.features) : parsed.features;
      } catch (_) {}

      const session = this.saveSessionSync({
        token: parsed.token,
        email: parsed.email || 'admin@churchocs.com',
        orgName: parsed.org || 'OCS Community Church',
        licenseTier: parsed.tier || 'trial',
        subscriptionPlan: parsed.tier || 'trial',
        daysRemaining: parsed.daysRemaining ? Number(parsed.daysRemaining) : 60,
        features: parsedFeatures,
      });

      return { ok: true, session };
    } catch (err) {
      return { ok: false, error: `Authentication callback error: ${err.message}` };
    }
  }

  // ── Explicit Logout (FR-13.6) ───────────────────────────────────────────────

  async logout() {
    this.cachedSession = null;
    this.pendingAuthState = null;
    if (this.sessionFilePath && fs.existsSync(this.sessionFilePath)) {
      try {
        await fsp.unlink(this.sessionFilePath);
      } catch (_) {}
    }
    this.emit('auth-changed', { authenticated: false, state: 'logged_out' });
    return { ok: true };
  }

  logoutSync() {
    this.cachedSession = null;
    this.pendingAuthState = null;
    if (this.sessionFilePath && fs.existsSync(this.sessionFilePath)) {
      try {
        fs.unlinkSync(this.sessionFilePath);
      } catch (_) {}
    }
    this.emit('auth-changed', { authenticated: false, state: 'logged_out' });
    return { ok: true };
  }
}

const authService = new AuthService();
module.exports = { AuthService, authService, assertProductionAuthUrl, PRODUCTION_AUTH_HOST };
