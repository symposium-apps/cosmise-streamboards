'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TOKEN_NAME = 'COSMISE_MCP_TOKEN';

function safeSegment(value) {
  const segment = String(value || '').trim();
  return /^[A-Za-z0-9_.-]{1,80}$/.test(segment) ? segment : null;
}

function parseEnvironmentValue(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (value.startsWith('"')) {
    try { return String(JSON.parse(value)); } catch { return ''; }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value.replace(/\s+#.*$/, '').trim();
}

function readNamedValue(file, name) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match?.[1] === name) return parseEnvironmentValue(match[2]);
    }
  } catch {
    return '';
  }
  return '';
}

function candidateFiles(profileId) {
  const explicit = String(process.env.COSMISE_PROFILE_ENV_FILE || '').trim();
  const profile = safeSegment(profileId);
  return [
    explicit,
    profile ? path.join('/srv/symposium-data/profile-runtime', profile, 'hermes-app-secrets.env') : '',
    profile ? path.join(process.env.HOME || '', '.hermes', 'profiles', profile, '.env') : ''
  ].filter(Boolean);
}

function loadCosmiseCredential(profileId) {
  const existing = String(process.env[TOKEN_NAME] || '').trim();
  if (existing) return { token: existing, source: 'process_environment' };
  for (const file of candidateFiles(profileId)) {
    const token = readNamedValue(file, TOKEN_NAME);
    if (!token) continue;
    process.env[TOKEN_NAME] = token;
    return { token, source: 'profile_environment' };
  }
  return { token: '', source: 'missing' };
}

module.exports = { TOKEN_NAME, loadCosmiseCredential };
