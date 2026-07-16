'use strict';

const crypto = require('node:crypto');

const DEFAULT_MCP_URL = 'https://cosmise.com/api/mcp';

function cleanError(error) {
  return String(error?.message || error || 'Cosmise MCP call failed')
    .replace(/csk_[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .slice(0, 500);
}

function parsedToolData(result) {
  const text = result?.content?.find((item) => item?.type === 'text' && typeof item.text === 'string')?.text;
  if (!text) return result?.structuredContent ?? result ?? null;
  try { return JSON.parse(text); } catch { return text; }
}

function phaseFor(tool) {
  if (tool.category === 'Cache & data') return tool.mode === 'write' ? 'refreshing' : 'reading';
  if (tool.category === 'Publication & access' || tool.category === 'Reports') return 'publishing';
  if (tool.category === 'Discovery & verification' || tool.name.includes('validate') || tool.name.includes('diagnose')) return 'verifying';
  return tool.mode === 'write' ? 'building' : 'reading';
}

function labelFor(name) {
  return String(name || '').replace(/^streamboards_/, '').replaceAll('_', ' ');
}

function firstObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value.data && typeof value.data === 'object' && !Array.isArray(value.data) ? value.data : value;
}

function arrayFrom(value) {
  if (Array.isArray(value)) return value;
  const object = firstObject(value);
  for (const key of ['streamboards', 'boards', 'items', 'results']) if (Array.isArray(object?.[key])) return object[key];
  return [];
}

class CosmiseClient {
  constructor({ token, endpoint, store, catalog }) {
    this.token = String(token || '').trim();
    this.endpoint = String(endpoint || DEFAULT_MCP_URL).trim();
    this.store = store;
    this.tools = new Map(catalog.tools.map((tool) => [tool.name, tool]));
    this.syncing = false;
    this.timer = null;
  }

  configured() {
    return Boolean(this.token);
  }

  async rpc(method, params = {}) {
    if (!this.token) throw new Error('Cosmise MCP token is not configured for this app backend.');
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new Error(body?.error?.message || body?.error || `Cosmise MCP returned HTTP ${response.status}`);
    return body.result;
  }

  async callTool(name, args = {}, options = {}) {
    const tool = this.tools.get(String(name || ''));
    if (!tool) throw new Error('Unknown Streamboards MCP tool.');
    const started = Date.now();
    const callId = crypto.randomUUID();
    const task = this.store.activeTask();
    const activity = {
      call_id: callId,
      task_id: task?.id,
      source: 'cosmise_mcp_wrapper',
      status: 'running',
      phase: phaseFor(tool),
      operation: tool.name,
      title: `${labelFor(tool.name)} started`,
      detail: `Cosmise is ${labelFor(tool.name)}.`,
      resource: args.streamboard_id ? { type: 'streamboard', id: String(args.streamboard_id) } : null
    };
    if (options.record !== false) this.store.upsertCallEvent(activity);
    try {
      const mcpResult = await this.rpc('tools/call', { name: tool.name, arguments: args && typeof args === 'object' ? args : {} });
      if (mcpResult?.isError) throw new Error(parsedToolData(mcpResult)?.error || parsedToolData(mcpResult) || `${tool.name} failed`);
      const data = parsedToolData(mcpResult);
      if (options.record !== false) this.store.upsertCallEvent({
        ...activity,
        status: 'success',
        title: `${labelFor(tool.name)} complete`,
        detail: `${labelFor(tool.name)} completed successfully.`,
        duration_ms: Date.now() - started
      });
      this.applyResult(tool.name, args, data);
      if (tool.mode === 'write') {
        const refresh = setTimeout(() => this.reconcile(), 250);
        refresh.unref?.();
      }
      return { tool: tool.name, data, mcp_result: mcpResult, duration_ms: Date.now() - started };
    } catch (error) {
      const message = cleanError(error);
      if (options.record !== false) this.store.upsertCallEvent({
        ...activity,
        status: 'failed',
        title: `${labelFor(tool.name)} failed`,
        detail: message,
        duration_ms: Date.now() - started
      });
      this.store.updateConnection({ configured: this.configured(), state: 'error', message });
      throw new Error(message);
    }
  }

  applyResult(name, args, data) {
    const value = firstObject(data) || {};
    if (name === 'streamboards_get_context' || name === 'streamboards_get_org_context') {
      const organisation = value.organisation || value.organization || value.org || null;
      const endpoint = value.endpoint || null;
      this.store.updateConnection({ configured: true, state: 'ready', mode: value.mode || 'read_write', organisation, endpoint, message: 'Cosmise MCP connected.' });
    } else if (name === 'streamboards_list') {
      this.store.reconcileReports(arrayFrom(data));
    } else if (name === 'streamboards_get_urls') {
      this.store.mergeReportUrls(args.streamboard_id, value);
    } else if (value.streamboard_id && (value.public_url || value.editable_url || value.edit_url)) {
      this.store.mergeReportUrls(value.streamboard_id, value);
    }
  }

  async reconcile() {
    if (!this.configured() || this.syncing) return;
    this.syncing = true;
    try {
      this.store.updateConnection({ configured: true, state: 'checking', message: 'Refreshing Cosmise Streamboards.' });
      await this.callTool('streamboards_get_context', {}, { record: true });
      const listed = await this.callTool('streamboards_list', {}, { record: true });
      const boards = arrayFrom(listed.data).slice(0, 100);
      const known = new Map(this.store.snapshot().reports.map((report) => [report.streamboard_id || report.id, report]));
      for (const board of boards) {
        const id = String(board?.streamboard_id || board?.id || '').trim();
        if (!id || known.get(id)?.public_url) continue;
        try { await this.callTool('streamboards_get_urls', { streamboard_id: id }, { record: true }); } catch { /* surfaced in state */ }
      }
      this.store.updateConnection({ configured: true, state: 'ready', message: 'Cosmise Streamboards are synchronized.' });
    } catch {
      // callTool records the safe failure and connection state.
    } finally {
      this.syncing = false;
    }
  }

  start(intervalMs = 15000) {
    if (!this.configured()) {
      this.store.updateConnection({ configured: false, state: 'missing_key', mode: null, message: 'Cosmise MCP token is missing from the app backend environment.' });
      return;
    }
    this.reconcile();
    this.timer = setInterval(() => this.reconcile(), intervalMs);
    this.timer.unref?.();
  }
}

module.exports = { CosmiseClient, cleanError, parsedToolData };
