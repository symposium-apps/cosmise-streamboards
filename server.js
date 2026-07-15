'use strict';

const express = require('express');
const os = require('node:os');
const path = require('node:path');
const { AppStore } = require('./lib/store');
const { createMcp, LOCAL_TOOLS } = require('./lib/mcp');
const catalog = require('./data/tool-catalog.json');
const { listLayoutTemplates, getLayoutTemplate, library: layoutLibrary } = require('./lib/layout-library');

const DATA_FILE = global.__COSMISE_TEST_DATA_FILE__ || path.join(__dirname, '.sym-data', 'state.json');
const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4322);

const store = new AppStore({ file: DATA_FILE, profileId: 'local' });
const mcp = createMcp({ store });
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
  return {
    ok: true,
    data,
    receipt: {
      action,
      changed: !action.startsWith('get') && !action.startsWith('list'),
      verification,
      at: new Date().toISOString()
    }
  };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function reportUrl(value) {
  const parsed = new URL(String(value || ''));
  if (parsed.protocol !== 'https:' || !(parsed.hostname === 'cosmise.com' || parsed.hostname.endsWith('.cosmise.com'))) {
    throw new Error('Report URL must use HTTPS on cosmise.com.');
  }
  return parsed.toString();
}


app.get('/_sym/health', (req, res) => res.json({ ok: true, service: 'cosmise-streamboards', version: '0.1.0', credential_boundary: 'agent_only', profile_id: store.state.profile_id }));
app.get('/api/health', (req, res) => res.json({ ok: true, service: 'cosmise-streamboards', credential_boundary: 'agent_only', production_tool_count: catalog.tool_count, local_tool_count: LOCAL_TOOLS.length }));
app.get('/api/state', (req, res) => res.json(receipt('get_state', store.snapshot())));
app.get('/api/status', (req, res) => res.json(receipt('get_status', store.snapshot().connection)));
app.patch('/api/status', (req, res) => res.json(receipt('update_status', store.updateConnection(req.body).connection)));

app.get('/api/tasks', (req, res) => res.json(receipt('list_tasks', store.snapshot().tasks)));
app.post('/api/tasks', (req, res) => res.status(201).json(receipt('create_task', store.createTask(req.body))));
app.patch('/api/tasks/:id', (req, res) => {
  const task = store.updateTask(req.params.id, req.body);
  if (!task) return res.status(404).json({ ok: false, error: 'Task not found' });
  store.addEvent({ task_id: task.id, status: task.status === 'failed' ? 'failed' : task.status === 'success' ? 'success' : 'running', operation: 'task.updated', title: task.title, detail: task.detail });
  return res.json(receipt('update_task', task));
});

app.get('/api/activity', (req, res) => res.json(receipt('list_activity', store.snapshot().events)));
app.post('/api/activity', (req, res) => res.status(201).json(receipt('create_activity', store.addEvent(req.body))));
app.delete('/api/activity', (req, res) => {
  if (req.query.confirm !== 'true') return res.status(400).json({ ok: false, error: 'confirm=true is required' });
  return res.json(receipt('clear_activity', store.clearActivity()));
});

app.get('/api/reports', (req, res) => res.json(receipt('list_reports', store.snapshot().reports)));
app.post('/api/reports', (req, res) => {
  const input = { ...req.body, url: reportUrl(req.body.url), public_url: req.body.public_url ? reportUrl(req.body.public_url) : undefined, edit_url: req.body.edit_url ? reportUrl(req.body.edit_url) : undefined };
  return res.status(201).json(receipt('show_report', store.addReport(input), input.verification || null));
});
app.delete('/api/reports/:id', (req, res) => {
  if (!store.removeReport(req.params.id)) return res.status(404).json({ ok: false, error: 'Report not found' });
  return res.json(receipt('remove_report', { id: req.params.id, removed: true }));
});

app.get('/api/docs/tools', (req, res) => res.json({ ok: true, ...catalog, local_tools: LOCAL_TOOLS }));
app.get('/api/templates', (req, res) => res.json(receipt('list_layout_templates', listLayoutTemplates(req.query))));
app.get('/api/templates/:id', (req, res) => {
  const template = getLayoutTemplate(req.params.id);
  if (!template) return res.status(404).json({ ok: false, error: 'Template not found' });
  return res.json(receipt('get_layout_template', { source_policy: layoutLibrary.source_policy, grid: layoutLibrary.grid, agent_rules: layoutLibrary.agent_rules, template }));
});
app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: state\ndata: ${JSON.stringify({ type: 'state', state: store.snapshot() })}\n\n`);
  const unsubscribe = store.subscribe((message) => res.write(`event: state\ndata: ${JSON.stringify(message)}\n\n`));
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

app.post('/mcp', asyncRoute(async (req, res) => {
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
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const item of interfaces || []) if (item.family === 'IPv4' && !item.internal) addresses.push(`http://${item.address}:${PORT}`);
  }
  return addresses;
}

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Cosmise Streamboards listening on http://127.0.0.1:${PORT}`);
    for (const address of localAddresses()) console.log(`LAN: ${address}`);
    console.log(`Local agent MCP: http://127.0.0.1:${PORT}/mcp (${LOCAL_TOOLS.length} communication tools)`);
  });
}

module.exports = { app, store, mcp, receipt, reportUrl, runtimeHost: HOST, runtimePort: PORT };
