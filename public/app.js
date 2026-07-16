'use strict';

const ui = {
  state: null,
  entries: [],
  open: [],
  active: null,
  railOpen: true,
  streamConnected: false,
  initialized: false,
  contentSignature: null,
  railSignature: null,
  tabsSignature: null,
  toolbarSignature: null,
  statusToastSignature: null
};
const STATE_POLL_MS = 2000;
let statePollInFlight = false;

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const ICON = {
  chevron: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  menu: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>',
  fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};

function timeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'now';
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function initials(title) {
  return String(title || 'Streamboard').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
}

function progress(task) {
  const current = Math.max(0, Number(task?.progress?.current || 0));
  const total = Math.max(0, Number(task?.progress?.total || 0));
  return { current, total, percent: total ? Math.min(100, (current / total) * 100) : 0 };
}

function entryKey(value) {
  return String(value || '').trim();
}

function buildEntries() {
  const reports = ui.state?.reports || [];
  const tasks = ui.state?.tasks || [];
  const sidebar = new Map((ui.state?.sidebar_items || []).map((item) => [String(item.id), item]));
  const entries = new Map();
  for (const report of reports) {
    const key = entryKey(report.streamboard_id || report.id);
    if (!key) continue;
    const item = sidebar.get(key) || {};
    const sidebarStatus = item.status === 'running' ? 'build' : item.status === 'queued' || item.status === 'waiting' ? 'queued' : item.status === 'failed' ? 'failed' : 'ready';
    entries.set(key, {
      key,
      title: item.title || report.title || 'Streamboard',
      status: sidebarStatus,
      meta: item.subtitle || report.description || report.organisation || 'Streamboard report',
      report,
      task: item.task_id ? tasks.find((task) => task.id === item.task_id) || null : null
    });
  }
  for (const task of tasks) {
    if (!['queued', 'running', 'waiting', 'failed'].includes(task.status)) continue;
    const resource = task.resource && typeof task.resource === 'object' ? task.resource : {};
    const key = entryKey(resource.id || `task-${task.id}`);
    if (entries.has(key) && task.status !== 'failed') continue;
    const value = progress(task);
    const state = task.status === 'running' ? 'build' : task.status === 'failed' ? 'failed' : 'queued';
    entries.set(key, {
      key,
      title: resource.title || task.title || 'Streamboard',
      status: state,
      meta: state === 'build' && value.total ? `building · ${value.current}/${value.total}` : state === 'failed' ? 'build failed' : 'queued',
      report: entries.get(key)?.report || null,
      task
    });
  }
  return [...entries.values()].sort((left, right) => {
    const leftTime = left.report?.updated_at || left.task?.updated_at || left.task?.created_at || '';
    const rightTime = right.report?.updated_at || right.task?.updated_at || right.task?.created_at || '';
    return String(rightTime).localeCompare(String(leftTime));
  });
}

function activeEntry() {
  return ui.entries.find((entry) => entry.key === ui.active) || null;
}

function activeTask() {
  return (ui.state?.tasks || []).find((task) => ['running', 'queued', 'waiting'].includes(task.status)) || null;
}

function backendCredentialMissing() {
  return ui.state?.runtime?.backend_mcp_configured !== true;
}

function renderCredentialGate() {
  const content = $('#content');
  ui.entries = [];
  ui.open = [];
  ui.active = null;
  renderRail();
  renderTabs();
  $('#agent').hidden = true;
  $('#agent').innerHTML = '';
  $('#repbar').hidden = true;
  $('#repbar').innerHTML = '';
  ui.toolbarSignature = 'credential-gate';
  if (ui.contentSignature !== 'credential-gate') {
    ui.contentSignature = 'credential-gate';
    content.innerHTML = `<div class="empty"><div class="m"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></div><h2>Connect Cosmise to continue</h2><p>This app backend does not have <code>COSMISE_MCP_TOKEN</code> in its own environment.</p><div class="log"><div class="l"><span class="c">1</span><span><b>Connect Cosmise</b> Open Connections, select Cosmise, and synchronize this organisation.</span></div><div class="l"><span class="c">2</span><span><b>Bind the app secret</b> From this app repository run <code>SYM_PROFILE_ID=&lt;active-profile-id&gt; node scripts/bind-profile-credential.js</code>.</span></div><div class="l"><span class="c">3</span><span><b>Restart Streamboards</b> Use the profile-scoped app controls so the backend receives its private environment.</span></div><div class="l"><span class="c">4</span><span><b>Verify access</b> The coding agent must call cosmise_app_sync_now, then streamboards_get_context through this app.</span></div></div><div class="st failed"><span class="d"></span>Backend MCP credential missing</div></div>`;
  }
}

