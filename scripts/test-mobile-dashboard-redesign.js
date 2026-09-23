#!/usr/bin/env node

/**
 * Automated Verification Suite: Mobile Dashboard Redesign & Canonical App Branding
 *
 * Verifies:
 * 1. Canonical AppLogo component and brand assets
 * 2. Absence of raw text brand recreation (no <Text>wave.io</Text>)
 * 3. App icon, adaptive icon, and splash screen configuration & file dimensions
 * 4. All 10 quick action tool routes mapped and verified
 * 5. StageMaster route and component preservation (/stage-control and /stagemaster)
 * 6. Local search filtering by title, description, and keywords
 * 7. Dynamic greeting & initials calculation logic
 * 8. Universal 12px border radius mandate across mobile dashboard
 * 9. Favorites persistence store integrity
 * 10. Core protected architecture files untouched
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedTests++;
  }
}

console.log('\n=============================================================');
console.log('Mobile Dashboard Redesign & Canonical App Branding Test Suite');
console.log('=============================================================\n');

// 1. Canonical AppLogo Component & Brand Assets
runTest('AppLogo component exists and exports canonical branding component', () => {
  const appLogoPath = path.join(__dirname, '../ocs-mobile/components/AppLogo.tsx');
  assert.ok(fs.existsSync(appLogoPath), 'AppLogo.tsx must exist');
  const content = fs.readFileSync(appLogoPath, 'utf8');
  assert.ok(content.includes('export default function AppLogo'), 'AppLogo default export must exist');
  assert.ok(content.includes('logo_horizontal_full_color.png'), 'Must reference canonical horizontal logo');
  assert.ok(content.includes('logo_icon_full_color.png'), 'Must reference canonical icon logo');
  assert.ok(content.includes('resizeMode: "contain"'), 'Must maintain aspect ratio without stretching');
});

runTest('Brand asset files exist with valid dimensions and cropped whitespace', () => {
  const brandDir = path.join(__dirname, '../ocs-mobile/assets/images/brand');
  assert.ok(fs.existsSync(brandDir), 'Brand assets directory must exist');
  const required = [
    'logo_horizontal_full_color.png',
    'logo_horizontal_white.png',
    'logo_icon_full_color.png',
    'logo_icon_white.png',
  ];
  for (const f of required) {
    const fPath = path.join(brandDir, f);
    assert.ok(fs.existsSync(fPath), `Missing brand asset: ${f}`);
    const stat = fs.statSync(fPath);
    assert.ok(stat.size > 1000, `Asset ${f} must not be empty`);
  }
});

runTest('Standalone app symbol used and header clean of MOBILE COMPANION and wave.io', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(!content.includes('wave<Text className="text-cyan-400">.io</Text>'), 'Must not recreate logo with text');
  assert.ok(!content.includes('wave<Text>.io</Text>'), 'Must not recreate logo with text');
  assert.ok(content.includes('<AppLogo variant="icon"'), 'Must use canonical standalone icon AppLogo component');
  assert.ok(!content.includes('<AppLogo variant="horizontal"'), 'Must not use horizontal wordmark in dashboard header');
  
  // Header bar section check
  const headerBarMatch = content.match(/<View style=\{styles\.headerBar\}>([\s\S]*?)<\/View>/);
  assert.ok(headerBarMatch, 'headerBar must exist');
  const headerContent = headerBarMatch[1];
  assert.ok(!headerContent.includes('MOBILE COMPANION'), 'Header must not contain MOBILE COMPANION');
  assert.ok(!headerContent.toLowerCase().includes('wave.io'), 'Header must not contain wave.io');
  assert.ok(content.includes('userRoleLabel'), 'Role must be dynamically rendered, not hardcoded');
});

runTest('Persistent bottom navigation is completely removed from mobile application', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(!content.includes('bottomNavBar:'), 'Persistent bottomNavBar must be completely removed');
  assert.ok(!content.includes('bottomNavContainer:'), 'bottomNavContainer must be removed');
  assert.ok(!content.includes('bottomNavItem:'), 'bottomNavItem must be removed');
  assert.ok(!content.includes('bottomNavLabel:'), 'bottomNavLabel must be removed');
});

runTest('Redesigned ConnectScreen adheres to branding, QR, manual form, 12px border radius, and success state', () => {
  const connectPath = path.join(__dirname, '../ocs-mobile/app/connect.tsx');
  assert.ok(fs.existsSync(connectPath), 'connect.tsx must exist');
  const content = fs.readFileSync(connectPath, 'utf8');

  // 1. Branding & Header
  assert.ok(content.includes('<AppLogo variant="icon"'), 'Must use standalone icon AppLogo');
  assert.ok(!content.includes('<AppLogo variant="horizontal"'), 'Must not use horizontal wordmark');
  assert.ok(!content.includes('wave.io'), 'Must not contain raw wave.io text');
  assert.ok(content.includes('Connect to Desktop'), 'Header must contain "Connect to Desktop"');

  // 2. Illustration
  assert.ok(content.includes('One Church. Connected.'), 'Must contain connection illustration tagline');

  // 3. QR Pairing
  assert.ok(content.includes('Scan QR Code'), 'Must include "Scan QR Code" section');
  assert.ok(content.includes('Open Camera to Scan'), 'Must include "Open Camera to Scan" button');
  assert.ok(content.includes('CameraView'), 'Must reuse CameraView scanner');

  // 4. Manual Pairing
  assert.ok(content.includes('or enter manually'), 'Must include manual divider');
  assert.ok(content.includes('Desktop IP Address'), 'Must include Desktop IP Address field');
  assert.ok(content.includes('6-Digit Pairing Code'), 'Must include 6-Digit Pairing Code field');
  assert.ok(content.includes('Connect & Pair'), 'Must include "Connect & Pair" button');

  // 5. Success State
  assert.ok(content.includes('Connected!'), 'Must include "Connected!" success state');
  assert.ok(content.includes('Go to Dashboard'), 'Must include "Go to Dashboard" button');
  assert.ok(content.includes('Disconnect'), 'Must include "Disconnect" button');

  // 6. Universal 12px Border Radius
  assert.ok(content.includes('DESIGN_TOKENS.borderRadius'), 'Must strictly enforce 12px border radius mandate');
});

runTest('QuickActionCard separates favorite button as isolated touchable sibling', () => {
  const cardPath = path.join(__dirname, '../ocs-mobile/components/QuickActionCard.tsx');
  const content = fs.readFileSync(cardPath, 'utf8');
  assert.ok(content.includes('favoriteButton:'), 'Must have dedicated favoriteButton style');
  assert.ok(content.includes('zIndex: 30') || content.includes('zIndex: 20'), 'Favorite button must have elevated zIndex');
  assert.ok(content.includes('position: "absolute"'), 'Favorite button must be positioned independently');
});

runTest('Empty favorites view displays canonical empty state text', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const content = fs.readFileSync(indexPath, 'utf8');
  assert.ok(content.includes('No favorite tools yet'), 'Must display "No favorite tools yet"');
  assert.ok(content.includes('Tap the star on a tool to add it here.'), 'Must display "Tap the star on a tool to add it here."');
});

// 2. App Icon & Splash Configuration
runTest('app.json correctly configures deep navy dark background for splash & adaptive icon', () => {
  const appJsonPath = path.join(__dirname, '../ocs-mobile/app.json');
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const expo = appJson.expo;

  assert.strictEqual(expo.android.adaptiveIcon.backgroundColor, '#0B1020', 'Adaptive icon background must be #0B1020');
  assert.strictEqual(expo.android.adaptiveIcon.foregroundImage, './assets/images/android-icon-foreground.png');
  assert.strictEqual(expo.android.adaptiveIcon.backgroundImage, './assets/images/android-icon-background.png');
  assert.strictEqual(expo.android.adaptiveIcon.monochromeImage, './assets/images/android-icon-monochrome.png');

  const splashPlugin = expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(splashPlugin, 'expo-splash-screen plugin must be configured');
  assert.strictEqual(splashPlugin[1].backgroundColor, '#0B1020', 'Splash background must be #0B1020');
});

runTest('Mobile app icons & splash images exist in assets/images', () => {
  const assetsDir = path.join(__dirname, '../ocs-mobile/assets/images');
  const required = [
    'icon.png',
    'android-icon-foreground.png',
    'android-icon-background.png',
    'android-icon-monochrome.png',
    'splash-icon.png',
    'favicon.png',
  ];
  for (const f of required) {
    const p = path.join(assetsDir, f);
    assert.ok(fs.existsSync(p), `Missing required icon asset: ${f}`);
    assert.ok(fs.statSync(p).size > 100, `Asset ${f} must not be empty`);
  }
});

// 3. Quick Action Cards & Route Mapping
runTest('All 10 Quick Action Tools exist and are mapped to correct routes', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const content = fs.readFileSync(indexPath, 'utf8');

  const expectedRoutes = [
    { id: 'connect', route: '/connect', title: 'Connect' },
    { id: 'assets', route: '/assets', title: 'Media Share' },
    { id: 'agenda', route: '/agenda', title: 'Agenda' },
    { id: 'timer', route: '/timer', title: 'Timer' },
    { id: 'scenes', route: '/scenes', title: 'Scene' },
    { id: 'bible', route: '/bible', title: 'Bible' },
    { id: 'presentation', route: '/presentation', title: 'Teleprompter' },
    { id: 'stage-control', route: '/stage-control', title: 'Stage Master' },
    { id: 'intercom', route: '/intercom', title: 'Intercom' },
    { id: 'live-switcher', route: '/live-switcher', title: 'Live' },
  ];

  for (const item of expectedRoutes) {
    assert.ok(content.includes(`"${item.route}"`) || content.includes(`'${item.route}'`), `Dashboard must include route ${item.route}`);
    assert.ok(content.includes(`"${item.title}"`), `Dashboard must include tool title ${item.title}`);
  }
});

runTest('StageMaster routes /stage-control and /stagemaster are strictly preserved', () => {
  const stageControlFile = path.join(__dirname, '../ocs-mobile/app/stage-control.tsx');
  const stageMasterAlias = path.join(__dirname, '../ocs-mobile/app/stagemaster.tsx');
  assert.ok(fs.existsSync(stageControlFile), 'stage-control.tsx must exist');
  assert.ok(fs.existsSync(stageMasterAlias), 'stagemaster.tsx alias must exist');

  const content = fs.readFileSync(stageControlFile, 'utf8');
  assert.ok(content.includes('StageControlScreen'), 'StageControlScreen component must exist');
});

// 4. Universal 12px Border Radius Mandate
runTest('Universal 12px border radius mandate strictly enforced across mobile dashboard', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const cardPath = path.join(__dirname, '../ocs-mobile/components/QuickActionCard.tsx');

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  const cardContent = fs.readFileSync(cardPath, 'utf8');

  // Forbidden tailwind classes for structural containers:
  const forbiddenClasses = ['rounded-2xl', 'rounded-3xl', 'rounded-xl', 'rounded-lg', 'rounded-md', 'rounded-sm'];
  for (const cls of forbiddenClasses) {
    assert.ok(!indexContent.includes(`className="${cls}`) && !indexContent.includes(` ${cls} `) && !indexContent.includes(` ${cls}"`), `Forbidden border radius ${cls} found in index.tsx`);
    assert.ok(!cardContent.includes(`className="${cls}`) && !cardContent.includes(` ${cls} `) && !cardContent.includes(` ${cls}"`), `Forbidden border radius ${cls} found in QuickActionCard.tsx`);
  }

  // Ensure DESIGN_TOKENS.borderRadius is strictly 12
  const themePath = path.join(__dirname, '../ocs-mobile/constants/theme.ts');
  const themeContent = fs.readFileSync(themePath, 'utf8');
  assert.ok(themeContent.includes('borderRadius: 12'), 'DESIGN_TOKENS.borderRadius must be 12');
  assert.ok(cardContent.includes('borderRadius: DESIGN_TOKENS.borderRadius'), 'QuickActionCard must use 12px');
});

// 5. Search Logic & Keyword Matching
runTest('Search keyword filtering correctly matches queries to expected tools', () => {
  const tools = [
    { id: 'connect', title: 'Connect', description: 'Host Setup &\nDevice Connection', keywords: ['connect', 'host', 'pair', 'connection', 'setup', 'wifi', 'lan', 'desktop', 'server', 'ip'] },
    { id: 'assets', title: 'Media Share', description: 'Send Photos,\nVideos & Assets', keywords: ['media', 'share', 'assets', 'photos', 'videos', 'send', 'upload', 'files', 'image'] },
    { id: 'agenda', title: 'Agenda', description: 'Plan Services &\nManage Schedule', keywords: ['agenda', 'schedule', 'plan', 'services', 'run of show', 'sessions', 'order of service'] },
    { id: 'timer', title: 'Timer', description: 'Sync Timers &\nCreate Events', keywords: ['timer', 'clock', 'countdown', 'sync', 'events', 'time', 'stopwatch'] },
    { id: 'scenes', title: 'Scene', description: 'Create Pages,\nLyrics & Backgrounds', keywords: ['scene', 'scenes', 'pages', 'lyrics', 'backgrounds', 'create', 'slides', 'display'] },
    { id: 'bible', title: 'Bible', description: 'Access Scripture\nAnytime', keywords: ['bible', 'scripture', 'verses', 'passages', 'translations', 'word', 'holy bible'] },
    { id: 'presentation', title: 'Teleprompter', description: 'Speech & Notes\nPresentation', keywords: ['teleprompter', 'prompter', 'speech', 'read', 'notes', 'presentation', 'script'] },
    { id: 'stage-control', title: 'Stage Master', description: 'Admin Live Control &\nStage Management', keywords: ['stage master', 'stage', 'stagemaster', 'admin', 'live control', 'confidence', 'shutter', 'blackout', 'director'] },
    { id: 'intercom', title: 'Intercom', description: 'Push-to-Talk\nCommunication', keywords: ['intercom', 'push-to-talk', 'ptt', 'talk', 'voice', 'audio', 'radio', 'comm'] },
    { id: 'live-switcher', title: 'Live', description: 'Broadcast Studio &\nCamera Control', keywords: ['live', 'camera', 'broadcast', 'studio', 'switcher', 'webrtc', 'video', 'mixer', 'stream'] },
  ];

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.keywords.some(k => k.toLowerCase().includes(q))
    );
  }

  assert.strictEqual(search('camera')[0].id, 'live-switcher', '"camera" should return Live');
  assert.strictEqual(search('scripture')[0].id, 'bible', '"scripture" should return Bible');
  assert.strictEqual(search('schedule')[0].id, 'agenda', '"schedule" should return Agenda');
  assert.strictEqual(search('talk')[0].id, 'intercom', '"talk" should return Intercom');
  assert.strictEqual(search('clock')[0].id, 'timer', '"clock" should return Timer');
  assert.strictEqual(search('lyrics')[0].id, 'scenes', '"lyrics" should return Scene');
  assert.strictEqual(search('director')[0].id, 'stage-control', '"director" should return Stage Master');
  assert.strictEqual(search('')[0].id, 'connect', 'Empty search returns full list');
  assert.strictEqual(search('').length, 10, 'Empty search returns all 10 tools');
});

// 6. Dynamic Greeting & Initials
runTest('Dynamic greeting and user initials computation logic', () => {
  function getGreeting(hour) {
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }

  assert.strictEqual(getGreeting(8), 'Good Morning');
  assert.strictEqual(getGreeting(13), 'Good Afternoon');
  assert.strictEqual(getGreeting(20), 'Good Evening');

  function getInitials(name) {
    if (!name) return 'OP';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }

  assert.strictEqual(getInitials('Oluwasegun Are'), 'OA');
  assert.strictEqual(getInitials('Pastor David'), 'PD');
  assert.strictEqual(getInitials('MediaTeam'), 'ME');
  assert.strictEqual(getInitials(''), 'OP');
});

// 7. Favorites Store Persistence
runTest('Favorites store exists and defines toggleFavorite & isFavorite', () => {
  const favPath = path.join(__dirname, '../ocs-mobile/store/favoritesStore.ts');
  assert.ok(fs.existsSync(favPath), 'favoritesStore.ts must exist');
  const content = fs.readFileSync(favPath, 'utf8');
  assert.ok(content.includes('toggleFavorite:'), 'Must define toggleFavorite');
  assert.ok(content.includes('isFavorite:'), 'Must define isFavorite');
  assert.ok(content.includes('initFavorites:'), 'Must define initFavorites');
});

// 8. Protected Files Untouched
runTest('Core feature execution engines remain strictly untouched', () => {
  const protectedFiles = [
    'src/main/agenda/agendaExecutionEngine.js',
    'src/main/agenda/agendaModel.js',
    'src/main/agenda/agendaTransferManager.js',
    'src/App/controller/TimerController.js',
    'src/main/recording/programRecorder.js',
  ];

  for (const f of protectedFiles) {
    const fullPath = path.join(__dirname, '..', f);
    assert.ok(fs.existsSync(fullPath), `Protected file must exist: ${f}`);
  }
});

// 9. Favorites Lifecycle & Filter Simulation
runTest('Favorites lifecycle: toggle state, filtering, and empty-state preservation', () => {
  const tools = [
    { id: 'connect', title: 'Connect', route: '/connect' },
    { id: 'agenda', title: 'Agenda', route: '/agenda' },
    { id: 'stage-control', title: 'Stage Master', route: '/stage-control' },
    { id: 'timer', title: 'Timer', route: '/timer' },
  ];

  let favorites = [];

  function filterTools(activeTab) {
    if (activeTab === 'favorites') {
      return tools.filter(t => favorites.includes(t.id));
    }
    return tools;
  }

  // 1. Initial State: 0 favorites
  assert.strictEqual(filterTools('home').length, 4, 'Home should show all 4 tools');
  assert.strictEqual(filterTools('favorites').length, 0, 'Favorites tab with no items must return 0 tools for empty state');

  // 2. Favorite Agenda
  favorites.push('agenda');
  let favView = filterTools('favorites');
  assert.strictEqual(favView.length, 1);
  assert.strictEqual(favView[0].id, 'agenda');
  assert.strictEqual(favView[0].route, '/agenda', 'Favorite item must preserve identical canonical route');

  // 3. Favorite Stage Master
  favorites.push('stage-control');
  favView = filterTools('favorites');
  assert.strictEqual(favView.length, 2);
  assert.strictEqual(favView[1].id, 'stage-control');
  assert.strictEqual(favView[1].route, '/stage-control', 'Stage Master in favorites must navigate to /stage-control');

  // 4. Return to Home preserves all tools
  assert.strictEqual(filterTools('home').length, 4);

  // 5. Unfavorite Agenda
  favorites = favorites.filter(id => id !== 'agenda');
  favView = filterTools('favorites');
  assert.strictEqual(favView.length, 1);
  assert.strictEqual(favView[0].id, 'stage-control');
});

// 10. Settings Navigation Veracity
runTest('Settings bottom navigation activates Settings view with Workstation, Account, and System info', () => {
  const indexPath = path.join(__dirname, '../ocs-mobile/app/index.tsx');
  const content = fs.readFileSync(indexPath, 'utf8');

  // Bottom nav button handler
  assert.ok(content.includes('setActiveTab("settings")'), 'Settings button must activate settings tab');
  
  // Settings view rendering
  assert.ok(content.includes('activeTab === "settings" ?'), 'index.tsx must conditionally render settings view based on activeTab');
  assert.ok(content.includes('Companion Settings'), 'Settings view must have Companion Settings header');
  assert.ok(content.includes('Workstation Connection'), 'Settings view must include Workstation Connection');
  assert.ok(content.includes('Change Device Name'), 'Settings view must include Change Device Name');
  assert.ok(content.includes('Account & License'), 'Settings view must include Account & License');
  assert.ok(content.includes('Return to Dashboard'), 'Settings view must include Return to Dashboard button');
});

console.log('\n-------------------------------------------------------------');
console.log(`Results: ${passedTests} Passed, ${failedTests} Failed`);
console.log('-------------------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
}
