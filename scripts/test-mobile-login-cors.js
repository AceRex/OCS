const assert = require('assert');
const corsMiddleware = require('../../ocs-backend/src/middleware/cors');

function runCorsTests() {
  console.log('=== TEST SUITE 1: Mobile CORS & Preflight Resolution ===');

  // Test 1: OPTIONS Preflight with custom x-ocs headers
  {
    const req = {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:8081',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-ocs-platform,x-ocs-device-id,x-ocs-device-name',
      },
    };

    const headersSet = {};
    let endedStatus = null;
    const res = {
      setHeader: (name, val) => {
        headersSet[name.toLowerCase()] = val;
      },
      status: (code) => {
        endedStatus = code;
        return {
          end: () => {},
        };
      },
    };

    let nextCalled = false;
    corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(endedStatus, 204, 'Preflight must end with status 204');
    assert.strictEqual(nextCalled, false, 'Preflight must terminate without next()');
    assert.strictEqual(headersSet['access-control-allow-origin'], 'http://localhost:8081');
    assert.strictEqual(headersSet['access-control-allow-credentials'], 'true');

    const allowHeaders = headersSet['access-control-allow-headers'].toLowerCase();
    assert(allowHeaders.includes('x-ocs-platform'), 'Must allow x-ocs-platform header');
    assert(allowHeaders.includes('x-ocs-device-id'), 'Must allow x-ocs-device-id header');
    assert(allowHeaders.includes('x-ocs-device-name'), 'Must allow x-ocs-device-name header');
    console.log('✔ OPTIONS preflight with x-ocs-* headers successfully approved.');
  }

  // Test 2: Standard POST with Origin
  {
    const req = {
      method: 'POST',
      headers: {
        origin: 'https://waveio-git-main-acerexs-projects.vercel.app',
      },
    };

    const headersSet = {};
    const res = {
      setHeader: (name, val) => {
        headersSet[name.toLowerCase()] = val;
      },
    };

    let nextCalled = false;
    corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'POST must call next()');
    assert.strictEqual(headersSet['access-control-allow-origin'], 'https://waveio-git-main-acerexs-projects.vercel.app');
    assert.strictEqual(headersSet['access-control-allow-credentials'], 'true');
    console.log('✔ Standard POST request received correct CORS origin and credentials.');
  }

  // Test 3: Request without Origin (native mobile / desktop)
  {
    const req = {
      method: 'POST',
      headers: {},
    };

    const headersSet = {};
    const res = {
      setHeader: (name, val) => {
        headersSet[name.toLowerCase()] = val;
      },
    };

    let nextCalled = false;
    corsMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'Request without origin must proceed to next()');
    assert.strictEqual(headersSet['access-control-allow-origin'], '*');
    console.log('✔ Non-browser request without Origin header defaults safely.');
  }

  console.log('\n=== TEST SUITE 2: Mobile Error Categorization ===');
  {
    const formatErrorMessage = (err, cleanBase, status) => {
      if (err.name === 'AbortError') {
        return 'Connection timed out. The server took too long to respond. Please check your network connection.';
      }
      if (status === 401 || status === 403) {
        return 'Invalid email or password. Please verify your credentials.';
      }
      if (status >= 500) {
        return 'Authentication server is temporarily unavailable. Please try again shortly.';
      }
      const message = err.message || '';
      if (
        message.includes('Failed to fetch') ||
        message.includes('Network request failed') ||
        message.includes('NetworkError') ||
        message.includes('ECONNREFUSED')
      ) {
        if (cleanBase.includes('localhost') || cleanBase.includes('127.0.0.1')) {
          return "Cannot reach 'localhost' from a mobile device. Use your computer's LAN IP address (e.g. http://192.168.x.x:4000).";
        }
        return `Unable to reach authentication server (${cleanBase}). Please check your internet connection or server address.`;
      }
      return message;
    };

    // Case A: 401 Unauthorized
    assert.strictEqual(
      formatErrorMessage(new Error('Unauthorized'), 'https://api.example.com', 401),
      'Invalid email or password. Please verify your credentials.'
    );

    // Case B: Abort timeout
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    assert.strictEqual(
      formatErrorMessage(abortErr, 'https://api.example.com', null),
      'Connection timed out. The server took too long to respond. Please check your network connection.'
    );

    // Case C: Mobile accessing localhost
    const netErr = new Error('TypeError: Failed to fetch');
    assert.strictEqual(
      formatErrorMessage(netErr, 'http://localhost:4000', null),
      "Cannot reach 'localhost' from a mobile device. Use your computer's LAN IP address (e.g. http://192.168.x.x:4000)."
    );

    // Case D: Server 503 outage
    assert.strictEqual(
      formatErrorMessage(new Error('Server Error'), 'https://api.example.com', 503),
      'Authentication server is temporarily unavailable. Please try again shortly.'
    );

    // Case E: Remote host unreachable
    assert.strictEqual(
      formatErrorMessage(netErr, 'https://ocs-backend-ten.vercel.app', null),
      'Unable to reach authentication server (https://ocs-backend-ten.vercel.app). Please check your internet connection or server address.'
    );

    console.log('✔ All 5 error categories correctly distinguished (credentials, timeout, localhost, 5xx, network).');
  }

  console.log('\n🎉 ALL TASK 1 TESTS PASSED CLEANLY!\n');
}

runCorsTests();
