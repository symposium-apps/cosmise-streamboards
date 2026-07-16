'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const DEFAULT_MCP_URL = 'https://cosmise.com/api/mcp';
const TOKEN_ENV_NAMES = ['COSMISE_MCP_TOKEN', 'MCP_COSMISE_STREAMBOARDS_API_KEY'];

function parseManagedEnvironment(file) {
  try {
    const values = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      let value = match[2].trim();
      try { value = JSON.parse(value); } catch { value = value.replace(/^['"]|['"]$/g, ''); }
      values[match[1]] = String(value || '');
    }
    return values;
  } catch {
    return {};
  }
}

function importManagedProfileCredential() {
  const profile = String(process.env.SYM_PROFILE_ID || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(profile)) return '';
  const files = [
    `/srv/symposium-data/profile-runtime/${profile}/hermes-app-secrets.env`,
    `/srv/symposium-data/hermes-home/.hermes/profiles/${profile}/.env`
  ];
  for (const file of files) {
    const values = parseManagedEnvironment(file);
    for (const name of TOKEN_ENV_NAMES) {
      const value = String(values[name] || '').trim();
      if (value) {
        process.env.COSMISE_MCP_TOKEN = value;
        return value;
      }
    }
  }
  return '';
}

function credentialFromEnvironment() {
  for (const name of TOKEN_ENV_NAMES) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return importManagedProfileCredential();
}

function endpointFromEnvironment() {
  const value = String(process.env.COSMISE_MCP_URL || DEFAULT_MCP_URL).trim();
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'cosmise.com' || parsed.hostname.endsWith('.cosmise.com'))) {
    throw new Error('COSMISE_MCP_URL must use HTTPS on cosmise.com.');
  }
  return parsed.toString();
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function bearerToken(headers = {}) {
  const value = String(headers.authorization || headers.Authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function parseToolPayload(result) {
  const text = result?.content?.find?.((item) => item?.type === 'text')?.text;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

class CosmiseMcpClient {
  constructor({ token, endpoint, timeoutMs = 60000 } = {}) {
    this.token = String(token || credentialFromEnvironment()).trim();
    this.endpoint = endpoint || endpointFromEnvironment();
    this.timeoutMs = timeoutMs;
    this.toolCache = null;
    this.toolCacheAt = 0;
  }

  configured() {
    return this.token.length > 0;
  }

  authorizes(headers) {
    return this.configured() && safeEqual(bearerToken(headers), this.token);
  }

  async request(method, params = {}, id = crypto.randomUUID()) {
    if (!this.configured()) throw new Error('COSMISE_MCP_TOKEN is not configured for this app backend.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${this.token}`
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(response.status === 401 ? 'Cosmise MCP credential was rejected.' : `Cosmise MCP request failed (${response.status}).`);
      if (!body || body.jsonrpc !== '2.0') throw new Error('Cosmise MCP returned an invalid JSON-RPC response.');
      if (body.error) throw new Error(String(body.error.message || 'Cosmise MCP error'));
      return body.result;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('Cosmise MCP request timed out.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async ping() {
    return this.request('ping');
  }

  async tools({ refresh = false } = {}) {
    const age = Date.now() - this.toolCacheAt;
    if (!refresh && this.toolCache && age < 60000) return this.toolCache;
    const result = await this.request('tools/list');
    const tools = Array.isArray(result?.tools) ? result.tools.filter((tool) => String(tool?.name || '').startsWith('streamboards_')) : [];
    this.toolCache = tools;
    this.toolCacheAt = Date.now();
    return tools;
  }

  async callTool(name, args = {}) {
    const toolName = String(name || '').trim();
    if (!toolName.startsWith('streamboards_')) throw new Error('Only Streamboards MCP tools can use this wrapper.');
    return this.request('tools/call', { name: toolName, arguments: args });
  }
}

module.exports = {
  CosmiseMcpClient,
  DEFAULT_MCP_URL,
  TOKEN_ENV_NAMES,
  bearerToken,
  credentialFromEnvironment,
  importManagedProfileCredential,
  parseToolPayload,
  safeEqual
};
