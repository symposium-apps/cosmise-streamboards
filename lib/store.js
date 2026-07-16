'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TASK_STATUSES = new Set(['queued', 'running', 'waiting', 'success', 'failed', 'cancelled']);
const EVENT_STATUSES = new Set(['info', 'queued', 'running', 'success', 'warning', 'failed']);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function now() {
  return new Date().toISOString();
}

function learned(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 240)).filter(Boolean).slice(0, 6);
}

class AppStore {
  constructor({ file, profileId }) {
    this.file = file;
    this.listeners = new Set();
    this.state = this.load({
      schema_version: 4,
      profile_id: profileId || 'local',
      connection: {
        configured: false,
        state: 'missing_key',
        organisation: null,
        endpoint: null,
        mode: null,
        last_checked_at: null,
        message: 'No Cosmise MCP key configured.'
      },
      tasks: [],
      events: [],
      reports: [],
      view: {
        active_report_id: null,
        open_report_ids: [],
        focused_task_id: null,
        status: 'idle',
        source: 'system',
        updated_at: now()
      },
      runtime: null,
      last_sync_at: null,
      updated_at: now()
    });
    this.state.schema_version = 4;
    this.state.profile_id = profileId || 'local';
    this.state.tasks = Array.isArray(this.state.tasks) ? this.state.tasks.slice(0, 100) : [];
    this.state.events = Array.isArray(this.state.events) ? this.state.events.slice(0, 100) : [];
    this.state.reports = Array.isArray(this.state.reports) ? this.state.reports.slice(0, 100) : [];
    const view = this.state.view || {};
    this.state.view = {
      active_report_id: text(view.active_report_id, 100) || null,
      open_report_ids: Array.isArray(view.open_report_ids) ? [...new Set(view.open_report_ids.map((id) => text(id, 100)).filter(Boolean))].slice(0, 12) : [],
      focused_task_id: text(view.focused_task_id, 80) || null,
      status: text(view.status, 40) || 'idle',
      source: text(view.source, 40) || 'system',
      updated_at: view.updated_at || now()
    };
    const connection = this.state.connection || {};
    this.state.connection = {
      configured: connection.configured === true,
      state: connection.state === 'agent_ready' ? 'missing_key' : connection.state || 'missing_key',
      organisation: connection.organisation || null,
      endpoint: connection.endpoint || null,
      mode: connection.mode || null,
      last_checked_at: connection.last_checked_at || null,
      message: text(connection.message, 500) || 'No Cosmise MCP key configured.'
    };
  }