function reconcileTabs() {
  const keys = new Set(ui.entries.map((entry) => entry.key));
  const view = ui.state?.view || {};
  ui.open = (view.open_report_ids || []).filter((key) => keys.has(key));
  ui.active = keys.has(view.active_report_id) ? view.active_report_id : ui.open[0] || null;
  if (ui.active && !ui.open.includes(ui.active)) ui.open.unshift(ui.active);
  ui.initialized = true;
}

function renderRail() {
  const connection = ui.state?.connection || {};
  const organisation = connection.organisation?.name || connection.organisation?.id || '';
  const reports = ui.entries.length
    ? ui.entries.map((entry) => `<button class="ri ${entry.key === ui.active ? 'on' : ''}" type="button" data-action="open" data-id="${escapeHtml(entry.key)}" aria-current="${entry.key === ui.active ? 'page' : 'false'}"><span class="ic">${escapeHtml(initials(entry.title))}<span class="s ${entry.status}"></span></span><span class="tx"><span class="n">${escapeHtml(entry.title)}</span><span class="m">${escapeHtml(entry.meta)}</span></span></button>`).join('')
    : '';
  const footer = organisation ? `<div class="foot"><div class="u"><span class="av" aria-hidden="true"></span><div class="uu"><div class="n">${escapeHtml(organisation)}</div></div></div></div>` : '';
  const signature = JSON.stringify([ui.railOpen, ui.active, organisation, ui.entries.map((entry) => [entry.key, entry.title, entry.status, entry.meta])]);
  if (ui.railSignature === signature) return;
  ui.railSignature = signature;
  $('#rail').className = `rail${ui.railOpen ? ' open' : ''}`;
  $('#rail').innerHTML = `<div class="top"><span class="logo"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></span><div class="wm"><div class="eye">Cosmise</div><div class="nm">Streamboards</div></div><button class="tg" type="button" data-action="toggle-rail" title="${ui.railOpen ? 'Collapse' : 'Expand'} reports">${ui.railOpen ? ICON.chevron : ICON.menu}</button></div><div class="lbl">Reports</div><div class="list">${reports}</div>${footer}`;
}

function renderTabs() {
  const openEntries = ui.open.map((key) => ui.entries.find((entry) => entry.key === key)).filter(Boolean);
  const signature = JSON.stringify([ui.active, openEntries.map((entry) => [entry.key, entry.title, entry.status])]);
  if (ui.tabsSignature === signature) return;
  ui.tabsSignature = signature;
  $('#tabbar').innerHTML = openEntries.length
    ? openEntries.map((entry) => `<div class="tab ${entry.key === ui.active ? 'on' : ''}" role="tab" aria-selected="${entry.key === ui.active}" tabindex="${entry.key === ui.active ? '0' : '-1'}" data-action="tab" data-id="${escapeHtml(entry.key)}"><span class="d ${entry.status}"></span><span class="nm">${escapeHtml(entry.title)}</span><button class="x" type="button" data-action="close" data-id="${escapeHtml(entry.key)}" aria-label="Close ${escapeHtml(entry.title)}">×</button></div>`).join('')
    : '';
}

function taskOperation(task) {
  return (ui.state?.events || []).find((event) => event.task_id === task?.id && event.source === 'remote_mcp') || null;
}

function phaseLabel(event, task) {
  const labels = { reading: 'Reviewing data', learning: 'Finding insights', building: 'Building report', refreshing: 'Refreshing data', verifying: 'Quality check', publishing: 'Publishing report' };
  return labels[event?.phase] || (task?.status === 'running' ? 'Preparing report' : task?.status === 'waiting' ? 'Waiting for access' : task?.status === 'queued' ? 'Up next' : 'Latest update');
}

