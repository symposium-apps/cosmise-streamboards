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

const { app, store, runtimePort } = require('../server');
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
});

test('runtime obeys the port allocated by SYM-node', () => {
  assert.equal(runtimePort, 54321);
});

async function json(url, options = {}) {
  const response = await fetch(base + url, { headers: { 'content-type': 'application/json' }, ...options });
  return { status: response.status, body: await response.json() };
}

test('health and docs expose the agent-only credential boundary', async () => {
  const health = await json('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.credential_boundary, 'agent_only');
  assert.equal(health.body.production_tool_count, 78);
  assert.equal(health.body.local_tool_count, 12);

  const docs = await json('/api/docs/tools');
  assert.equal(docs.body.tool_count, 78);
  assert.equal(docs.body.tools.length, 78);
  assert.equal(docs.body.local_tools.length, 12);
});

test('MCP lists local communication tools only', async () => {
  const response = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.result.tools.length, 12);
  const names = new Set(response.body.result.tools.map((tool) => tool.name));
  assert(names.has('cosmise_app_update_connection'));
  assert(names.has('cosmise_app_log_call'));
  assert(names.has('cosmise_app_show_report'));
  assert(names.has('cosmise_app_list_layout_templates'));
  assert(!names.has('streamboards_validate'));
});

test('local MCP updates tasks, activity, verification, and reports', async () => {
  const start = await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'cosmise_app_start_task', arguments: { id: 'test-task', title: 'Build test report', progress: { current: 1, total: 3 } } } }) });
  assert.equal(start.body.result.isError, undefined);

  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'cosmise_app_show_verification', arguments: { task_id: 'test-task', title: 'Structure verified', verification: { ok: true, layout_ok: true } } } }) });
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'cosmise_app_show_report', arguments: { streamboard_id: 'board-test', title: 'Test report', url: 'https://cosmise.com/board/test/report', verification: { ok: true } } } }) });
  await json('/mcp', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'cosmise_app_complete_task', arguments: { task_id: 'test-task', detail: 'Verified and ready.', verification: { ok: true } } } }) });

  const state = (await json('/api/state')).body.data;
  assert.equal(state.tasks[0].status, 'success');
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
  assert.match(parsed.error, /agent profile/);
  assert(!JSON.stringify(response.body).includes('COSMISE_MCP_KEY'));
});

test('the removed branded demo endpoint is not exposed', async () => {
  const response = await fetch(base + '/api/demo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(response.status, 404);
});

test('dashboard is report-first, uses the supplied icon, and omits docs UI', async () => {
  const response = await fetch(base + '/');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Streamboard reports/);
  assert.match(html, /Latest MCP calls/);
  assert.match(html, /analytics-pill-pair\.svg/);
  assert(!html.includes('Architects of Skin'));
  assert(!html.includes('MCP & API docs'));
});
