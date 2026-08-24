/**
 * Hardware Machine Identification Module
 *
 * Generates an immutable, deterministic SHA-256 hardware identifier for anti-tamper
 * workstation tracking. Survives application re-installs and cache wipes.
 */

const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

let cachedMachineId = null;

function getRawHardwareId() {
  const platform = os.platform();

  if (platform === 'darwin') {
    try {
      // macOS IOPlatformUUID
      const out = execSync('ioreg -rd1 -c IOPlatformExpertDevice', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (match && match[1]) return `darwin:${match[1].trim()}`;
    } catch (_) {}

    try {
      // Fallback: system_profiler SPHardwareDataType
      const out = execSync('system_profiler SPHardwareDataType', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = out.match(/Hardware UUID:\s*([^\n\r]+)/i) || out.match(/Serial Number[^:]*:\s*([^\n\r]+)/i);
      if (match && match[1]) return `darwin:${match[1].trim()}`;
    } catch (_) {}
  } else if (platform === 'win32') {
    try {
      // Windows BIOS / Motherboard UUID via PowerShell
      const out = execSync('powershell.exe -NoProfile -Command "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID"', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const trimmed = out.trim();
      if (trimmed && trimmed.length > 8 && !trimmed.includes('00000000')) {
        return `win32:${trimmed}`;
      }
    } catch (_) {}

    try {
      // Windows registry MachineGuid
      const out = execSync('reg query "HKLM\\SOFTWARE\\Microsoft\\Cryptography" /v MachineGuid', {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      const match = out.match(/MachineGuid\s+REG_SZ\s+([^\n\r]+)/i);
      if (match && match[1]) return `win32:${match[1].trim()}`;
    } catch (_) {}
  } else if (platform === 'linux') {
    const fs = require('fs');
    try {
      if (fs.existsSync('/etc/machine-id')) {
        const id = fs.readFileSync('/etc/machine-id', 'utf8').trim();
        if (id) return `linux:${id}`;
      }
      if (fs.existsSync('/var/lib/dbus/machine-id')) {
        const id = fs.readFileSync('/var/lib/dbus/machine-id', 'utf8').trim();
        if (id) return `linux:${id}`;
      }
      if (fs.existsSync('/sys/class/dmi/id/product_uuid')) {
        const id = fs.readFileSync('/sys/class/dmi/id/product_uuid', 'utf8').trim();
        if (id) return `linux:${id}`;
      }
    } catch (_) {}
  }

  // Cross-Platform Fallback: CPU & Hostname & Primary Interface Fingerprint
  const networkInterfaces = os.networkInterfaces();
  const macAddresses = [];
  for (const name of Object.keys(networkInterfaces)) {
    for (const net of networkInterfaces[name] || []) {
      if (!net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
        macAddresses.push(net.mac);
      }
    }
  }
  macAddresses.sort();

  const cpuModel = (os.cpus() && os.cpus()[0] && os.cpus()[0].model) || 'unknown_cpu';
  const fallbackRaw = `${os.hostname()}:${os.arch()}:${cpuModel}:${macAddresses.join(',')}`;
  return `fallback:${fallbackRaw}`;
}

/**
 * Returns a consistent, non-reversible SHA-256 machine hash
 */
function getMachineId() {
  if (cachedMachineId) return cachedMachineId;
  const raw = getRawHardwareId();
  cachedMachineId = crypto
    .createHash('sha256')
    .update(`OCS_HW_SALT_v1:${raw}`)
    .digest('hex');
  return cachedMachineId;
}

module.exports = {
  getMachineId,
  getRawHardwareId,
};
