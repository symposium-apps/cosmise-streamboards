'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmise-streamboards-test-'));
const stateFile = path.join(temporary, 'state.json');
global.__COSMISE_TEST_DATA_FILE__ = stateFile;
process.env.PORT = '54321';
process.env.SYM_PROFILE_ID = 'profile-test';

const { app, store, runtimePort } = require('../server');
const { AppStore } = require('../lib/store');
let server;
let base;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(temporary, { recursive: true, force: true });
  delete global.__COSMISE_TEST_DATA_FILE__;
  delete process.env.PORT;
  delete process.env.SYM_PROFILE_ID;
});

test('runtime obeys the port allocated by SYM-node', () => {
  assert.equal(runtimePort, 54321);
  assert.equal(store.snapshot().profile_id, 'profile-test');
});

test('runtime profile identity overrides stale persisted local identity', () => {
  const file = path.join(temporary, 'stale-profile.json');
  fs.writeFileSync(file, JSON.stringify({ schema_version: 2, profile_id: 'local', tasks: [], events: [], reports: [] }));
  const scopedStore = new AppStore({ file, profileId: 'profile-current' });
  assert.equal(scopedStore.snapshot().profile_id, 'profile-current');
});

async function json(url, options = {}) {
  const response = await fetch(base + url, { headers: { 'content-type': 'application/json' }, ...options });
  return { status: response.status, body: await response.json() };
}

test('health and docs expose the backend-only credential boundary', async () => {
  const health = await json('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.credential_boundary, 'backend_only');
  assert.equal(health.body.production_tool_count, 78);
  assert.equal(health.body.local_tool_count, 16);

  const docs = await json('/api/docs/tools');
  assert.equal(docs.body.tool_count, 78);
  assert.equal(docs.body.tools.length, 78);
  assert.equal(docs.body.local_tools.length, 16);
});

test('MCP initialization teaches the complete production and local workflow', async () => {
  const response = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) });
  assert.equal(response.status, 200);
  assert.match(response.body.result.instructions, /cosmise_app_observe_call/);
  assert.match(response.body.result.instructions, /cosmise_app_get_bootstrap/);
  assert.match(response.body.result.instructions, /COSMISE_MCP_TOKEN/);
  assert.match(response.body.result.instructions, /streamboards_list_query_catalog/);
  assert.match(response.body.result.instructions, /cosmise_app_list_layout_templates/);
  assert.match(response.body.result.instructions, /formula tokens/i);
  assert.match(response.body.result.instructions, /automatically records/i);
  assert.match(response.body.result.instructions, /never send credentials/i);
  assert.match(response.body.result.instructions, /layout/i);
  assert.match(response.body.result.instructions, /query_catalog/i);
});

test('bootstrap is the complete coding-agent entry point', async () => {
  const response = await json('/api/agent/bootstrap');
  assert.equal(response.status, 200);
  const bootstrap = response.body.data;
  assert.equal(bootstrap.api_boundaries.production.url, undefined);
  assert.equal(bootstrap.api_boundaries.production.agent_access, 'wrapper_only');
  assert.equal(bootstrap.credential_setup.hermes_mcp_config_example, undefined);
  assert.equal(bootstrap.api_boundaries.local.mcp_path, '/mcp');
  assert.match(bootstrap.credential_setup.credential_owner, /SYM-Node profile integration store/);
  assert.equal(bootstrap.credential_setup.binding_helper, undefined);
  assert.equal(bootstrap.credential_setup.environment_variable, 'COSMISE_MCP_TOKEN');
  assert(bootstrap.credential_setup.missing_access_steps.some((step) => /Open Connections/i.test(step)));
  assert(bootstrap.required_workflow.some((step) => step.includes('cosmise_app_start_task')));
  assert.equal(bootstrap.layouts.grid_columns, 48);
  assert.match(bootstrap.metrics.source_of_truth, /streamboards_list_query_catalog/);
  assert(!JSON.stringify(bootstrap).includes('csk_'));
});

test('MCP lists local communication tools and every Streamboards wrapper', async () => {
  const response = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.result.tools.length, 94);
  const names = new Set(response.body.result.tools.map((tool) => tool.name));
  assert(names.has('cosmise_app_get_bootstrap'));
  assert(names.has('cosmise_app_update_connection'));
  assert(names.has('cosmise_app_log_call'));
  assert(names.has('cosmise_app_observe_call'));
  assert(names.has('cosmise_app_show_report'));
  assert(names.has('cosmise_app_list_layout_templates'));
  assert(names.has('cosmise_app_sync_now'));
  assert(names.has('streamboards_validate'));
});

