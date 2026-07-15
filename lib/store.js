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
      schema_version: 2,
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
      updated_at: now()
    });
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
    return JSON.parse(JSON.stringify(this.state));
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
    this.state.events = [event, ...this.state.events].slice(0, 500);
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
    this.state.events = [existing, ...this.state.events.filter((event) => event.id !== existing.id)].slice(0, 500);
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
      public_url: text(input.public_url, 2000) || url,
      edit_url: text(input.edit_url, 2000) || null,
      organisation: text(input.organisation, 160) || null,
      description: text(input.description, 500) || null,
      status: text(input.status, 40) || 'ready',
      verification: input.verification && typeof input.verification === 'object' ? input.verification : null,
      updated_at: input.updated_at || now()
    };
    this.state.reports = [report, ...this.state.reports.filter((item) => item.id !== report.id)].slice(0, 100);
    this.addEvent({ status: 'success', operation: 'report.ready', title: `${report.title} is ready`, resource: { type: 'streamboard', id: report.streamboard_id || report.id }, verification: report.verification }, false);
    this.save('report');
    return report;
  }

  removeReport(id) {
    const before = this.state.reports.length;
    this.state.reports = this.state.reports.filter((report) => report.id !== id);
    if (this.state.reports.length === before) return false;
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
