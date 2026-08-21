# OCS — Organised Church Service

## Testing auth locally

The hosted login page isn't live yet. To test the desktop login flow end-to-end:

1. `node scripts/mock-auth-server.js` (defaults to http://localhost:5175)
2. `OCS_AUTH_BASE_URL=http://localhost:5175 npm start`
3. Click "Log In" in the app — it opens the mock login page in your browser,
   where you can choose a valid/pro/rejected login scenario.

Do not set OCS_AUTH_BASE_URL in any shell profile or CI environment that also
builds production packages — a startup guard will refuse to launch a packaged
build if authLoginUrl doesn't resolve to the real production domain, but it's
still best avoided.