test('local MCP updates tasks, activity, verification, and reports', async () => {
  const start = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'cosmise_app_start_task', arguments: { id: 'test-task', title: 'Build test report', progress: { current: 1, total: 3 }, resource: { type: 'streamboard', id: 'board-test', title: 'Test report' } } } }) });
  assert.equal(start.body.result.isError, undefined);

  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'cosmise_app_show_verification', arguments: { task_id: 'test-task', title: 'Structure verified', verification: { ok: true, layout_ok: true } } } }) });
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'cosmise_app_show_report', arguments: { streamboard_id: 'board-test', title: 'Test report', url: 'https://cosmise.com/board/test/report', verification: { ok: true } } } }) });
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'cosmise_app_complete_task', arguments: { task_id: 'test-task', detail: 'Verified and ready.', verification: { ok: true } } } }) });

  const state = (await json('/api/state')).body.data;
  assert.equal(state.tasks[0].status, 'success');
  assert.deepEqual(state.tasks[0].resource, { type: 'streamboard', id: 'board-test', title: 'Test report' });
  assert.equal(state.reports[0].streamboard_id, 'board-test');
  assert(state.events.some((event) => event.operation === 'verification.completed'));
  assert(fs.existsSync(stateFile));
});

test('local MCP records production readiness and sanitized call receipts', async () => {
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'cosmise_app_update_connection', arguments: { state: 'ready', mode: 'read_write', organisation: { name: 'Example organisation' }, message: 'Production MCP verified.' } } }) });
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 21, method: 'tools/call', params: { name: 'cosmise_app_log_call', arguments: { task_id: 'test-task', tool_name: 'streamboards_validate', status: 'success', detail: 'Structure verified.', duration_ms: 142, streamboard_id: 'board-test' } } }) });

  const state = (await json('/api/state')).body.data;
  assert.equal(state.connection.state, 'ready');
  assert.equal(state.connection.configured, true);
  assert.equal(state.connection.mode, 'read_write');
  const call = state.events.find((event) => event.operation === 'streamboards_validate');
  assert.equal(call.source, 'remote_mcp');
  assert.equal(call.duration_ms, 142);
  assert.equal(call.resource.id, 'board-test');
  assert(!JSON.stringify(state).includes('COSMISE_MCP_KEY'));
});

test('paired API observations update one live learning event', async () => {
  const instructions = await json('/api/agent/instructions');
  assert.equal(instructions.status, 200);
  assert.equal(instructions.body.data.endpoint, '/api/agent/calls');
  assert.match(instructions.body.data.instructions, /same call_id/);

  const running = { task_id: 'test-task', call_id: 'ga4-catalog-1', tool_name: 'ga4_list_custom_metrics', phase: 'reading', status: 'running', message: 'Reading the available GA4 custom metrics.' };
  const learned = { ...running, phase: 'learning', status: 'success', message: 'Found the available GA4 custom metrics.', learned: ['Sessions and revenue are available', 'Three custom metrics are configured'], duration_ms: 84 };
  for (const args of [running, learned]) {
    const response = await json('/api/agent/calls', { method: 'POST', body: JSON.stringify(args) });
    assert.equal(response.status, 201);
  }

  const state = (await json('/api/state')).body.data;
  const observations = state.events.filter((event) => event.call_id === 'ga4-catalog-1');
  assert.equal(observations.length, 1);
  assert.equal(observations[0].source, 'remote_mcp');
  assert.equal(observations[0].status, 'success');
  assert.equal(observations[0].phase, 'learning');
  assert.equal(observations[0].operation, 'ga4_list_custom_metrics');
  assert.deepEqual(observations[0].learned, learned.learned);
  assert.equal(observations[0].duration_ms, 84);
});

test('agent instructions and paired observations are also available over local HTTP', async () => {
  const instructions = await json('/api/agent/instructions');
  assert.equal(instructions.status, 200);
  assert.equal(instructions.body.data.endpoint, '/api/agent/calls');
  assert.match(instructions.body.data.instructions, /cosmise_app_observe_call/);

  const observed = await json('/api/agent/calls', { method: 'POST', body: JSON.stringify({
    task_id: 'test-task',
    call_id: 'google-ads-http-1',
    tool_name: 'google_ads_list_campaigns',
    phase: 'reading',
    status: 'running',
    message: 'Reading available Google Ads campaigns.'
  }) });
  assert.equal(observed.status, 201);
  assert.equal(observed.body.data.event.call_id, 'google-ads-http-1');
  assert.equal(observed.body.data.event.source, 'remote_mcp');
});

test('agent observations reject unrelated tools and credential material', async () => {
  const baseArgs = { task_id: 'test-task', call_id: 'unsafe-1', phase: 'reading', status: 'running', message: 'Reading safe metadata.' };
  const unrelated = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 32, method: 'tools/call', params: { name: 'cosmise_app_observe_call', arguments: { ...baseArgs, tool_name: 'terminal_execute' } } }) });
  assert.equal(unrelated.body.result.isError, true);
  assert.match(JSON.parse(unrelated.body.result.content[0].text).error, /approved Cosmise MCP tool/);

  const secret = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 33, method: 'tools/call', params: { name: 'cosmise_app_observe_call', arguments: { ...baseArgs, call_id: 'unsafe-2', tool_name: 'streamboards_get_context', message: 'Bearer not-a-real-secret-value' } } }) });
  assert.equal(secret.body.result.isError, true);
  const parsed = JSON.parse(secret.body.result.content[0].text);
  assert.match(parsed.error, /must not contain credentials/);
  assert(!JSON.stringify((await json('/api/state')).body.data).includes('not-a-real-secret-value'));
});

