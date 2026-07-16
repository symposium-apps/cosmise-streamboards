'use strict';

const express = require('express');
const os = require('node:os');
const path = require('node:path');
const { AppStore } = require('./lib/store');
const { CosmiseMcpClient, parseToolPayload } = require('./lib/cosmise-client');
const { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, createMcp, LOCAL_TOOLS } = require('./lib/mcp');
const catalog = require('./data/tool-catalog.json');
const { listLayoutTemplates, getLayoutTemplate, library: layoutLibrary } = require('./lib/layout-library');

const DATA_FILE = global.__COSMISE_TEST_DATA_FILE__ || path.join(__dirname, '.sym-data', 'state.json');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4322);
const PROFILE_ID = process.env.SYM_PROFILE_ID || 'local';
const REPORT_SYNC_MS = Math.max(30000, Number(process.env.COSMISE_REPORT_SYNC_MS || 60000));

const store = new AppStore({ file: DATA_FILE, profileId: PROFILE_ID });
const production = new CosmiseMcpClient();
const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-src https://cosmise.com https://*.cosmise.com; base-uri 'none'; form-action 'self'");
  next();
});

function receipt(action, data, verification = null) {
  return { ok: true, data, receipt: { action, changed: !action.startsWith('get') && !action.startsWith('list'), verification, at: new Date().toISOString() } };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function reportUrl(value, { optional = false } = {}) {
  if (optional && !String(value || '').trim()) return null;
  const parsed = new URL(String(value || ''));
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'cosmise.com' || parsed.hostname.endsWith('.cosmise.com'))) throw new Error('Report URL must use HTTPS on cosmise.com.');
  return parsed.toString();
}