  load(fallback) {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const { learned_templates: discardedTemplates, ...safeParsed } = parsed;
      return { ...fallback, ...safeParsed, connection: { ...fallback.connection, ...(safeParsed.connection || {}) } };
    } catch {
      return fallback;
    }
  }

  snapshot() {
    const state = JSON.parse(JSON.stringify(this.state));
    const activeTasks = state.tasks.filter((task) => ['queued', 'running', 'waiting'].includes(task.status));
    state.sidebar_items = state.reports.map((report) => {
      const id = report.streamboard_id || report.id;
      const task = activeTasks.find((item) => String(item.resource?.id || '') === id) || null;
      const event = state.events.find((item) => String(item.resource?.id || '') === id) || null;
      const status = task?.status || (event?.status === 'running' ? 'running' : event?.status === 'failed' ? 'failed' : report.status || 'ready');
      return {
        id,
        title: report.title,
        subtitle: report.description || report.organisation || 'Streamboard report',
        status,
        detail: task?.detail || event?.detail || report.description || null,
        selected: state.view.active_report_id === id,
        open: state.view.open_report_ids.includes(id),
        task_id: task?.id || null,
        updated_at: task?.updated_at || event?.updated_at || event?.created_at || report.updated_at
      };
    });
    return state;
  }

  setView(input = {}, save = true) {
    const current = this.state.view;
    let open = input.open_report_ids === undefined
      ? current.open_report_ids
      : [...new Set((Array.isArray(input.open_report_ids) ? input.open_report_ids : []).map((id) => text(id, 100)).filter(Boolean))].slice(0, 12);
    const active = input.active_report_id === undefined ? current.active_report_id : text(input.active_report_id, 100) || null;
    if (active && !open.includes(active)) open = [active, ...open].slice(0, 12);
    this.state.view = {
      active_report_id: active,
      open_report_ids: open,
      focused_task_id: input.focused_task_id === undefined ? current.focused_task_id : text(input.focused_task_id, 80) || null,
      status: text(input.status, 40) || current.status || 'idle',
      source: text(input.source, 40) || 'status_api',
      updated_at: now()
    };
    return save ? this.save('view') : this.state.view;
  }

  focusStreamboard(streamboardId, input = {}, save = true) {
    const id = text(streamboardId, 100);
    if (!id) return this.state.view;
    return this.setView({
      active_report_id: id,
      open_report_ids: [id, ...this.state.view.open_report_ids.filter((item) => item !== id)],
      focused_task_id: input.task_id,
      status: input.status || 'working',
      source: input.source || 'agent_status'
    }, save);
  }

  closeReport(streamboardId) {
    const id = text(streamboardId, 100);
    const open = this.state.view.open_report_ids.filter((item) => item !== id);
    return this.setView({
      open_report_ids: open,
      active_report_id: this.state.view.active_report_id === id ? open[0] || null : this.state.view.active_report_id,
      source: 'browser_navigation'
    });
  }

  activeTask() {
    return this.state.tasks.find((task) => ['queued', 'running', 'waiting'].includes(task.status)) || null;
  }

  setRuntime(runtime) {
    this.state.runtime = runtime && typeof runtime === 'object' ? runtime : null;
    return this.state.runtime;
  }

  save(type = 'state') {
    this.state.updated_at = now();
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    const message = { type, at: this.state.updated_at, state: this.snapshot() };
    for (const listener of this.listeners) listener(message);
    return this.snapshot();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateConnection(input = {}) {
    const allowedStates = new Set(['missing_key', 'checking', 'ready', 'working', 'error']);
    const allowedModes = new Set(['read', 'read_write']);
    this.state.connection = {
      ...this.state.connection,
      configured: input.configured === undefined ? this.state.connection.configured : input.configured === true,
      state: allowedStates.has(input.state) ? input.state : this.state.connection.state,
      organisation: input.organisation === undefined ? this.state.connection.organisation : input.organisation,
      endpoint: input.endpoint === undefined ? this.state.connection.endpoint : input.endpoint,
      mode: input.mode === null ? null : allowedModes.has(input.mode) ? input.mode : this.state.connection.mode,
      message: input.message === undefined ? this.state.connection.message : text(input.message),
      last_checked_at: input.last_checked_at || now()
    };
    return this.save('connection');
  }

  createTask(input = {}) {
    const task = {
      id: text(input.id, 80) || crypto.randomUUID(),
      title: text(input.title, 160) || 'Agent task',
      detail: text(input.detail, 1000),
      status: TASK_STATUSES.has(input.status) ? input.status : 'running',
      progress: this.progress(input.progress),
      resource: input.resource && typeof input.resource === 'object' ? input.resource : null,
      created_at: now(),
      updated_at: now(),
      completed_at: null
    };
    this.state.tasks = [task, ...this.state.tasks.filter((item) => item.id !== task.id)].slice(0, 100);
    if (task.resource?.type === 'streamboard' && task.resource?.id) this.focusStreamboard(task.resource.id, { task_id: task.id, status: task.status, source: 'task' }, false);
    this.addEvent({ task_id: task.id, status: task.status, operation: 'task.started', title: task.title, detail: task.detail }, false);
    this.save('task');
    return task;
  }

  updateTask(id, input = {}) {
    const task = this.state.tasks.find((item) => item.id === id);
    if (!task) return null;
    if (input.title !== undefined) task.title = text(input.title, 160) || task.title;
    if (input.detail !== undefined) task.detail = text(input.detail, 1000);
    if (TASK_STATUSES.has(input.status)) task.status = input.status;
    if (input.progress !== undefined) task.progress = this.progress(input.progress);
    if (input.resource && typeof input.resource === 'object') task.resource = input.resource;
    task.updated_at = now();
    if (['success', 'failed', 'cancelled'].includes(task.status)) task.completed_at = now();
    if (task.resource?.type === 'streamboard' && task.resource?.id) this.focusStreamboard(task.resource.id, { task_id: task.id, status: task.status, source: 'task' }, false);
    this.save('task');
    return task;
  }

  progress(value) {
    const current = Number(value?.current ?? value?.completed ?? 0);
    const total = Number(value?.total ?? 0);
    return { current: Number.isFinite(current) ? Math.max(0, current) : 0, total: Number.isFinite(total) ? Math.max(0, total) : 0 };
  }

  addEvent(input = {}, save = true) {
    const event = {
      id: crypto.randomUUID(),
      call_id: text(input.call_id, 100) || null,
      task_id: text(input.task_id, 80) || null,
      source: text(input.source, 40) || 'local_app',
      status: EVENT_STATUSES.has(input.status) ? input.status : 'info',
      phase: text(input.phase, 40) || null,
      operation: text(input.operation, 120) || 'agent.message',
      title: text(input.title, 200) || 'Agent update',
      detail: text(input.detail, 2000),
      learned: learned(input.learned),
      resource: input.resource && typeof input.resource === 'object' ? input.resource : null,
      verification: input.verification && typeof input.verification === 'object' ? input.verification : null,
      receipt: input.receipt && typeof input.receipt === 'object' ? input.receipt : null,
      duration_ms: Number.isFinite(Number(input.duration_ms)) ? Math.max(0, Math.round(Number(input.duration_ms))) : null,
      created_at: now()
    };
    this.state.events = [event, ...this.state.events].slice(0, 100);
    if (event.resource?.type === 'streamboard' && event.resource?.id) this.focusStreamboard(event.resource.id, { task_id: event.task_id, status: event.status, source: 'activity' }, false);
    if (save) this.save('event');
    return event;
  }

  upsertCallEvent(input = {}) {
    const callId = text(input.call_id, 100);
    if (!callId) throw new Error('call_id is required');
    const existing = this.state.events.find((event) => event.call_id === callId && event.task_id === (text(input.task_id, 80) || null));
    if (!existing) return this.addEvent(input);
    existing.source = text(input.source, 40) || existing.source;
    existing.status = EVENT_STATUSES.has(input.status) ? input.status : existing.status;
    existing.phase = text(input.phase, 40) || existing.phase;
    existing.operation = text(input.operation, 120) || existing.operation;
    existing.title = text(input.title, 200) || existing.title;
    existing.detail = text(input.detail, 2000);
    existing.learned = learned(input.learned);
    existing.resource = input.resource && typeof input.resource === 'object' ? input.resource : existing.resource;
    existing.duration_ms = Number.isFinite(Number(input.duration_ms)) ? Math.max(0, Math.round(Number(input.duration_ms))) : existing.duration_ms;
    existing.updated_at = now();
    this.state.events = [existing, ...this.state.events.filter((event) => event.id !== existing.id)].slice(0, 100);
    if (existing.resource?.type === 'streamboard' && existing.resource?.id) this.focusStreamboard(existing.resource.id, { task_id: existing.task_id, status: existing.status, source: 'wrapped_mcp' }, false);
    this.save('event');
    return existing;
  }


  addReport(input = {}) {
    const url = text(input.url, 2000);
    const report = {
      id: text(input.id, 100) || text(input.streamboard_id, 100) || crypto.randomUUID(),
      streamboard_id: text(input.streamboard_id, 100) || null,
      title: text(input.title, 200) || 'Streamboard',
      url,
      public_url: text(input.public_url, 2000) || null,
      edit_url: text(input.edit_url, 2000) || null,
      organisation: text(input.organisation, 160) || null,
      description: text(input.description, 500) || null,
      status: text(input.status, 40) || 'ready',
      verification: input.verification && typeof input.verification === 'object' ? input.verification : null,
      updated_at: input.updated_at || now()
    };
    this.state.reports = [report, ...this.state.reports.filter((item) => item.id !== report.id)].slice(0, 100);
    this.focusStreamboard(report.streamboard_id || report.id, { status: report.status, source: 'report' }, false);
    this.addEvent({ status: 'success', operation: 'report.ready', title: `${report.title} is ready`, resource: { type: 'streamboard', id: report.streamboard_id || report.id }, verification: report.verification }, false);
    this.save('report');
    return report;
  }

  reconcileReports(boards = []) {
    const existing = new Map(this.state.reports.map((report) => [report.streamboard_id || report.id, report]));
    this.state.reports = boards.map((board) => {
      const id = text(board?.streamboard_id || board?.id, 100);
      if (!id) return null;
      const previous = existing.get(id) || {};
      return {
        id,
        streamboard_id: id,
        title: text(board?.name || board?.title, 200) || previous.title || 'Streamboard',
        url: text(board?.url || board?.edit_url, 2000) || previous.url || '',
        public_url: text(board?.public_url, 2000) || previous.public_url || null,
        edit_url: text(board?.edit_url, 2000) || previous.edit_url || null,
        organisation: text(board?.organisation?.name || board?.organization?.name || board?.organisation_name, 160) || previous.organisation || null,
        description: text(board?.description, 500) || previous.description || null,
        status: text(board?.status, 40) || (board?.archived === true ? 'archived' : 'ready'),
        verification: previous.verification || null,
        updated_at: board?.updated_at || previous.updated_at || now()
      };
    }).filter(Boolean).slice(0, 100);
    const reportIds = this.state.reports.map((report) => report.streamboard_id || report.id);
    let open = this.state.view.open_report_ids.filter((id) => reportIds.includes(id));
    let active = reportIds.includes(this.state.view.active_report_id) ? this.state.view.active_report_id : null;
    if (!active && reportIds[0]) active = reportIds[0];
    if (active && !open.includes(active)) open = [active, ...open];
    this.setView({ active_report_id: active, open_report_ids: open, source: 'report_inventory' }, false);
    this.state.last_sync_at = now();
    return this.save('reports.synchronized');
  }

  mergeReportUrls(streamboardId, input = {}) {
    const id = text(streamboardId || input.streamboard_id || input.id, 100);
    if (!id) return null;
    let report = this.state.reports.find((item) => (item.streamboard_id || item.id) === id);
    if (!report) {
      report = { id, streamboard_id: id, title: text(input.title || input.name, 200) || 'Streamboard', status: 'ready', updated_at: now() };
      this.state.reports.unshift(report);
    }
    report.public_url = text(input.public_url || input.share_url, 2000) || report.public_url || null;
    report.edit_url = text(input.edit_url || input.editable_url || input.url, 2000) || report.edit_url || null;
    report.url = report.public_url || report.edit_url || report.url || '';
    report.updated_at = now();
    if (!this.state.view.active_report_id) this.focusStreamboard(id, { status: report.status, source: 'report_inventory' }, false);
    this.save('report.urls');
    return report;
  }

  removeReport(id) {
    const before = this.state.reports.length;
    this.state.reports = this.state.reports.filter((report) => report.id !== id);
    if (this.state.reports.length === before) return false;
    const open = this.state.view.open_report_ids.filter((item) => item !== id);
    this.setView({ open_report_ids: open, active_report_id: this.state.view.active_report_id === id ? open[0] || null : this.state.view.active_report_id, source: 'report_removed' }, false);
    this.save('report');
    return true;
  }

  clearActivity() {
    this.state.tasks = [];
    this.state.events = [];
    return this.save('cleared');
  }
}

module.exports = { AppStore, TASK_STATUSES, EVENT_STATUSES };