function friendlyOperation(value) {
  const operation = String(value || 'agent update');
  const labels = {
    'task.started': 'Report started',
    'task.updated': 'Progress update',
    'task.completed': 'Report ready',
    'task.failed': 'Report needs attention',
    'report.ready': 'Report ready',
    'verification.completed': 'Quality check complete',
    'reports.synchronized': 'Reports refreshed'
  };
  if (labels[operation]) return labels[operation];
  return operation.replace(/^streamboards_/, '').replaceAll('_', ' ').replaceAll('.', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function friendlyStatusMessage(event, fallback = 'Updating your report.') {
  if (!event) return fallback;
  const operation = friendlyOperation(event.operation);
  const detail = String(event.detail || event.title || '').trim();
  if (!detail || detail.includes(event.operation)) return event.status === 'success' ? `${operation} complete` : operation;
  return detail.replace(/^streamboards_/i, '').replaceAll('_', ' ').replace(/ completed successfully\.?$/i, ' complete');
}

function observationDetail(event, fallback, includeLearned = false) {
  if (!event) return fallback;
  const learned = includeLearned && Array.isArray(event.learned) ? event.learned.filter(Boolean).slice(0, 2) : [];
  return [friendlyStatusMessage(event, fallback), learned.length ? learned.join(' · ') : ''].filter(Boolean).join(' — ');
}

function renderAgent() {
  const task = activeTask();
  const element = $('#agent');
  if (task) {
    element.hidden = false;
    const value = progress(task);
    const operation = taskOperation(task);
    const detail = observationDetail(operation, task.detail || 'Preparing the next report step.');
    const phase = phaseLabel(operation, task);
    element.className = 'agent working';
    element.innerHTML = `<span class="dot"></span><div class="msg"><b>Building now</b> · ${escapeHtml(detail)}</div><span class="pill">${value.total ? `${value.current} / ${value.total} widgets` : escapeHtml(phase)}</span>${value.total ? `<div class="barwrap"><progress max="${value.total}" value="${value.current}">${value.percent}%</progress></div>` : ''}`;
    return;
  }
  const latest = (ui.state?.events || [])[0];
  if (latest) {
    element.hidden = false;
    element.className = `agent ${latest.status === 'failed' ? 'failed' : ''}`;
    element.innerHTML = `<span class="dot"></span><div class="msg"><b>Latest update</b> · ${escapeHtml(friendlyStatusMessage(latest))}</div><span class="pill">${escapeHtml(timeAgo(latest.updated_at || latest.created_at))}</span>`;
  } else {
    element.hidden = true;
    element.innerHTML = '';
  }
}

function statusToastIcon(status) {
  const icons = {
    running: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.9-3M4 5v4h4M4 13a8 8 0 0 0 14.9 3M20 19v-4h-4"/></svg>',
    queued: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>',
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.3 2.4 4.8-5"/></svg>',
    failed: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.8 19h16.4L12 4Z"/><path d="M12 9v4M12 16.5v.1"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h3l2-5 4 10 2-5h5"/></svg>'
  };
  return icons[status] || icons.info;
}

function renderAgentToast() {
  const element = $('#agent-toast');
  const task = activeTask();
  const latest = (ui.state?.events || [])[0] || null;
  if (!task && !latest) {
    element.hidden = true;
    ui.statusToastSignature = null;
    return;
  }
  const operation = task ? taskOperation(task) : latest;
  const message = operation ? friendlyStatusMessage(operation, task?.detail) : task?.detail || friendlyStatusMessage(latest);
  const status = operation?.status || task?.status || latest?.status || 'info';
  const toastStatus = task ? (task.status === 'waiting' || task.status === 'queued' ? 'queued' : 'running') : status;
  const timestamp = operation?.updated_at || operation?.created_at || task?.updated_at || latest?.updated_at || latest?.created_at;
  const label = task ? phaseLabel(operation, task) : status === 'failed' ? 'Needs attention' : status === 'success' ? 'Completed' : 'Latest update';
  const signature = `${operation?.id || task?.id || 'status'}:${toastStatus}:${message}:${timestamp || ''}`;
  if (ui.statusToastSignature === signature) {
    const time = element.querySelector('.agent-toast-time');
    if (time) time.textContent = timeAgo(timestamp);
    return;
  }
  ui.statusToastSignature = signature;
  element.className = `agent-toast ${toastStatus}`;
  element.innerHTML = `<span class="agent-toast-icon">${statusToastIcon(toastStatus)}</span><span class="agent-toast-copy"><span class="agent-toast-label">${escapeHtml(label)}</span><span class="agent-toast-message">${escapeHtml(message)}</span></span><span class="agent-toast-time">${escapeHtml(timeAgo(timestamp))}</span>`;
  element.hidden = false;
  element.classList.remove('arrive');
  requestAnimationFrame(() => element.classList.add('arrive'));
}

function renderToolbar(entry) {
  const toolbar = $('#repbar');
  const signature = entry?.report?.public_url ? `${entry.key}:${entry.report.public_url}` : 'hidden';
  if (ui.toolbarSignature === signature) return;
  ui.toolbarSignature = signature;
  if (!entry?.report?.public_url) {
    toolbar.hidden = true;
    toolbar.innerHTML = '';
    return;
  }
  const url = entry.report.public_url || entry.report.url;
  toolbar.hidden = false;
  toolbar.innerHTML = `<div class="addr"><span class="lk">${ICON.lock}</span><span class="u">${escapeHtml(url)}</span></div><div class="acts"><button class="tb" type="button" data-action="copy" title="Copy report link">${ICON.copy}<span>Copy link</span></button><button class="tb ic" type="button" data-action="refresh" title="Refresh report">${ICON.refresh}</button><button class="tb ic" type="button" data-action="external" title="Open in new window">${ICON.external}</button><button class="tb ic" type="button" data-action="fullscreen" title="Fullscreen">${ICON.fullscreen}</button></div>`;
}

function buildLog(task) {
  const events = (ui.state?.events || []).filter((event) => !task?.id || event.task_id === task.id).slice(0, 10);
  if (!events.length) return '';
  return `<div class="log">${events.map((event) => `<div class="l"><span class="c">${event.status === 'success' ? '✓' : '▸'}</span><span><b>${escapeHtml(event.source === 'remote_mcp' ? phaseLabel(event) : friendlyOperation(event.operation))}</b> ${escapeHtml(observationDetail(event, event.detail || event.title || event.status, true))}</span></div>`).join('')}</div>`;
}

function contentSignature(entry) {
  if (!entry) return 'welcome';
  if (entry.report?.public_url) return `report:${entry.key}:${entry.report.public_url}`;
  const event = (ui.state?.events || []).find((item) => item.task_id === entry.task?.id);
  const latest = event ? `${event.id}:${event.updated_at || event.created_at}:${event.status}:${event.detail}:${JSON.stringify(event.learned || [])}` : '';
  return `${entry.status}:${entry.key}:${entry.task?.updated_at}:${latest}`;
}

function renderContent(entry, force = false) {
  const signature = contentSignature(entry);
  const editing = entry?.status === 'build';
  if (!force && ui.contentSignature === signature) {
    const reportView = $('#content .report-view');
    if (reportView) {
      reportView.classList.toggle('editing', editing);
      const state = reportView.querySelector('.report-state');
      if (state) state.innerHTML = editing ? '<i></i>Editing' : '<i></i>Live';
    }
    return;
  }
  ui.contentSignature = signature;
  const content = $('#content');
  if (!entry) {
    const connection = ui.state?.connection || {};
    const runtime = ui.state?.runtime || {};
    const fileCount = runtime.accessible_files?.count;
    const status = [connection.configured ? connection.message || 'Cosmise MCP connected.' : 'Connect Cosmise to start synchronizing Streamboards.', runtime.backend_mcp_configured ? 'Backend MCP ready' : 'Backend MCP key missing', Number.isFinite(fileCount) ? `${fileCount} server files available` : ''].filter(Boolean).join(' · ');
    content.innerHTML = `<div class="welcome"><div class="m"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></div><h2>Tell an agent to create a Cosmise Streamboard</h2><p>${escapeHtml(status)}</p>${buildLog(null)}</div>`;
    return;
  }
  if (entry.report?.public_url) {
    const frameUrl = entry.report.public_url;
    content.innerHTML = `<article class="report-view${editing ? ' editing' : ''}"><header class="report-mast"><div><div class="report-title">${escapeHtml(entry.title)}</div><div class="report-sub">${escapeHtml(entry.report.organisation || entry.report.public_url || frameUrl)}</div></div><span class="live report-state"><i></i>${editing ? 'Editing' : 'Live'}</span></header><div class="frame-wrap"><div class="frame-loading"><i></i>Loading Streamboard</div><iframe id="report-frame" src="${escapeHtml(frameUrl)}" title="${escapeHtml(entry.title)}" referrerpolicy="no-referrer"></iframe><div class="edit-shimmer" aria-hidden="true"></div></div></article>`;
    $('#report-frame').addEventListener('load', () => $('.frame-wrap')?.classList.add('loaded'), { once: true });
    return;
  }
  const task = entry.task || {};
  const value = progress(task);
  const operation = taskOperation(task);
  const liveDetail = observationDetail(operation, task.detail || 'Composing your Streamboard…');
  const failed = entry.status === 'failed';
  const queued = entry.status === 'queued';
  content.innerHTML = `<div class="empty"><div class="m"><img src="/assets/cosmise-mascot.png" alt="">${queued || failed ? '' : '<span class="spin"></span>'}</div><h2>${failed ? 'Report build needs attention' : 'Report not built yet'}</h2><p>${failed ? escapeHtml(task.detail || 'The coding agent could not complete this Streamboard.') : queued ? 'This Streamboard is queued. The coding agent will start composing it shortly.' : 'The coding agent is composing this Streamboard right now. It’ll render here the moment every widget is verified.'}</p><div class="st ${entry.status}"><span class="d"></span><span class="st-text">${failed ? 'Build failed' : queued ? 'Queued' : `Building now · ${escapeHtml(liveDetail)}${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}`}</span></div>${!failed && !queued && value.total ? `<div class="pbar"><progress max="${value.total}" value="${value.current}">${value.percent}%</progress></div>` : ''}${buildLog(task)}</div>`;
}

function render(forceContent = false) {
  renderAgentToast();
  if (backendCredentialMissing()) {
    renderCredentialGate();
    return;
  }
  ui.entries = buildEntries();
  reconcileTabs();
  const entry = activeEntry();
  renderRail();
  renderTabs();
  renderAgent();
  renderToolbar(entry);
  renderContent(entry, forceContent);
}

async function updateView(action, id) {
  const response = await fetch('/api/view', {
    method: 'PATCH',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ action, report_id: id })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `View update failed (${response.status})`);
  await load(true);
}

async function openEntry(id) {
  if (!ui.entries.some((entry) => entry.key === id)) return;
  if (ui.active === id && ui.open.includes(id)) return;
  await updateView('select', id);
}

async function closeEntry(id) {
  if (!ui.open.includes(id)) return;
  await updateView('close', id);
}

function currentUrl() {
  const entry = activeEntry();
  return entry?.report?.public_url || null;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 1800);
}

