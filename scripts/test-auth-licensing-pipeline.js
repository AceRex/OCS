/**
 * Integration & Security Test Suite for Authentication & Licensing (PRD.md v1.10 Section 4.10 / FR-13.1–FR-13.8)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const http = require('http');
const { AuthService, assertProductionAuthUrl, PRODUCTION_AUTH_HOST } = require('../src/main/auth/authService');
const { generatePairing, validateCredential } = require('../src/main/pairing/pairing');
const { server: mockServer, PORT: MOCK_PORT } = require('./mock-auth-server');

async function runTests() {
  console.log('=== Authentication & Licensing Pipeline Test Suite (PRD v1.10 FR-13.1–FR-13.8) ===\n');
  let passed = 0;
  let failed = 0;

  function ok(cond, msg) {
    if (cond) {
      console.log(`PASS: ${msg}`);
      passed++;
    } else {
      console.error(`FAIL: ${msg}`);
      failed++;
    }
  }

  const tmpDir = path.join(os.tmpdir(), `ocs_auth_test_${Date.now()}`);
  await fsp.mkdir(tmpDir, { recursive: true });

  try {
    const auth = new AuthService();
    auth.init(tmpDir, { gracePeriodHours: 72, defaultAuthHost: 'https://auth.churchocs.com' });

    // ── 1. Fresh Install / Hard Login Gate (FR-13.1) ──────────────────────────
    console.log('--- 1. Fresh Install & Login Gate (FR-13.1) ---');
    const freshCheck = auth.checkSession();
    ok(freshCheck.valid === false, 'T1.1: Fresh launch has no valid session');
    ok(freshCheck.reason === 'no_session', 'T1.2: Rejection reason is no_session');
    ok(auth.isAuthenticated() === false, 'T1.3: isAuthenticated() is false before login');
    const freshStatus = auth.getAuthStatus();
    ok(freshStatus.authenticated === false, 'T1.4: getAuthStatus().authenticated is false');
    ok(freshStatus.state === 'logged_out', 'T1.5: getAuthStatus().state is logged_out');

    // ── 2. Web-Redirect Login Flow & CSRF State Security (FR-13.3) ────────────
    console.log('\n--- 2. Web-Redirect Flow & CSRF Validation (FR-13.3) ---');
    const loginInfo = auth.getLoginUrl();
    ok(typeof loginInfo.url === 'string', 'T2.1: Generated browser login URL');
    ok(loginInfo.url.startsWith('https://auth.churchocs.com/login'), 'T2.2: Login URL targets hosted auth endpoint');
    ok(loginInfo.url.includes(`state=${loginInfo.state}`), 'T2.3: Login URL contains cryptographic state query param');
    ok(loginInfo.url.includes('redirect_uri=ocs%3A%2F%2Fauth-callback'), 'T2.4: Redirect URI is encoded ocs://auth-callback');
    ok(auth.pendingAuthState.state === loginInfo.state, 'T2.5: Pending auth state saved in memory');

    // Mismatched state rejection (CSRF Attack Prevention)
    console.log('\n--- 2b. CSRF Protection Gate ---');
    const forgedCallback = `ocs://auth-callback?token=malicious_token&state=FORGED_STATE_VALUE&email=attacker@evil.com`;
    const csrfResult = auth.validateAuthCallback(forgedCallback);
    ok(csrfResult.ok === false, 'T2.6: Forged CSRF state callback is rejected');
    ok(csrfResult.error.includes('CSRF State Mismatch'), 'T2.7: Error message explicitly flags CSRF State Mismatch');
    ok(auth.isAuthenticated() === false, 'T2.8: App remains unauthenticated after CSRF attack');

    // Valid callback acceptance
    console.log('\n--- 2c. Valid Auth Deep-Link Acceptance ---');
    const validCallback = `ocs://auth-callback?token=jwt_valid_sample_token_xyz123&state=${loginInfo.state}&email=lead_pastor@gracecommunity.org&org=Grace%20Community%20Church&tier=enterprise`;
    const validResult = auth.validateAuthCallback(validCallback);
    ok(validResult.ok === true, 'T2.9: Valid deep-link callback with matching state accepted');
    ok(validResult.session.email === 'lead_pastor@gracecommunity.org', 'T2.10: Session email extracted correctly');
    ok(validResult.session.orgName === 'Grace Community Church', 'T2.11: Session orgName extracted correctly');
    ok(auth.pendingAuthState === null, 'T2.12: Pending state cleared after successful validation (one-time use)');

    // ── 3. Secure Storage Inspection (FR-13.4) ────────────────────────────────
    console.log('\n--- 3. Secure Token Storage (FR-13.4) ---');
    const encPath = path.join(tmpDir, 'session.enc');
    ok(fs.existsSync(encPath), 'T3.1: Encrypted session file session.enc exists');
    const rawEnc = await fsp.readFile(encPath);
    ok(!rawEnc.includes('jwt_valid_sample_token_xyz123'), 'T3.2: Raw session file DOES NOT contain plaintext token');
    ok(!rawEnc.includes('lead_pastor@gracecommunity.org'), 'T3.3: Raw session file is encrypted binary data');

    // ── 4. Cached Grace Period & Offline Launch (FR-13.5) ─────────────────────
    console.log('\n--- 4. Cached Grace Period & Offline Launch (FR-13.5) ---');
    // Reload from clean instance simulating app restart
    const authRestarted = new AuthService();
    authRestarted.init(tmpDir, { gracePeriodHours: 72 });
    const restartCheck = authRestarted.checkSession();
    ok(restartCheck.valid === true, 'T4.1: App restarts and loads cached session without network check');
    ok(restartCheck.session.email === 'lead_pastor@gracecommunity.org', 'T4.2: Decrypted session matches stored credentials');
    ok(authRestarted.isAuthenticated() === true, 'T4.3: isAuthenticated() is true on restart');

    // Test grace period simulation (24 hours offline)
    console.log('\n--- 4b. 24-Hour Offline Grace Period Simulation ---');
    authRestarted.cachedSession.lastValidatedAt = Date.now() - (24 * 3600 * 1000);
    const graceCheck = authRestarted.checkSession();
    ok(graceCheck.valid === true, 'T4.4: 24-hour offline session is valid');
    ok(graceCheck.state === 'grace_period', 'T4.5: State is marked as grace_period');
    ok(graceCheck.hoursRemaining >= 47 && graceCheck.hoursRemaining <= 49, 'T4.6: Accurately calculates ~48h remaining');

    // Test expired grace period simulation (75 hours offline > 72 hours max)
    console.log('\n--- 4c. Expired Grace Period Simulation (75h > 72h) ---');
    authRestarted.cachedSession.lastValidatedAt = Date.now() - (75 * 3600 * 1000);
    const expiredCheck = authRestarted.checkSession();
    ok(expiredCheck.valid === false, 'T4.7: 75-hour offline session is rejected');
    ok(expiredCheck.reason === 'grace_period_expired', 'T4.8: Rejection reason is grace_period_expired');
    const expiredStatus = authRestarted.getAuthStatus();
    ok(expiredStatus.authenticated === false, 'T4.9: getAuthStatus().authenticated is false after grace expiry');
    ok(expiredStatus.state === 'expired', 'T4.10: State is expired (distinct from logged_out)');

    // ── 5. Mobile Pairing Gating on Desktop Auth (FR-13.7) ────────────────────
    console.log('\n--- 5. Mobile Pairing Gating (FR-13.7) ---');
    const pairing = generatePairing();

    // Case A: Desktop is expired/unauthenticated
    const unauthenticatedCanPair = authRestarted.isAuthenticated() && validateCredential(pairing, pairing.code);
    ok(unauthenticatedCanPair === false, 'T5.1: Mobile pairing is rejected when Desktop is unauthenticated (FR-13.7)');

    // Case B: Desktop is authenticated (within grace period)
    authRestarted.cachedSession.lastValidatedAt = Date.now(); // re-arm valid session
    const authenticatedCanPair = authRestarted.isAuthenticated() && validateCredential(pairing, pairing.code);
    ok(authenticatedCanPair === true, 'T5.2: Mobile pairing succeeds when Desktop has valid license');

    // ── 6. Explicit Logout (FR-13.6) ──────────────────────────────────────────
    console.log('\n--- 6. Explicit Logout (FR-13.6) ---');
    await authRestarted.logout();
    ok(fs.existsSync(encPath) === false, 'T6.1: session.enc removed from disk on logout');
    ok(authRestarted.isAuthenticated() === false, 'T6.2: isAuthenticated() is false after logout');
    const logoutStatus = authRestarted.getAuthStatus();
    ok(logoutStatus.state === 'logged_out', 'T6.3: State transitions to logged_out');

    // ── 7. Production Safety Guard (assertProductionAuthUrl) ──────────────────
    console.log('\n--- 7. Production Safety Guard ---');
    // Case 7.1: Packaged production build with non-production host MUST throw
    let prodMismatchThrew = false;
    try {
      assertProductionAuthUrl('http://localhost:5175', true); // isPackaged = true
    } catch (err) {
      prodMismatchThrew = true;
      ok(err.message.includes('Refusing to launch'), 'T7.1: Packaged build with localhost throws loud safety error');
    }
    ok(prodMismatchThrew === true, 'T7.2: Safety guard caught dev auth URL in simulated packaged build');

    // Case 7.2: Packaged production build with correct production host MUST NOT throw
    let prodValidThrew = false;
    try {
      assertProductionAuthUrl('https://auth.churchocs.com', true); // isPackaged = true
    } catch (err) {
      prodValidThrew = true;
    }
    ok(prodValidThrew === false, 'T7.3: Packaged build with official auth.churchocs.com launches cleanly');

    // Case 7.3: Dev mode (isPackaged = false, NODE_ENV != 'production') MUST NOT throw regardless of URL
    let devCustomThrew = false;
    const oldNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      assertProductionAuthUrl('http://localhost:5175', false); // isPackaged = false
    } catch (err) {
      devCustomThrew = true;
    } finally {
      process.env.NODE_ENV = oldNodeEnv;
    }
    ok(devCustomThrew === false, 'T7.4: Dev mode is completely unrestricted for mock local URLs');

    // ── 8. Local Mock Auth Server Integration ────────────────────────────────
    console.log('\n--- 8. Mock Auth Server HTTP Integration ---');
    await new Promise((resolve) => mockServer.listen(MOCK_PORT, resolve));
    try {
      const mockLoginUrl = `http://localhost:${MOCK_PORT}/login?state=mock_test_state&app=desktop&redirect_uri=ocs%3A%2F%2Fauth-callback`;
      const html = await new Promise((resolve, reject) => {
        http.get(mockLoginUrl, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });
      ok(html.includes('OCS Mock Auth Portal'), 'T8.1: Mock auth server serves login portal HTML');
      ok(html.includes('mock_test_state'), 'T8.2: Mock auth server embeds state parameter');
      ok(html.includes('ocs://auth-callback'), 'T8.3: Mock auth server includes custom scheme redirect buttons');
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }

  } finally {
    // Cleanup temporary test directory
    try {
      await fsp.rm(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }

  console.log(`\n========================================================`);
  console.log(`Authentication & Licensing Pipeline: ${passed} passed, ${failed} failed.`);
  console.log(`========================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
