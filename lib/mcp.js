'use strict';

const { listLayoutTemplates } = require('./layout-library');

const LOCAL_TOOLS = [
  {
    name: 'cosmise_app_get_state',
    description: 'Read the local Cosmise Streamboards app state, current tasks, activity and visible reports.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'cosmise_app_start_task',
    description: 'Start a visible agent task in the Cosmise Streamboards app.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, progress: { type: 'object' } }, required: ['title'] }
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
    name: 'cosmise_app_show_verification',
    description: 'Show machine-readable verification checks and their human-readable outcome.',
    inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, verification: { type: 'object' } }, required: ['title', 'verification'] }
  },
  {
    name: 'cosmise_app_show_report',
    description: 'Add or update a Streamboards report in the app report viewer.',
    inputSchema: { type: 'object', properties: { streamboard_id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, public_url: { type: 'string' }, edit_url: { type: 'string' }, verification: { type: 'object' } }, required: ['streamboard_id', 'title', 'url'] }
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


function createMcp({ store }) {
  async function tools() {
    return LOCAL_TOOLS;
  }

  function localCall(name, args) {
    if (name === 'cosmise_app_get_state') return store.snapshot();
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
    if (result === null) throw new Error('This endpoint exposes local app communication tools only. Configure production Streamboards MCP access in the agent profile.');
    return result;
  }

  async function handle(message) {
    const id = message?.id ?? null;
    try {
      if (message?.method === 'initialize') return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'cosmise-streamboards-local', version: '0.1.0' } } };
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

module.exports = { createMcp, LOCAL_TOOLS };
