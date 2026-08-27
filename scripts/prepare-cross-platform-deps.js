const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const requiredSharpPackages = [
  { name: '@img/sharp-win32-x64', version: '0.34.5', tar: 'img-sharp-win32-x64-0.34.5.tgz' },
  { name: '@img/sharp-win32-ia32', version: '0.34.5', tar: 'img-sharp-win32-ia32-0.34.5.tgz' },
  { name: '@img/sharp-darwin-x64', version: '0.34.5', tar: 'img-sharp-darwin-x64-0.34.5.tgz' },
  { name: '@img/sharp-darwin-arm64', version: '0.34.5', tar: 'img-sharp-darwin-arm64-0.34.5.tgz' },
  { name: '@img/sharp-libvips-win32-x64', version: '1.2.2', tar: 'img-sharp-libvips-win32-x64-1.2.2.tgz' },
  { name: '@img/sharp-libvips-win32-ia32', version: '1.2.2', tar: 'img-sharp-libvips-win32-ia32-1.2.2.tgz' }
];

for (const pkg of requiredSharpPackages) {
  const targetDir = path.join(__dirname, '..', 'node_modules', '@img', pkg.name.split('/')[1]);
  if (!fs.existsSync(targetDir) || !fs.existsSync(path.join(targetDir, 'lib'))) {
    console.log(`[CrossBuild] Fetching ${pkg.name}...`);
    fs.mkdirSync(targetDir, { recursive: true });
    try {
      execSync(`npm pack ${pkg.name}@${pkg.version} --pack-destination /tmp`, { stdio: 'inherit' });
      execSync(`tar -xzf /tmp/${pkg.tar} -C "${targetDir}" --strip-components=1`, { stdio: 'inherit' });
    } catch (e) {
      console.warn(`[CrossBuild] Warning: Failed to extract ${pkg.name}:`, e.message);
    }
  }
}
console.log('[CrossBuild] All cross-platform sharp modules verified.');
