/**
 * Local Mock Authentication & Licensing Server (for Dev & QA)
 * Implements the Hosted Web Authentication contract (docs/AUTH_WEB_SPEC.md).
 * 
 * Usage:
 *   node scripts/mock-auth-server.js
 *   OCS_AUTH_BASE_URL=http://localhost:5175 npm start
 */

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 5175;

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname === '/login') {
    const state = parsed.query.state || '';
    const redirectUri = parsed.query.redirect_uri || 'ocs://auth-callback';

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OCS Mock Auth Web Portal</title>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0B0814; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #161026; border: 1px solid #7c3aed; border-radius: 20px; padding: 32px; width: 440px; text-align: center; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
          .logo { width: 56px; height: 56px; border-radius: 16px; background: linear-gradient(135deg, #7c3aed, #06b6d4); display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; margin: 0 auto 16px; }
          h2 { margin: 0 0 8px; font-size: 20px; }
          p { font-size: 13px; color: #94A3B8; margin: 0 0 20px; }
          .state-pill { background: rgba(255,255,255,0.06); padding: 6px 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #c084fc; word-break: break-all; margin-bottom: 20px; text-align: left; }
          .btn { display: block; width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 12px; border: none; font-size: 14px; font-weight: bold; cursor: pointer; text-decoration: none; box-sizing: border-box; transition: transform 0.1s; }
          .btn:active { transform: scale(0.98); }
          .btn-primary { background: linear-gradient(135deg, #7c3aed, #a855f7); color: white; }
          .btn-pro { background: linear-gradient(135deg, #06b6d4, #3b82f6); color: white; }
          .btn-danger { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #fca5a5; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">O</div>
          <h2>OCS Mock Auth Portal</h2>
          <p>Choose an authentication scenario to redirect back to the Desktop App:</p>
          <div class="state-pill"><strong>CSRF State:</strong> ${state || 'MISSING'}</div>

          <a class="btn btn-primary" href="${redirectUri}?token=mock_jwt_standard_${Date.now()}&state=${state}&email=admin@churchocs.com&org=OCS%20Community%20Church&tier=standard">
            ✓ Log in as Standard Church (OCS Community)
          </a>

          <a class="btn btn-pro" href="${redirectUri}?token=mock_jwt_enterprise_${Date.now()}&state=${state}&email=admin@faithcathedral.org&org=Faith%20Cathedral&tier=enterprise">
            ★ Log in as Enterprise Church (Faith Cathedral)
          </a>

          <a class="btn btn-danger" href="${redirectUri}?token=mock_jwt_csrf&state=FORGED_STATE_${Date.now()}&email=hacker@evil.com&org=Evil%20Corp&tier=standard">
            ✗ Simulate CSRF State Mismatch (Should Fail)
          </a>
        </div>
      </body>
      </html>
    `);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[MockAuth] Mock auth web server listening on http://localhost:${PORT}`);
    console.log(`[MockAuth] Dev run command: OCS_AUTH_BASE_URL=http://localhost:${PORT} npm start`);
  });
}

module.exports = { server, PORT };
