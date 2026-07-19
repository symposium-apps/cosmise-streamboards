'use strict';

const { listLayoutTemplates } = require('./layout-library');
const { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS } = require('./agent-bootstrap');

const OBSERVABLE_TOOL_PREFIXES = ['streamboards_', 'ga4_', 'google_ads_', 'meta_ads_', 'shopify_', 'search_console_', 'pinterest_ads_', 'tiktok_ads_', 'campaigns_'];
const OBSERVATION_PHASES = ['reading', 'learning', 'building', 'refreshing', 'verifying', 'publishing'];

const LOCAL_TOOLS = [
  {
    name: 'cosmise_app_get_bootstrap',
    description: 'REQUIRED ENTRY POINT. Read the hard backend credential gate, exact Cosmise connection/restart recovery steps, wrapped tool workflow, bounded realtime state, layouts, metrics, and verification contract.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cosmise_app_get_state',
    description: 'Read app state. REQUIRED: runtime.backend_mcp_configured must be true before any production Streamboards work.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cosmise_app_sync_now',
    description: 'Refresh organisation context, Streamboards and canonical URLs through the backend-owned Cosmise MCP connection.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cosmise_app_update_connection',
    description: 'Report whether the agent has usable production Streamboards MCP access. Never send the credential itself.',
    inputSchema: { type: 'object', properties: { state: { type: 'string', enum: ['missing_key', 'checking', 'ready', 'working', 'error'] }, mode: { type: ['string', 'null'], enum: ['read', 'read_write', null] }, organisation: { type: ['object', 'null'] }, endpoint: { type: ['object', 'null'] }, message: { type: 'string' } }, required: ['state'] }
  },
  {
    name: 'cosmise_app_set_view',
    description: 'Set the authoritative Streamboards UI focus. Use this when planning or switching work so /api/state controls the selected sidebar item and open tabs.',
    inputSchema: { type: 'object', properties: { active_report_id: { type: ['string', 'null'] }, open_report_ids: { type: 'array', maxItems: 12, items: { type: 'string' } }, focused_task_id: { type: ['string', 'null'] }, status: { type: 'string' } } }
  },
  {
    name: 'cosmise_app_start_task',
    description: 'Start a visible agent task in the Cosmise Streamboards app.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, progress: { type: 'object' }, resource: { type: 'object', properties: { type: { type: 'string', enum: ['streamboard'] }, id: { type: 'string' }, title: { type: 'string' } }, required: ['type', 'id'] } }, required: ['title'] }
  },
  {
    name: 'cosmise_app_update_task',
    description: 'Update progress or status for a visible app task.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, status: { type: 'string', enum: ['queued', 'running', 'waiting', 'success', 'failed', 'cancelled'] }, progress: { type: 'object' }, resource: { type: 'object' } }, required: ['task_id'] }
  },
  {
    name: 'cosmise_app_complete_task',
    description: 'Mark a visible app task complete and optionally attach verification.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, detail: { type: 'string' }, verification: { type: 'object' } }, required: ['task_id'] }
  },
  {
    name: 'cosmise_app_fail_task',
    description: 'Mark a visible app task failed with a safe human-readable explanation.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, detail: { type: 'string' } }, required: ['task_id', 'detail'] }
  },
  {
    name: 'cosmise_app_show_message',
    description: 'Show a human-readable progress, warning, or result message in the activity feed.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, status: { type: 'string', enum: ['info', 'queued', 'running', 'success', 'warning', 'failed'] }, title: { type: 'string' }, detail: { type: 'string' }, operation: { type: 'string' } }, required: ['title'] }
  },
  {
    name: 'cosmise_app_log_call',
    description: 'Record a sanitized production Streamboards MCP call in the local dashboard. Do not include credentials or raw request payloads.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, tool_name: { type: 'string', pattern: '^streamboards_' }, status: { type: 'string', enum: ['running', 'success', 'failed'] }, detail: { type: 'string' }, duration_ms: { type: 'number', minimum: 0 }, streamboard_id: { type: 'string' }, verification: { type: 'object' } }, required: ['tool_name', 'status'] }
  },

  {
    name: 'cosmise_app_observe_call',
    description: 'Optional companion telemetry for connected-data or planning work that does not pass through a wrapped streamboards_* tool. Send only concise safe facts—never raw arguments, responses, credentials, headers, tokens, or sensitive identifiers.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        call_id: { type: 'string', description: 'Stable ID reused for the before/after update pair.' },
        tool_name: { type: 'string', pattern: '^(streamboards|ga4|google_ads|meta_ads|shopify|search_console|pinterest_ads|tiktok_ads|campaigns)_' },
        phase: { type: 'string', enum: OBSERVATION_PHASES },
        status: { type: 'string', enum: ['running', 'success', 'failed'] },
        message: { type: 'string', description: 'Short user-safe description for the in-view build overlay.' },
        learned: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Optional safe facts learned from the call, without IDs or raw response data.' },
        duration_ms: { type: 'number', minimum: 0 },
        streamboard_id: { type: 'string' }
      },
      required: ['task_id', 'call_id', 'tool_name', 'phase', 'status', 'message']
    }
  },
  {
    name: 'cosmise_app_show_verification',
    description: 'Show machine-readable verification checks and their human-readable outcome.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, verification: { type: 'object' } }, required: ['title', 'verification'] }
  },
  {
    name: 'cosmise_app_show_report',
    description: 'Add or update a Streamboards report in the app report viewer.',
    inputSchema: { type: 'object', properties: { streamboard_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, organisation: { type: 'string' }, status: { type: 'string' }, url: { type: 'string' }, public_url: { type: 'string' }, edit_url: { type: 'string' }, verification: { type: 'object' } }, required: ['streamboard_id', 'title', 'url'] }
  },
  {
    name: 'cosmise_app_list_layout_templates',
    description: 'List sanitized layout patterns learned from real Streamboards reports. Returns widget families, safe display configuration, and exact 48-column geometry without client data or source IDs.',
    inputSchema: { type: 'object', properties: { widget_types: { type: 'array', items: { type: 'string' } }, min_widgets: { type: 'integer' }, max_widgets: { type: 'integer' }, limit: { type: 'integer', minimum: 1, maximum: 100 } } }
  },
  {
    name: 'cosmise_app_clear_activity',
    description: 'Clear local task and activity history. Requires confirm=true.',
    inputSchema: { type: 'object', properties: { confirm: { type: 'boolean' } }, required: ['confirm'] },
    annotations: { destructiveHint: true }
  }
];

function textResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {})
  };
}

function observableToolName(value) {
  const name = String(value || '').trim();
  if (!OBSERVABLE_TOOL_PREFIXES.some((prefix) => name.startsWith(prefix))) throw new Error('tool_name is not an approved Cosmise MCP tool');
  return name;
}

function assertSafeObservation(args) {
  const serialized = JSON.stringify({ message: args.message, learned: args.learned });
  if (/csk_[A-Za-z0-9_-]{10,}|Bearer\s+\S+|COSMISE_MCP_KEY\s*=/i.test(serialized)) {
    throw new Error('Telemetry must not contain credentials or authorization values');
  }
}


function createMcp({ store, productionClient, catalog }) {
  const productionTools = (catalog?.tools || []).map((tool) => ({
    name: tool.name,
    description: `${tool.description} This call is securely proxied by the app backend and automatically appears in local activity.`,
    inputSchema: tool.inputSchema || { type: 'object', additionalProperties: true },
    ...(tool.destructive ? { annotations: { destructiveHint: true } } : {})
  }));

  async function tools() {
    return [...LOCAL_TOOLS, ...productionTools];
  }

  function localCall(name, args) {
    if (name === 'cosmise_app_get_bootstrap') return AGENT_BOOTSTRAP;
    if (name === 'cosmise_app_get_state') return store.snapshot();
    if (name === 'cosmise_app_sync_now') return null;
    if (name === 'cosmise_app_update_connection') {
      const configured = ['checking', 'ready', 'working', 'error'].includes(args.state);
      return { connection: store.updateConnection({ ...args, configured }).connection };
    }
    if (name === 'cosmise_app_set_view') return { view: store.setView({ ...args, source: 'agent_status' }).view };
    if (name === 'cosmise_app_start_task') return { task: store.createTask(args) };
    if (name === 'cosmise_app_update_task') {
      const task = store.updateTask(String(args.task_id || ''), args);
      if (!task) throw new Error('Task not found');
      store.addEvent({ task_id: task.id, status: task.status === 'failed' ? 'failed' : 'running', operation: 'task.updated', title: task.title, detail: task.detail });
      return { task };
    }
    if (name === 'cosmise_app_complete_task') {
      const task = store.updateTask(String(args.task_id || ''), { status: 'success', detail: args.detail });
      if (!task) throw new Error('Task not found');
      store.addEvent({ task_id: task.id, status: 'success', operation: 'task.completed', title: task.title, detail: args.detail, verification: args.verification });
      return { task, verification: args.verification || null };
    }
    if (name === 'cosmise_app_fail_task') {
      const task = store.updateTask(String(args.task_id || ''), { status: 'failed', detail: args.detail });
      if (!task) throw new Error('Task not found');
      store.addEvent({ task_id: task.id, status: 'failed', operation: 'task.failed', title: task.title, detail: args.detail });
      return { task };
    }
    if (name === 'cosmise_app_show_message') return { event: store.addEvent(args) };
    if (name === 'cosmise_app_log_call') {
      const toolName = String(args.tool_name || '').trim();
      if (!toolName.startsWith('streamboards_')) throw new Error('tool_name must start with streamboards_');
      return { event: store.addEvent({
        task_id: args.task_id,
        source: 'remote_mcp',
        status: args.status,
        operation: toolName,
        title: toolName,
        detail: args.detail,
        duration_ms: args.duration_ms,
        resource: args.streamboard_id ? { type: 'streamboard', id: String(args.streamboard_id) } : null,
        verification: args.verification
      }) };
    }
    if (name === 'cosmise_app_observe_call') {
      const toolName = observableToolName(args.tool_name);
      const taskId = String(args.task_id || '').trim();
      const task = store.snapshot().tasks.find((item) => item.id === taskId);
      if (!task) throw new Error('Task not found');
      if (!OBSERVATION_PHASES.includes(args.phase)) throw new Error('Invalid observation phase');
      if (!['running', 'success', 'failed'].includes(args.status)) throw new Error('Invalid observation status');
      if (!String(args.message || '').trim()) throw new Error('message is required');
      assertSafeObservation(args);
      return { event: store.upsertCallEvent({
        call_id: args.call_id,
        task_id: taskId,
        source: 'remote_mcp',
        status: args.status,
        phase: args.phase,
        operation: toolName,
        title: args.message,
        detail: args.message,
        learned: args.learned,
        duration_ms: args.duration_ms,
        resource: args.streamboard_id ? { type: 'streamboard', id: String(args.streamboard_id) } : null
      }) };
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

  async function callTool(name, args = {}) {
    const result = localCall(name, args);
    if (result !== null) return result;
    if (!productionClient) throw new Error('Cosmise MCP backend is unavailable.');
    if (name === 'cosmise_app_sync_now') {
      await productionClient.reconcile();
      return { state: store.snapshot() };
    }
    return (await productionClient.callTool(name, args)).data;
  }

  async function handle(message) {
    const id = message?.id ?? null;
    try {
      if (message?.method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cosmise-streamboards-wrapper', version: '0.3.7' }, instructions: AGENT_INSTRUCTIONS } };
      if (message?.method === 'ping') return { jsonrpc: '2.0', id, result: {} };
      if (message?.method === 'notifications/initialized') return null;
      if (message?.method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: await tools() } };
      if (message?.method === 'tools/call') {
        const name = String(message?.params?.name || '');
        if (!name) throw new Error('Tool name is required');
        const result = await callTool(name, message?.params?.arguments || {});
        return { jsonrpc: '2.0', id, result: textResult(result) };
      }
      return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } };
    } catch (error) {
      return { jsonrpc: '2.0', id, result: textResult({ ok: false, error: error.message }, true) };
    }
  }

  return { handle, tools, callTool };
}

module.exports = { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, createMcp, LOCAL_TOOLS };
