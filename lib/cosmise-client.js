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
    this.connectionTimer = null;
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
    if (options.focus !== false && args.streamboard_id) this.store.focusStreamboard(String(args.streamboard_id), { task_id: task?.id, status: 'running', source: 'wrapped_mcp' }, false);
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
      this.applyResult(tool.name, args, data, options);
      if (tool.mode === 'write') {
        const refresh = setTimeout(() => this.reconcileReports(), 250);
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

  applyResult(name, args, data, options = {}) {
    const value = firstObject(data) || {};
    if (name === 'streamboards_get_context' || name === 'streamboards_get_org_context') {
      const organisation = value.organisation || value.organization || value.org || null;
      const endpoint = value.endpoint || null;
      this.store.updateConnection({ configured: true, state: 'ready', mode: value.mode || 'read_write', organisation, endpoint, message: 'Cosmise MCP connected.' });
    } else if (name === 'streamboards_list') {
      this.store.reconcileReports(arrayFrom(data));
    } else if (name === 'streamboards_get_publication') {
      this.store.mergeReportPublication(args.streamboard_id, value);
    } else if (name === 'streamboards_get_urls') {
      this.store.mergeReportUrls(args.streamboard_id, value);
    } else if (value.streamboard_id && (value.public_url || value.editable_url || value.edit_url)) {
      this.store.mergeReportUrls(value.streamboard_id, value);
    }
    const createdBoard = value.streamboard && typeof value.streamboard === 'object' ? value.streamboard : value;
    const createdBoardId = /^streamboards_create(?:_(?:blank|from_template))?$/.test(name) ? String(createdBoard.id || value.streamboard_id || '') : '';
    const task = this.store.activeTask();
    if (createdBoardId && task && !task.resource?.id) this.store.updateTask(task.id, { resource: { type: 'streamboard', id: createdBoardId, title: String(createdBoard.name || task.title || 'Streamboard') } });
    const focusedId = String(value.streamboard_id || args.streamboard_id || createdBoardId || '').trim();
    if (options.focus !== false && focusedId && name !== 'streamboards_list') this.store.focusStreamboard(focusedId, { status: 'success', source: 'wrapped_mcp_result' });
  }

  async publicResolverMatches(streamboardId, input = {}) {
    const publicUrl = String(input.public_url || '').trim();
    const orgPrettyId = String(input.org_pretty_id || '').trim();
    const slug = String(input.streamboard_slug || input.slug || '').trim();
    if (!publicUrl || !orgPrettyId || !slug) return false;
    const resolver = new URL('/api/streamboards/public/resolve', publicUrl);
    resolver.search = new URLSearchParams({ org_pretty_id: orgPrettyId, slug }).toString();
    const response = await fetch(resolver, { headers: { accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    return response.ok && body.ok === true && String(body.streamboard_id || '') === streamboardId;
  }

  async reconcileReports() {
    if (!this.configured() || this.syncing) return;
    this.syncing = true;
    try {
      const listed = await this.callTool('streamboards_list', {}, { record: false, focus: false });
      const boards = arrayFrom(listed.data).slice(0, 100);
      for (const board of boards.slice(0, 20)) {
        const id = String(board?.streamboard_id || board?.id || '').trim();
        if (!id) continue;
        try {
          const publication = await this.callTool('streamboards_get_publication', { streamboard_id: id }, { record: false, focus: false });
          const state = firstObject(publication.data) || {};
          if (state.is_public !== true && state.protected !== true) continue;
          const urls = await this.callTool('streamboards_get_urls', { streamboard_id: id }, { record: false, focus: false });
          const resolverOk = await this.publicResolverMatches(id, firstObject(urls.data) || {});
          this.store.mergeReportResolution(id, resolverOk);
        } catch { /* connection state carries safe error */ }
      }
    } finally {
      this.syncing = false;
    }
  }

  async reconcile(options = {}) {
    if (!this.configured() || this.syncing) return;
    this.syncing = true;
    try {
      this.store.updateConnection({ configured: true, state: 'checking', message: 'Refreshing Cosmise Streamboards.' });
      await this.callTool('streamboards_get_context', {}, { record: options.record !== false, focus: false });
      await this.callTool('streamboards_list', {}, { record: false });
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
    this.reconcile({ record: false });
    this.timer = setInterval(() => this.reconcileReports(), intervalMs);
    this.timer.unref?.();
    this.connectionTimer = setInterval(() => this.reconcile({ record: false }), 60000);
    this.connectionTimer.unref?.();
  }
}

module.exports = { CosmiseClient, cleanError, parsedToolData };