test('state subscribers receive realtime updates', async () => {
  const message = new Promise((resolve) => {
    const unsubscribe = store.subscribe((event) => {
      if (event.type === 'event') {
        unsubscribe();
        resolve(event);
      }
    });
  });
  store.addEvent({ title: 'Realtime update', status: 'running' });
  const event = await message;
  assert.equal(event.type, 'event');
  assert(event.state.events.some((item) => item.title === 'Realtime update'));
});

test('SSE endpoint streams initial state and subsequent API mutations', async () => {
  const controller = new AbortController();
  const response = await fetch(base + '/api/events/stream', { signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let stream = '';
  while (!stream.includes('\n\n')) stream += decoder.decode((await reader.read()).value, { stream: true });
  assert.match(stream, /event: state/);

  await json('/api/activity', { method: 'POST', body: JSON.stringify({ title: 'HTTP SSE update', status: 'success' }) });
  while (!stream.includes('HTTP SSE update')) stream += decoder.decode((await reader.read()).value, { stream: true });
  assert.match(stream, /HTTP SSE update/);
  controller.abort();
  await reader.cancel().catch(() => undefined);
});

test('report API rejects non-Cosmise URLs', async () => {
  const rejected = await json('/api/reports', { method: 'POST', body: JSON.stringify({ streamboard_id: 'bad', title: 'Bad', url: 'https://example.com/report' }) });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /cosmise\.com/);
});

test('report API removes only the local viewer entry', async () => {
  const removed = await json('/api/reports/board-test', { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.data.removed, true);
  const reports = (await json('/api/reports')).body.data;
  assert(!reports.some((report) => report.id === 'board-test'));
});

test('layout templates are available as sanitized structural examples', async () => {
  const listed = await json('/api/templates?widget_type=cover_page&limit=5');
  assert.equal(listed.status, 200);
  assert(listed.body.data.count > 0);
  assert(listed.body.data.count <= 5);
  assert.equal(listed.body.data.catalog_summary.source_reports_reviewed, 49);
  assert.equal(listed.body.data.catalog_summary.sanitized_widget_examples, 834);
  assert.equal(listed.body.data.catalog_summary.unique_layouts, 47);
  assert(listed.body.data.templates.every((template) => template.widgets.some((widget) => widget.widget_type === 'cover_page')));
  const serialized = JSON.stringify(listed.body.data);
  for (const forbidden of ['COSMISE_MCP_KEY', 'org_id', 'streamboard_id', 'campaign_ids', 'source_board_id', 'http://', 'https://']) assert(!serialized.includes(forbidden));

  const mcp = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'cosmise_app_list_layout_templates', arguments: { widget_types: ['cover_page'], limit: 2 } } }) });
  const parsed = JSON.parse(mcp.body.result.content[0].text);
  assert.equal(parsed.count, 2);
  assert(parsed.templates.every((template) => template.widgets.some((widget) => widget.widget_type === 'cover_page')));
});

test('production Streamboards calls are rejected at the app boundary', async () => {
  const response = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'streamboards_get_context', arguments: {} } }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.result.isError, true);
  const parsed = JSON.parse(response.body.result.content[0].text);
  assert.match(parsed.error, /app backend/);
  assert(!JSON.stringify(response.body).includes('COSMISE_MCP_KEY'));
});

test('the removed branded demo endpoint is not exposed', async () => {
  const response = await fetch(base + '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 404);
});

test('workspace uses the supplied Streamboards shell and omits docs UI', async () => {
  const response = await fetch(base + '/');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Streamboard reports/);
  assert.match(html, /id="tabbar"/);
  assert.doesNotMatch(html, /id="agent"/);
  assert.doesNotMatch(html, /id="agent-toast"/);
  assert.match(html, /id="repbar"/);
  assert.doesNotMatch(html, /id="mini-toggle"/);
  assert.doesNotMatch(html, /id="mini-layer"/);
  assert.match(html, /cosmise-mascot\.png/);
  assert(!html.includes('Architects of Skin'));
  assert(!html.includes('MCP & API docs'));

  const appResponse = await fetch(base + '/app.js');
  const app = await appResponse.text();
  assert.equal(appResponse.status, 200);
  assert.match(app, /Tell an agent to create a Cosmise Streamboard/);
  assert.match(app, /Building now/);
  assert.doesNotMatch(app, /mini-toggle/);
});

test('Mini-Sym exposes the supplied compact live-state surface', async () => {
  const response = await fetch(base + '/mini-sym');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Cosmise Streamboards · Mini-Sym/);
  assert.match(html, /id="mini-root"/);
  assert.match(html, /mini-sym\.js/);
});

test('browser clients reconcile local state when SSE is interrupted', async () => {
  const desktop = await (await fetch(base + '/app.js')).text();
  const mini = await (await fetch(base + '/mini-sym.js')).text();
  assert.match(desktop, /STATE_POLL_MS = 2000/);
  assert.match(desktop, /startStatePolling/);
  assert.match(mini, /source\.readyState === EventSource\.OPEN/);
  assert.match(mini, /fetch\('\/api\/state'/);
});
