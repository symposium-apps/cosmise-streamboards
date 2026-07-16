'use strict';

const crypto = require('node:crypto');
const catalog = require('../data/tool-catalog.json');
const { listLayoutTemplates } = require('./layout-library');
const { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS } = require('./agent-bootstrap');
const { parseToolPayload } = require('./cosmise-client');

const OBSERVABLE_TOOL_PREFIXES = ['streamboards_', 'ga4_', 'google_ads_', 'meta_ads_', 'shopify_', 'search_console_', 'pinterest_ads_', 'tiktok_ads_', 'campaigns_'];
const OBSERVATION_PHASES = ['reading', 'learning', 'building', 'refreshing', 'verifying', 'publishing'];

const LOCAL_TOOLS = [
  { name: 'cosmise_app_get_bootstrap', description: 'Read the complete backend-managed Cosmise Streamboards workflow, layouts, metrics, realtime state and verification contract.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cosmise_app_get_state', description: 'Read bounded local tasks, activity, connection status and visible reports.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cosmise_app_sync_reports', description: 'Synchronize safe report metadata from the credential-scoped Cosmise organization into local state.', inputSchema: { type: 'object', properties: {} } },
  { name: 'cosmise_app_update_connection', description: 'Update the backend Cosmise connection status without exposing credentials.', inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['missing_key', 'checking', 'ready', 'working', 'error'] }, mode: { type: ['string', 'null'], enum: ['read', 'read_write', null] }, organisation: { type: ['object', 'null'] }, endpoint: { type: ['object', 'null'] }, message: { type: 'string' } }, required: ['state'] } },
  { name: 'cosmise_app_start_task', description: 'Start a visible Streamboards task.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, progress: { type: 'object' }, resource: { type: 'object' } }, required: ['title'] } },
  { name: 'cosmise_app_update_task', description: 'Update visible task progress or status.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, status: { type: 'string', enum: ['queued', 'running', 'waiting', 'success', 'failed', 'cancelled'] }, progress: { type: 'object' }, resource: { type: 'object' } }, required: ['task_id'] } },
  { name: 'cosmise_app_complete_task', description: 'Complete a visible task with optional verification.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, detail: { type: 'string' }, verification: { type: 'object' } }, required: ['task_id'] } },
  { name: 'cosmise_app_fail_task', description: 'Fail a visible task with a safe explanation.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, detail: { type: 'string' } }, required: ['task_id', 'detail'] } },
  { name: 'cosmise_app_show_message', description: 'Show a safe progress, warning or result message.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, status: { type: 'string', enum: ['info', 'queued', 'running', 'success', 'warning', 'failed'] }, title: { type: 'string' }, detail: { type: 'string' }, operation: { type: 'string' } }, required: ['title'] } },
  { name: 'cosmise_app_log_call', description: 'Record sanitized Streamboards activity. Wrapped production calls already do this automatically.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, tool_name: { type: 'string', pattern: '^streamboards_' }, status: { type: 'string', enum: ['running', 'success', 'failed'] }, detail: { type: 'string' }, duration_ms: { type: 'number' }, streamboard_id: { type: 'string' } }, required: ['tool_name', 'status'] } },
  { name: 'cosmise_app_observe_call', description: 'Add an optional sanitized human-readable observation. Wrapped production calls already emit automatic running/success/failure telemetry.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, call_id: { type: 'string' }, tool_name: { type: 'string' }, phase: { type: 'string', enum: OBSERVATION_PHASES }, status: { type: 'string', enum: ['running', 'success', 'failed'] }, message: { type: 'string' }, learned: { type: 'array', items: { type: 'string' } }, duration_ms: { type: 'number' }, streamboard_id: { type: 'string' } }, required: ['task_id', 'call_id', 'tool_name', 'phase', 'status', 'message'] } },
  { name: 'cosmise_app_show_verification', description: 'Show machine-readable verification checks and their safe outcome.', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, verification: { type: 'object' } }, required: ['title', 'verification'] } },
  { name: 'cosmise_app_show_report', description: 'Add or update a Streamboard. public_url is the only embeddable URL; edit_url opens externally.', inputSchema: { type: 'object', properties: { streamboard_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, organisation: { type: 'string' }, status: { type: 'string' }, public_url: { type: 'string' }, edit_url: { type: 'string' }, verification: { type: 'object' } }, required: ['streamboard_id', 'title'] } },
  { name: 'cosmise_app_list_layout_templates', description: 'List sanitized layout patterns with safe display configuration and exact 48-column geometry.', inputSchema: { type: 'object', properties: { widget_types: { type: 'array', items: { type: 'string' } }, min_widgets: { type: 'integer' }, max_widgets: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 100 } } } },
  { name: 'cosmise_app_clear_activity', description: 'Clear local tasks and activity. Requires confirm=true.', inputSchema: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] }, annotations: { destructiveHint: true } }
];

function textResult(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], ...(isError ? { isError: true } : {}) };
}

