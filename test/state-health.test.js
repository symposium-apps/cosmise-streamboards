'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppStore } = require('../lib/store');
const { CosmiseClient } = require('../lib/cosmise-client');
const { createMcp } = require('../lib/mcp');
const catalog = { tools: [{ name: 'streamboards_get_context', mode: 'read' }, { name: 'streamboards_list', mode: 'read' }] };
function fixture(t, token = 'synthetic-test-token') {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'state-health-test-'));
 t.after(() => { fs.chmodSync(root, 0o700); fs.rmSync(root, { recursive: true, force: true }); });
 const store = new AppStore({ file: path.join(root, 'state.json') });
 const client = new CosmiseClient({ token, store, catalog });
 let calls = 0;
 client.rpc = async () => { calls++; return { structuredContent: {} }; };
 return { root, store, client, calls: () => calls };
}
test('startup invalidates stale missing_key and ready; no production polling', t => {
 for (const token of ['synthetic-test-token', '']) {
  const { store, client, calls } = fixture(t, token);
  store.state.connection.state = token ? 'missing_key' : 'ready';
  store.createTask({ title: 'Interrupted work' });
  client.start();
  assert.equal(store.state.connection.configured, Boolean(token));
  assert.equal(store.state.connection.state, token ? 'checking' : 'missing_key');
  assert.equal(store.state.runtime.expected_env_var, 'COSMISE_MCP_TOKEN');
  assert.equal(store.state.tasks[0].status, 'failed');
  assert.equal(calls(), 0);
  assert.equal(store.state.runtime.state_health.writable, true);
  assert.equal(fs.readdirSync(path.dirname(store.file)).some(x => x.startsWith('.health-')), false);
 }
});
test('successful sync validates connection; failed sync clears ready and propagates', async t => {
 const { client, store } = fixture(t); client.start();
 await client.reconcile(); assert.equal(store.state.connection.state, 'ready');
 client.rpc = async () => { throw new Error('HTTP 401 synthetic-test-token'); };
 await assert.rejects(client.reconcile(), /401/);
 assert.equal(store.state.connection.state, 'error');
 assert(!JSON.stringify(store.snapshot()).includes('synthetic-test-token'));
});
test('unwritable state fails before upstream, including record:false, and clears running work', async t => {
 const { root, client, store, calls } = fixture(t); client.start();
 store.createTask({ title: 'Work' });
 // Structural failure is deterministic even when CI runs as root.
 store.file = path.join(root, 'state.json', 'impossible.json');
 for (const record of [true, false]) await assert.rejects(client.callTool('streamboards_get_context', {}, { record }), e => e.code === 'RUNTIME_STATE_UNWRITABLE');
 assert.equal(calls(), 0); assert.equal(store.state.tasks[0].status, 'failed');
 assert.equal(store.state.runtime.state_health.writable, false);
 const mcp = createMcp({ client, productionClient: client, store, catalog });
 const result = await mcp.handle({ id: 1, method: 'tools/call', params: { name: 'streamboards_get_context' } });
 assert.equal(result.result.isError, true);
 assert.equal(JSON.parse(result.result.content[0].text).code, 'RUNTIME_STATE_UNWRITABLE');
});
test('real mode denial as non-root, recovery and restart', async t => {
 if (process.getuid?.() === 0) return t.skip('run as an unprivileged user for POSIX denial');
 const { root, client, store, calls } = fixture(t); client.start();
 fs.chmodSync(root, 0o500);
 await assert.rejects(client.callTool('streamboards_get_context'), e => e.code === 'RUNTIME_STATE_UNWRITABLE');
 assert.equal(calls(), 0);
 fs.chmodSync(root, 0o700);
 client.start(); await client.reconcile();
 const restarted = new AppStore({ file: store.file });
 const next = new CosmiseClient({ token: 'synthetic-test-token', store: restarted, catalog }); next.start();
 assert.equal(restarted.state.connection.state, 'checking');
 assert.equal(restarted.checkHealth().writable, true);
});
test('persistence failure after upstream cannot leave a running task or success receipt', async t => {
 const { client, store, root } = fixture(t); client.start(); store.createTask({ title: 'Work' });
 client.rpc = async () => { store.file = path.join(root, 'state.json', 'blocked'); return { structuredContent: {} }; };
 await assert.rejects(client.callTool('streamboards_get_context'), e => e.code === 'RUNTIME_STATE_UNWRITABLE');
 assert.equal(store.state.tasks[0].status, 'failed');
 assert.equal(store.state.connection.state, 'error');
});
test('caller cannot claim missing_key when backend credential exists', t => {
 const { client, store } = fixture(t); client.start();
 store.updateConnection({ state: 'missing_key', configured: false });
 assert.equal(store.state.connection.state, 'checking'); assert.equal(store.state.connection.configured, true);
});
