'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOKEN_NAME = 'COSMISE_MCP_TOKEN';
const APP_ID = 'cosmise-streamboards';

function safeSegment(value, label) {
  const clean = String(value || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(clean) || clean === '.' || clean === '..') throw new Error(`Invalid ${label}.`);
  return clean;
}

function readToken(file) {
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^COSMISE_MCP_TOKEN=(.*)$/);
    if (!match) continue;
    const encoded = match[1].trim();
    if (!encoded) return '';
    if (encoded.startsWith('"')) {
      const value = JSON.parse(encoded);
      return typeof value === 'string' ? value.trim() : '';
    }
    if (encoded.startsWith("'") && encoded.endsWith("'")) return encoded.slice(1, -1).trim();
    return encoded.replace(/\s+#.*$/, '').trim();
  }
  return '';
}

function main() {
  const profileId = safeSegment(process.env.SYM_PROFILE_ID || process.env.SYMPOSIUM_PROFILE_ID, 'profile ID');
  const root = path.resolve(process.env.SYMPOSIUM_PROFILE_RUNTIME_DIR || '/srv/symposium-data/profile-runtime');
  const source = path.join(root, profileId, 'hermes-app-secrets.env');
  const targetDir = path.join(root, profileId, 'apps', APP_ID);
  const target = path.join(targetDir, 'secrets.env');
  const token = readToken(source);
  if (!token) throw new Error('The profile Cosmise connection is not synchronized. Open Connections, select Cosmise, and synchronize this organisation first.');

  fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(targetDir, 0o700);
  const temporary = path.join(targetDir, `.secrets.env.${process.pid}.${Date.now()}`);
  try {
    fs.writeFileSync(temporary, `# Managed app secret. Value is never printed.\n${TOKEN_NAME}=${JSON.stringify(token)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, target);
    fs.chmodSync(target, 0o600);
  } finally {
    try { fs.unlinkSync(temporary); } catch {}
  }
  process.stdout.write(`configured=true profile=${profileId} app=${APP_ID}${os.EOL}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`configured=false error=${String(error?.message || error).replace(/csk_[A-Za-z0-9_-]+/g, '[REDACTED]')}${os.EOL}`);
  process.exitCode = 1;
}