async function copyReport(button) {
  const url = currentUrl();
  if (!url) return;
  await navigator.clipboard.writeText(url);
  button.classList.add('done');
  const label = button.querySelector('span');
  if (label) label.textContent = 'Copied';
  toast('Report link copied');
  setTimeout(() => renderToolbar(activeEntry()), 1400);
}

async function api(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function load(forceContent = true) {
  const response = await api('/api/state');
  ui.state = response.data;
  render(forceContent);
}

function startStatePolling() {
  setInterval(async () => {
    if (statePollInFlight) return;
    statePollInFlight = true;
    try {
      await load(false);
    } catch (_) {
      // SSE reconnects automatically; polling is the quiet fallback when it cannot.
    } finally {
      statePollInFlight = false;
    }
  }, STATE_POLL_MS);
}

function connectEvents() {
  const source = new EventSource('/api/events/stream');
  source.addEventListener('state', (event) => {
    ui.state = JSON.parse(event.data).state;
    ui.streamConnected = true;
    render();
  });
  source.onopen = () => {
    ui.streamConnected = true;
    renderAgent();
  };
  source.onerror = () => {
    ui.streamConnected = false;
    renderAgent();
  };
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;
  try {
    if (action === 'toggle-rail') { ui.railOpen = !ui.railOpen; renderRail(); }
    else if (action === 'open' || action === 'tab') await openEntry(id);
    else if (action === 'close') { event.stopPropagation(); await closeEntry(id); }
    else if (action === 'copy') await copyReport(target);
    else if (action === 'refresh') renderContent(activeEntry(), true);
    else if (action === 'external') { const url = currentUrl(); if (url) window.open(url, '_blank', 'noopener,noreferrer'); }
    else if (action === 'fullscreen') await $('#content').requestFullscreen();
    else if (action === 'retry-load') { await load(); }
  } catch (error) { toast(error.message); }
});

document.addEventListener('keydown', (event) => {
  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && event.target.closest('[role="tab"]') && ui.open.length > 1) {
    const index = ui.open.indexOf(ui.active);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    openEntry(ui.open[(index + delta + ui.open.length) % ui.open.length]).catch((error) => toast(error.message));
    document.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  }
});

load().then(() => {
  connectEvents();
  startStatePolling();
}).catch((error) => {
  $('#content').innerHTML = `<div class="problem"><h2>Streamboards could not load</h2><p>${escapeHtml(error.message)}</p><button class="retry" type="button" data-action="retry-load">Try again</button></div>`;
  $('#repbar').hidden = true;
});