function observableToolName(value) {
  const name = String(value || '').trim();
  if (!OBSERVABLE_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) throw new Error('tool_name is not an approved Cosmise MCP tool');
  return name;
}

function assertSafeObservation(args) {
  const serialized = JSON.stringify({ message: args.message, learned: args.learned });
  if (/csk_[A-Za-z0-9_-]{10,}|Bearer\s+\S+|COSMISE_MCP_(?:KEY|TOKEN)\s*=/i.test(serialized)) throw new Error('Telemetry must not contain credentials or authorization values');
}

function productionFallbackTools() {
  return catalog.tools.map((tool) => ({
    name: tool.name,
    description: `${tool.description} Calls are wrapped by the local backend with automatic realtime status.`,
    inputSchema: tool.inputSchema || { type: 'object', additionalProperties: true },
    ...(tool.destructive ? { annotations: { destructiveHint: true } } : {})
  }));
}

function phaseForTool(name) {
  if (/publish|unpublish|slug|password|embed_token/.test(name)) return 'publishing';
  if (/refresh|cache/.test(name)) return 'refreshing';
  if (/validate|audit|diagnose|verify|publication|get_urls/.test(name)) return 'verifying';
  if (/create|add|update|set|remove|delete|restore|archive|duplicate|layout|move|resize|place|rollback/.test(name)) return 'building';
  return 'reading';
}

function readableTool(name, status) {
  const action = String(name || '').replace(/^streamboards_/, '').replaceAll('_', ' ');
  if (status === 'running') return `Cosmise is ${action}.`;
  if (status === 'failed') return `Cosmise could not complete ${action}.`;
  return `Cosmise completed ${action}.`;
}

function reportFromPayload(payload, previous = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const board = payload.streamboard && typeof payload.streamboard === 'object' ? payload.streamboard : {};
  const id = payload.streamboard_id || payload.id || board.id;
  if (!id) return null;
  const explicitlyPrivate = payload.is_public === false || payload.protected === true;
  const publicUrl = explicitlyPrivate ? null : payload.public_url || payload.url_rules?.public_url || previous.public_url || null;
  const editUrl = payload.editable_url || payload.edit_url || previous.edit_url || `https://cosmise.com/dashboard/streamboards/${encodeURIComponent(String(id))}`;
  return {
    id: String(id),
    streamboard_id: String(id),
    title: payload.streamboard_name || payload.title || payload.name || board.name || previous.title || 'Streamboard',
    description: payload.description || board.description || previous.description || null,
    public_url: publicUrl,
    edit_url: editUrl,
    status: publicUrl ? 'ready' : 'private',
    updated_at: new Date().toISOString()
  };
}