function requireBackendAuth(req, res, next) {
  if (!production.configured()) return res.status(503).json({ ok: false, error: 'Cosmise integration is not configured for this app backend.' });
  if (!production.authorizes(req.headers)) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="Cosmise Streamboards backend"');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

function contextFields(payload) {
  const org = payload?.organisation || payload?.organization || payload?.org || payload?.scope?.org || null;
  const endpoint = payload?.endpoint || payload?.scope?.endpoint || null;
  return { org, endpoint };
}

function reportFromBoard(board, resolved, organisation) {
  const urls = resolved?.urls || {};
  const publication = resolved?.publication || {};
  const id = String(board?.id || urls?.streamboard_id || '').trim();
  if (!id) return null;
  return {
    id,
    streamboard_id: id,
    title: urls?.streamboard_name || board?.name || 'Streamboard',
    description: board?.description || null,
    public_url: publication.is_public === true && publication.protected !== true ? urls?.public_url || null : null,
    edit_url: urls?.editable_url || `https://cosmise.com/dashboard/streamboards/${encodeURIComponent(id)}`,
    organisation: organisation?.name || organisation?.display_name || null,
    status: publication.is_public === true && publication.protected !== true && urls?.public_url ? 'ready' : 'private',
    updated_at: board?.updated_at || board?.created_at || new Date().toISOString()
  };
}

let syncInFlight = null;
async function syncReports() {
  if (syncInFlight) return syncInFlight;
  syncInFlight = (async () => {
    if (!production.configured()) {
      store.updateConnection({ configured: false, state: 'missing_key', mode: null, message: 'Cosmise MCP token is not configured for this app backend.' });
      return { configured: false, synchronized: 0 };
    }
    store.updateConnection({ configured: true, state: 'checking', message: 'Checking the backend Cosmise connection.' });
    try {
      await production.ping();
      const contextResult = await production.callTool('streamboards_get_org_context', { include_streamboards: false, include_connections: true, limit: 1 });
      if (contextResult?.isError) throw new Error('Cosmise organization context could not be loaded.');
      const context = parseToolPayload(contextResult) || {};
      const { org, endpoint } = contextFields(context);
      const listResult = await production.callTool('streamboards_list', { limit: 100 });
      if (listResult?.isError) throw new Error('Cosmise Streamboards could not be listed.');
      const list = parseToolPayload(listResult) || {};
      const boards = Array.isArray(list.streamboards) ? list.streamboards.slice(0, 100) : [];
      const urlRows = new Map();
      for (const board of boards.slice(0, 10)) {
        if (!board?.id) continue;
        try {
          const [urlResult, publicationResult] = await Promise.all([
            production.callTool('streamboards_get_urls', { streamboard_id: board.id }),
            production.callTool('streamboards_get_publication', { streamboard_id: board.id })
          ]);
          if (!urlResult?.isError && !publicationResult?.isError) urlRows.set(String(board.id), { urls: parseToolPayload(urlResult) || {}, publication: parseToolPayload(publicationResult) || {} });
        } catch {
          // The report remains listed without an embeddable URL.
        }
      }
      const reports = boards.map((board) => reportFromBoard(board, urlRows.get(String(board.id)), org)).filter(Boolean);
      store.syncReports(reports);
      store.updateConnection({ configured: true, state: 'ready', mode: 'read_write', organisation: org, endpoint, message: `Connected to Cosmise. ${reports.length} Streamboards synchronized.` });
      store.addEvent({ source: 'cosmise_backend', status: 'success', operation: 'reports.synchronized', title: 'Cosmise reports synchronized', detail: `${reports.length} Streamboards are available.` });
      return { configured: true, synchronized: reports.length };
    } catch (error) {
      store.updateConnection({ configured: true, state: 'error', message: error.message || 'Cosmise synchronization failed.' });
      store.addEvent({ source: 'cosmise_backend', status: 'failed', operation: 'reports.synchronized', title: 'Cosmise synchronization needs attention', detail: error.message || 'Cosmise synchronization failed.' });
      throw error;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}

const mcp = createMcp({ store, production, syncReports });

app.get('/_sym/health', (req, res) => res.json({ ok: true, service: 'cosmise-streamboards', version: '0.2.0', credential_boundary: 'backend_only', backend_configured: production.configured(), profile_id: store.state.profile_id }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'cosmise-streamboards', credential_boundary: 'backend_only', backend_configured: production.configured(), production_tool_count: catalog.tool_count, local_tool_count: LOCAL_TOOLS.length }));
app.get('/api/state', (req, res) => res.json(receipt('get_state', store.snapshot())));
app.get('/api/status', (req, res) => res.json(receipt('get_status', store.snapshot().connection)));
app.get('/api/tasks', (req, res) => res.json(receipt('list_tasks', store.snapshot().tasks)));
app.get('/api/activity', (req, res) => res.json(receipt('list_activity', store.snapshot().events.slice(0, 10))));
app.get('/api/reports', (req, res) => res.json(receipt('list_reports', store.snapshot().reports)));

app.patch('/api/status', requireBackendAuth, (req, res) => res.json(receipt('update_status', store.updateConnection(req.body).connection)));
app.post('/api/tasks', requireBackendAuth, (req, res) => res.status(201).json(receipt('create_task', store.createTask(req.body))));
app.patch('/api/tasks/:id', requireBackendAuth, (req, res) => {
  const task = store.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
  store.addEvent({ task_id: task.id, status: task.status === 'failed' ? 'failed' : task.status === 'success' ? 'success' : 'running', operation: 'task.updated', title: task.title, detail: task.detail });
  return res.json(receipt('update_task', task));
});
app.post('/api/activity', requireBackendAuth, (req, res) => res.status(201).json(receipt('create_activity', store.addEvent(req.body))));
app.delete('/api/activity', requireBackendAuth, (req, res) => {
  if (req.query.confirm !== 'true') return res.status(400).json({ ok: false, error: 'confirm=true is required' });
  return res.json(receipt('clear_activity', store.clearActivity()));
});
app.post('/api/reports', requireBackendAuth, (req, res) => {
  const input = { ...req.body, public_url: reportUrl(req.body.public_url || req.body.url, { optional: true }), edit_url: reportUrl(req.body.edit_url, { optional: true }) };
  return res.status(201).json(receipt('show_report', store.addReport(input), input.verification || null));
});
app.delete('/api/reports/:id', requireBackendAuth, (req, res) => {
  if (!store.removeReport(req.params.id)) return res.status(404).json({ ok: false, error: 'Report not found' });
  return res.json(receipt('remove_report', { id: req.params.id, removed: true }));
});

app.get('/api/agent/bootstrap', (req, res) => res.json(receipt('get_agent_bootstrap', AGENT_BOOTSTRAP)));
app.get('/api/agent/instructions', (req, res) => res.json(receipt('get_agent_instructions', { instructions: AGENT_INSTRUCTIONS, bootstrap: '/api/agent/bootstrap', endpoint: '/mcp' })));
app.post('/api/agent/calls', requireBackendAuth, asyncRoute(async (req, res) => {
  const called = await mcp.callTool('cosmise_app_observe_call', req.body);
  return res.status(201).json(receipt('observe_agent_call', called.result));
}));
app.get('/api/docs/tools', asyncRoute(async (req, res) => res.json({ ok: true, ...catalog, wrapped_tools: await mcp.tools(), local_tools: LOCAL_TOOLS })));
app.get('/api/templates', (req, res) => res.json(receipt('list_layout_templates', listLayoutTemplates(req.query))));
app.get('/api/templates/:id', (req, res) => {
  const template = getLayoutTemplate(req.params.id);
  if (!template) return res.status(404).json({ ok: false, error: 'Template not found' });
  return res.json(receipt('get_layout_template', { source_policy: layoutLibrary.source_policy, grid: layoutLibrary.grid, agent_rules: layoutLibrary.agent_rules, template }));
});

app.post('/api/cosmise/sync', requireBackendAuth, asyncRoute(async (req, res) => res.json(receipt('sync_reports', await syncReports()))));
app.get('/api/cosmise/tools', requireBackendAuth, asyncRoute(async (req, res) => res.json(receipt('list_wrapped_tools', (await mcp.tools()).filter((tool) => tool.name.startsWith('streamboards_'))))));
app.post('/api/cosmise/tools/:tool', requireBackendAuth, asyncRoute(async (req, res) => {
  const name = String(req.params.tool || '');
  if (!name.startsWith('streamboards_')) return res.status(404).json({ ok: false, error: 'Wrapped Streamboards tool not found.' });
  const called = await mcp.callTool(name, req.body || {});
  return res.json(receipt(name, called.result));
}));

app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', state: store.snapshot() })}\n\n`);
  const unsubscribe = store.subscribe((message) => res.write(`event: state\ndata: ${JSON.stringify(message)}\n\n`));
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
  req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
});

app.post('/mcp', requireBackendAuth, asyncRoute(async (req, res) => {
  const response = await mcp.handle(req.body);
  if (response === null) return res.status(202).end();
  return res.json(response);
}));

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, req, res, next) => {
  console.error(`[cosmise-streamboards] ${req.method} ${req.path}:`, error.message);
  res.status(400).json({ ok: false, error: error.message || 'Request failed' });
});

function localAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) for (const item of interfaces || []) if (item.family === 'IPv4' && !item.internal) addresses.push(`http://${item.address}:${PORT}`);
  return addresses;
}

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Cosmise Streamboards listening on http://127.0.0.1:${PORT}`);
    for (const address of localAddresses()) console.log(`LAN: ${address}`);
    console.log(`Private wrapped MCP: http://127.0.0.1:${PORT}/mcp`);
    syncReports().catch(() => {});
    setInterval(() => syncReports().catch(() => {}), REPORT_SYNC_MS).unref();
  });
}

module.exports = { app, store, mcp, production, receipt, reportUrl, requireBackendAuth, syncReports, runtimeHost: HOST, runtimePort: PORT };
