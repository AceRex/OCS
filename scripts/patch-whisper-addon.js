/**
 * Fix @kutalia/whisper-node-addon macOS prebuilds:
 * 1) Folder name is mac-arm64 / mac-x64 (upstream JS looks for darwin-*).
 * 2) whisper.node LC_RPATH points at a CI absolute path — rewrite to @loader_path.
 *
 * Safe to run repeatedly. No-op on non-darwin or if tools/binaries missing.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'node_modules', '@kutalia', 'whisper-node-addon');

function patchRpath(binPath) {
  if (process.platform !== 'darwin') return false;
  let listing;
  try {
    listing = execFileSync('otool', ['-l', binPath], { encoding: 'utf8' });
  } catch {
    return false;
  }
  const rpaths = [];
  const lines = listing.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('LC_RPATH')) {
      const pathLine = lines[i + 2] || '';
      const m = pathLine.match(/path\s+(\S+)/);
      if (m) rpaths.push(m[1]);
    }
  }
  const isBroken = (rp) =>
    rp.includes('/Users/runner/') ||
    rp.includes('/home/runner/') ||
    /whisper\.cpp\/build/.test(rp);

  let changed = false;
  for (const rp of rpaths) {
    if (!isBroken(rp)) continue;
    try {
      if (rpaths.includes('@loader_path')) {
        execFileSync('install_name_tool', ['-delete_rpath', rp, binPath], { stdio: 'ignore' });
      } else {
        execFileSync('install_name_tool', ['-rpath', rp, '@loader_path', binPath], { stdio: 'ignore' });
      }
      changed = true;
    } catch (_) {}
  }
  if (!rpaths.includes('@loader_path') && !rpaths.some(isBroken)) {
    try {
      execFileSync('install_name_tool', ['-add_rpath', '@loader_path', binPath], { stdio: 'ignore' });
      changed = true;
    } catch (_) {}
  } else if (!rpaths.includes('@loader_path')) {
    // Broken path may have been rewritten above; verify
    try {
      const after = execFileSync('otool', ['-l', binPath], { encoding: 'utf8' });
      if (!after.includes('@loader_path')) {
        execFileSync('install_name_tool', ['-add_rpath', '@loader_path', binPath], { stdio: 'ignore' });
        changed = true;
      }
    } catch (_) {}
  }
  return changed || rpaths.includes('@loader_path');
}

function patchDir(archDir) {
  if (!fs.existsSync(archDir)) return 0;
  let n = 0;
  for (const name of fs.readdirSync(archDir)) {
    if (!/\.(node|dylib)$/.test(name)) continue;
    const p = path.join(archDir, name);
    if (patchRpath(p)) n += 1;
  }
  return n;
}

function symlinkDarwinAliases(distDir) {
  if (process.platform !== 'darwin') return;
  const pairs = [
    ['mac-arm64', 'darwin-arm64'],
    ['mac-x64', 'darwin-x64'],
  ];
  for (const [real, alias] of pairs) {
    const realPath = path.join(distDir, real);
    const aliasPath = path.join(distDir, alias);
    if (!fs.existsSync(realPath) || fs.existsSync(aliasPath)) continue;
    try {
      fs.symlinkSync(real, aliasPath);
      console.log(`[patch-whisper-addon] linked ${alias} → ${real}`);
    } catch (e) {
      console.warn(`[patch-whisper-addon] symlink ${alias}:`, e.message);
    }
  }
}

function main() {
  if (!fs.existsSync(PKG)) {
    console.log('[patch-whisper-addon] package not installed — skip');
    return;
  }
  const dist = path.join(PKG, 'dist');
  symlinkDarwinAliases(dist);
  const arches = ['mac-arm64', 'mac-x64', 'darwin-arm64', 'darwin-x64'];
  let patched = 0;
  for (const arch of arches) {
    const archDir = path.join(dist, arch);
    const n = patchDir(archDir);
    if (n) {
      patched += n;
      console.log(`[patch-whisper-addon] rpath OK: ${arch}/ (${n} binaries)`);
    }
  }
  if (!patched && process.platform === 'darwin') {
    console.warn('[patch-whisper-addon] no whisper binaries found under dist/');
  }
}

if (require.main === module) main();

module.exports = { main, patchRpath };