function createMcp({ store, production, syncReports }) {
  async function tools() {
    let productionTools = productionFallbackTools();
    if (production?.configured()) {
      try {
        productionTools = await production.tools();
      } catch {
        // Keep the versioned catalog available; tools/call will still report connection failure.
      }
    }
    return [...productionTools, ...LOCAL_TOOLS];
  }

  function localCall(name, args) {
    if (name === 'cosmise_app_get_bootstrap') return AGENT_BOOTSTRAP;
    if (name === 'cosmise_app_get_state') return store.snapshot();
    if (name === 'cosmise_app_sync_reports') return syncReports();
    if (name === 'cosmise_app_update_connection') return { connection: store.updateConnection({ ...args, configured: ['checking', 'ready', 'working', 'error'].includes(args.state) }).connection };
    if (name === 'cosmise_app_start_task') return { task: store.createTask(args) };
    if (name === 'cosmise_app_update_task') {
      const task = store.updateTask(String(args.task_id || ''), args);
      if (!task) throw new Error('Task not found');
      store.addEvent({ task_id: task.id, status: task.status === 'failed' ? 'failed' : task.status === 'success' ? 'success' : 'running', operation: 'task.updated', title: task.title, detail: task.detail });
      return { task };
    }
    if (name === 'cosmise_app_complete_task' || name === 'cosmise_app_fail_task') {
      const failed = name.endsWith('fail_task');
      const task = store.updateTask(String(args.task_id || ''), { status: failed ? 'failed' : 'success', detail: args.detail });
      if (!task) throw new Error('Task not found');
      store.addEvent({ task_id: task.id, status: failed ? 'failed' : 'success', operation: failed ? 'task.failed' : 'task.completed', title: task.title, detail: args.detail, verification: args.verification });
      return { task, verification: args.verification || null };
    }
    if (name === 'cosmise_app_show_message') return { event: store.addEvent(args) };
    if (name === 'cosmise_app_log_call') return { event: store.addEvent({ task_id: args.task_id, source: 'remote_mcp', status: args.status, operation: observableToolName(args.tool_name), title: args.tool_name, detail: args.detail, duration_ms: args.duration_ms, resource: args.streamboard_id ? { type: 'streamboard', id: String(args.streamboard_id) } : null }) };
    if (name === 'cosmise_app_observe_call') {
      const toolName = observableToolName(args.tool_name);
      const taskId = String(args.task_id || '').trim();
      if (!store.snapshot().tasks.some((task) => task.id === taskId)) throw new Error('Task not found');
      if (!OBSERVATION_PHASES.includes(args.phase) || !['running', 'success', 'failed'].includes(args.status)) throw new Error('Invalid observation state');
      assertSafeObservation(args);
      return { event: store.upsertCallEvent({ call_id: args.call_id, task_id: taskId, source: 'remote_mcp', status: args.status, phase: args.phase, operation: toolName, title: args.message, detail: args.message, learned: args.learned, duration_ms: args.duration_ms, resource: args.streamboard_id ? { type: 'streamboard', id: String(args.streamboard_id) } : null }) };
    }
    if (name === 'cosmise_app_show_verification') return { event: store.addEvent({ ...args, status: args.verification?.ok === false ? 'warning' : 'success', operation: 'verification.completed' }) };
    if (name === 'cosmise_app_show_report') return { report: store.addReport(args) };
    if (name === 'cosmise_app_list_layout_templates') return listLayoutTemplates(args);
    if (name === 'cosmise_app_clear_activity') {
      if (args.confirm !== true) throw new Error('confirm=true is required');
      return { cleared: true, state: store.clearActivity() };
    }
    return null;
  }

  async function callProductionTool(name, args = {}) {
    const started = Date.now();
    const callId = crypto.randomUUID();
    let task = store.activeTask();
    const automaticTask = !task;
    if (!task) task = store.createTask({ id: `mcp-${callId}`, title: `Cosmise: ${name.replace(/^streamboards_/, '').replaceAll('_', ' ')}`, detail: readableTool(name, 'running'), status: 'running' });
    store.upsertCallEvent({ call_id: callId, task_id: task.id, source: 'remote_mcp', status: 'running', phase: phaseForTool(name), operation: name, title: readableTool(name, 'running'), detail: readableTool(name, 'running') });
    try {
      const result = await production.callTool(name, args);
      const failed = result?.isError === true;
      const payload = parseToolPayload(result);
      const report = reportFromPayload(payload);
      if (report) store.syncReports([report]);
      if (Array.isArray(payload?.streamboards)) store.syncReports(payload.streamboards.map((board) => reportFromPayload({ streamboard: board, streamboard_id: board.id })).filter(Boolean));
      store.upsertCallEvent({ call_id: callId, task_id: task.id, source: 'remote_mcp', status: failed ? 'failed' : 'success', phase: phaseForTool(name), operation: name, title: readableTool(name, failed ? 'failed' : 'success'), detail: readableTool(name, failed ? 'failed' : 'success'), duration_ms: Date.now() - started, resource: report ? { type: 'streamboard', id: report.streamboard_id } : null });
      if (automaticTask) store.updateTask(task.id, { status: failed ? 'failed' : 'success', detail: readableTool(name, failed ? 'failed' : 'success') });
      return result;
    } catch (error) {
      store.upsertCallEvent({ call_id: callId, task_id: task.id, source: 'remote_mcp', status: 'failed', phase: phaseForTool(name), operation: name, title: readableTool(name, 'failed'), detail: readableTool(name, 'failed'), duration_ms: Date.now() - started });
      if (automaticTask) store.updateTask(task.id, { status: 'failed', detail: readableTool(name, 'failed') });
      throw error;
    }
  }

  async function callTool(name, args = {}) {
    const local = localCall(name, args);
    if (local !== null) return { kind: 'local', result: await local };
    if (!String(name).startsWith('streamboards_')) throw new Error('Unknown wrapped Streamboards tool.');
    return { kind: 'production', result: await callProductionTool(name, args) };
  }

  async function handle(message) {
    const id = message?.id ?? null;
    try {
      if (message?.method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cosmise-streamboards-wrapper', version: '0.2.0' }, instructions: AGENT_INSTRUCTIONS } };
      if (message?.method === 'ping') return { jsonrpc: '2.0', id, result: { authenticated: production.configured() } };
      if (message?.method === 'notifications/initialized') return null;
      if (message?.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: await tools() } };
      if (message?.method === 'tools/call') {
        const name = String(message?.params?.name || '');
        if (!name) throw new Error('Tool name is required');
        const called = await callTool(name, message?.params?.arguments || {});
        return { jsonrpc: '2.0', id, result: called.kind === 'production' ? called.result : textResult(called.result) };
      }
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
    } catch (error) {
      return { jsonrpc: '2.0', id, result: textResult({ ok: false, error: error.message }, true) };
    }
  }

  return { handle, tools, callTool, callProductionTool };
}

module.exports = { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, createMcp, LOCAL_TOOLS };
