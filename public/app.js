'use strict';

const ui = {
  state: null,
  entries: [],
  open: [],
  active: null,
  railOpen: window.innerWidth > 900,
  streamConnected: false,
  initialized: false,
  contentSignature: null,
  railSignature: null,
  tabsSignature: null,
  toolbarSignature: null
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
    if (!['queued', 'running', 'waiting'].includes(task.status)) continue;
    const resource = task.resource && typeof task.resource === 'object' ? task.resource : {};
    const key = entryKey(resource.id || `task-${task.id}`);
    if (entries.has(key)) continue;
    const value = progress(task);
    const state = task.status === 'running' ? 'build' : 'queued';
    entries.set(key, {
      key,
      title: resource.title || task.title || 'Streamboard',
      status: state,
      meta: state === 'build' && value.total ? `building · ${value.current}/${value.total}` : 'queued',
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

function verifiedPublicUrl(entry) {
  return entry?.report?.verification?.resolver_ok === true ? entry.report.public_url || null : null;
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
  $('#repbar').hidden = true;
  $('#repbar').innerHTML = '';
  ui.toolbarSignature = 'credential-gate';
  if (ui.contentSignature !== 'credential-gate') {
    ui.contentSignature = 'credential-gate';
    content.innerHTML = `<div class="empty"><div class="m"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></div><h2>Cosmise isn’t connected yet</h2><p>Ask your agent whether Streamboards is ready. If it isn’t, the agent knows exactly how to connect Cosmise and will set everything up for you.</p><div class="askchip">“Is Cosmise Streamboards ready?”</div><div class="gate-status"><span><i></i>Waiting for connection</span></div></div>`;
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
  const gate = backendCredentialMissing();
  const connection = ui.state?.connection || {};
  const organisation = connection.organisation?.name || connection.organisation?.id || '';
  const reports = gate
    ? '<div class="gatehint">Reports appear here once Cosmise is connected.</div>'
    : ui.entries.length
    ? ui.entries.map((entry) => `<button class="ri ${entry.key === ui.active ? 'on' : ''}" type="button" data-action="open" data-id="${escapeHtml(entry.key)}" data-rail-title="${escapeHtml(entry.title)}" aria-current="${entry.key === ui.active ? 'page' : 'false'}"><span class="ic">${escapeHtml(initials(entry.title))}<span class="s ${entry.status}"></span></span><span class="tx"><span class="n">${escapeHtml(entry.title)}</span></span></button>`).join('')
    : '';
  const footer = !gate && organisation ? `<div class="foot"><div class="u"><span class="av" aria-hidden="true"></span><div class="uu"><div class="n">${escapeHtml(organisation)}</div><div class="m">${ui.entries.length} Streamboard${ui.entries.length === 1 ? '' : 's'}</div></div></div></div>` : '';
  const signature = JSON.stringify([gate, ui.railOpen, ui.active, organisation, ui.entries.map((entry) => [entry.key, entry.title, entry.status, entry.meta])]);
  if (ui.railSignature === signature) return;
  ui.railSignature = signature;
  $('#rail').className = `rail${ui.railOpen ? ' open' : ''}`;
  $('#rail').innerHTML = `<div class="top"><span class="logo"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></span><div class="wm"><div class="eye">Cosmise</div><div class="nm">Streamboards</div></div><button class="tg" type="button" data-action="toggle-rail" title="${ui.railOpen ? 'Collapse' : 'Expand'} reports">${ui.railOpen ? ICON.chevron : ICON.menu}</button></div><div class="lbl">Reports</div>${gate ? reports : `<div class="list">${reports}</div>`}${footer}`;
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

function renderToolbar(entry) {
  const toolbar = $('#repbar');
  const publicUrl = verifiedPublicUrl(entry);
  const signature = publicUrl ? `${entry.key}:${publicUrl}` : 'hidden';
  if (ui.toolbarSignature === signature) return;
  ui.toolbarSignature = signature;
  if (!publicUrl) {
    toolbar.hidden = true;
    toolbar.innerHTML = '';
    return;
  }
  const url = publicUrl;
  toolbar.hidden = false;
  toolbar.innerHTML = `<div class="addr"><span class="lk">${ICON.lock}</span><span class="u">${escapeHtml(url)}</span></div><div class="acts"><button class="tb" type="button" data-action="copy" title="Copy report link">${ICON.copy}<span>Copy link</span></button><button class="tb ic" type="button" data-action="refresh" title="Refresh report">${ICON.refresh}</button><button class="tb ic" type="button" data-action="external" title="Open in new window">${ICON.external}</button><button class="tb ic" type="button" data-action="fullscreen" title="Fullscreen">${ICON.fullscreen}</button></div>`;
}

function buildLog(task) {
  const events = (ui.state?.events || []).filter((event) => !task?.id || event.task_id === task.id).slice(0, 10).reverse();
  if (!events.length) return '';
  return `<div class="log">${events.map((event) => {
    const failed = event.status === 'failed';
    const running = event.status === 'running' || event.status === 'queued';
    const learned = Array.isArray(event.learned) ? event.learned.filter(Boolean).slice(0, 2) : [];
    return `<div class="l"><span class="c ${failed ? 'bad' : running ? 'run' : ''}">${failed ? '✕' : running ? '▸' : '✓'}</span><span><b>${escapeHtml(event.source === 'remote_mcp' ? phaseLabel(event) : friendlyOperation(event.operation))}</b> — ${escapeHtml(friendlyStatusMessage(event, event.detail || event.title || event.status))}${learned.map((item) => `<span class="learned">${escapeHtml(item)}</span>`).join('')}</span></div>`;
  }).join('')}</div>`;
}

function buildSkeleton() {
  return `<div class="smast"><div><span class="sk" style="width:220px;height:20px"></span><span class="sk" style="width:300px;height:11px;margin-top:9px"></span></div><span class="sk" style="width:64px;height:26px;border-radius:999px"></span></div><div class="sbody"><div class="skpis">${[80, 64, 90, 56].map((width) => `<div class="skpi"><span class="sk" style="width:${width}px;height:10px"></span><span class="sk" style="width:${width + 34}px;height:24px;margin-top:12px"></span></div>`).join('')}</div><span class="sk" style="height:170px;margin-top:18px;border-radius:13px"></span><div class="srows">${[1, 2, 3].map(() => '<div class="srow"><span class="sk" style="width:18px;height:18px;border-radius:5px"></span><span class="sk" style="width:120px;height:11px"></span><span class="sk grow" style="height:8px;border-radius:999px"></span><span class="sk" style="width:38px;height:13px"></span></div>').join('')}</div></div>`;
}

function reportOverlay(entry) {
  if (entry?.task?.status !== 'running') return '';
  const task = entry.task || {};
  const value = progress(task);
  return `<div class="bshim" aria-hidden="true"></div><div class="bcard fade"><div class="bc"><div class="m"><img src="/assets/cosmise-mascot.png" alt=""><span class="spin"></span></div><h2>Refreshing this Streamboard</h2><p>The coding agent is updating this published board — the live version stays visible while it works.</p><div class="st"><span class="d"></span>Editing now${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}</div>${value.total ? `<div class="pbar"><i style="width:${value.percent}%"></i></div>` : ''}</div></div>`;
}

function updateReportOverlay(reportView, entry) {
  const editing = entry?.task?.status === 'running';
  reportView.classList.toggle('editing', editing);
  const state = reportView.querySelector('.report-state');
  if (state) {
    state.classList.toggle('edit', editing);
    state.innerHTML = `<i></i>${editing ? 'Editing' : 'Live'}`;
  }
  const editbar = reportView.querySelector('.editbar');
  if (editbar) editbar.hidden = !editing;
  const root = reportView.querySelector('.build-overlay-root');
  if (!root) return;
  if (!editing) {
    if (root.childElementCount) root.replaceChildren();
    return;
  }
  if (!root.querySelector('.bcard')) {
    root.innerHTML = reportOverlay(entry);
    return;
  }
  const value = progress(entry.task);
  const status = root.querySelector('.st');
  if (status) status.innerHTML = `<span class="d"></span>Editing now${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}`;
  const bar = root.querySelector('.pbar i');
  if (bar) bar.style.width = `${value.percent}%`;
}

function contentSignature(entry) {
  if (!entry) return 'welcome';
  const publicUrl = verifiedPublicUrl(entry);
  if (publicUrl) return `report:${entry.key}:${publicUrl}`;
  return `build:${entry.key}:${entry.status}`;
}

function updateBuildOverlay(entry) {
  const container = $('#content .buildwrap');
  if (!container) return;
  const task = entry?.task || {};
  const value = progress(task);
  const status = container.querySelector('.st-text');
  if (status) status.textContent = entry.status === 'failed' ? 'Build failed' : entry.status === 'queued' ? 'Queued' : `Building now${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}`;
  const bar = container.querySelector('.pbar i');
  if (bar) bar.style.width = `${value.percent}%`;
}

function renderContent(entry, force = false) {
  const signature = contentSignature(entry);
  const editing = entry?.task?.status === 'running';
  if (!force && ui.contentSignature === signature) {
    const reportView = $('#content .rep');
    if (reportView) updateReportOverlay(reportView, entry);
    else updateBuildOverlay(entry);
    return;
  }
  ui.contentSignature = signature;
  const content = $('#content');
  if (!entry) {
    content.innerHTML = `<div class="welcome"><div class="m"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></div><h2>Tell an agent to create a Cosmise Streamboard</h2><p>Cosmise is connected and ready. New reports appear here the moment the agent starts building.</p>${buildLog(null)}</div>`;
    return;
  }
  const publicUrl = verifiedPublicUrl(entry);
  if (publicUrl) {
    const frameUrl = publicUrl;
    content.innerHTML = `<article class="rep${editing ? ' editing' : ''}"><div class="frame-wrap"><div class="frame-loading"><span class="ld"><i></i>Loading Streamboard</span></div><iframe id="report-frame" src="${escapeHtml(frameUrl)}" title="${escapeHtml(entry.title)}" referrerpolicy="no-referrer"></iframe><div class="build-overlay-root">${reportOverlay(entry)}</div></div></article>`;
    $('#report-frame').addEventListener('load', () => $('.frame-wrap')?.classList.add('loaded'), { once: true });
    return;
  }
  const task = entry.task || {};
  const value = progress(task);
  const failed = entry.status === 'failed';
  const queued = entry.status === 'queued';
  const still = failed || queued;
  const headline = failed ? 'Report build needs attention' : queued ? 'Queued to build' : 'Building this Streamboard';
  const description = failed ? task.detail || 'The coding agent could not complete this Streamboard.' : queued ? 'The coding agent will start composing it as soon as the current build finishes.' : 'The coding agent is composing it right now — widgets render behind this card as they’re verified.';
  content.innerHTML = `<div class="buildwrap${still ? ' still' : ''}">${buildSkeleton()}<div class="bshim" aria-hidden="true"></div><div class="bcard"><div class="bc${failed ? ' failed' : ''}"><div class="m"><img src="/assets/cosmise-mascot.png" alt="">${still ? '' : '<span class="spin"></span>'}</div><h2>${headline}</h2><p>${escapeHtml(description)}</p><div class="st ${entry.status}"><span class="d"></span><span class="st-text">${failed ? 'Build failed' : queued ? 'Queued' : `Building now${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}`}</span></div>${!still && value.total ? `<div class="pbar"><i style="width:${value.percent}%"></i></div>` : ''}${buildLog(task)}</div></div></div>`;
}

function render(forceContent = false) {
  if (backendCredentialMissing()) {
    renderCredentialGate();
    return;
  }
  ui.entries = buildEntries();
  reconcileTabs();
  const entry = activeEntry();
  renderRail();
  renderTabs();
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
  if (window.innerWidth <= 900) {
    ui.railOpen = false;
    renderRail();
  }
}

async function closeEntry(id) {
  if (!ui.open.includes(id)) return;
  await updateView('close', id);
}

function currentUrl() {
  const entry = activeEntry();
  return verifiedPublicUrl(entry);
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { element.hidden = true; }, 1800);
}

function railPopover() {
  let popover = $('#rail-popover');
  if (popover) return popover;
  popover = document.createElement('div');
  popover.id = 'rail-popover';
  popover.className = 'rail-popover';
  popover.role = 'tooltip';
  popover.hidden = true;
  document.body.appendChild(popover);
  return popover;
}

function showRailPopover(row) {
  const popover = railPopover();
  const label = row?.dataset.railTitle;
  if (!label) return;
  popover.textContent = label;
  popover.hidden = false;
  const bounds = row.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  popover.style.left = `${Math.min(window.innerWidth - width - 12, bounds.right + 10)}px`;
  popover.style.top = `${Math.max(12, Math.min(window.innerHeight - height - 12, bounds.top + (bounds.height - height) / 2))}px`;
}

function hideRailPopover(row) {
  const popover = $('#rail-popover');
  if (!popover || row?.matches(':hover, :focus-within')) return;
  popover.hidden = true;
}

async function copyReport(button) {
  const url = currentUrl();
  if (!url) return;
  await navigator.clipboard.writeText(url);
  button.classList.add('done');
  const label = button.querySelector('span');
  if (label) label.textContent = 'Copied';
  toast('Report link copied');
  setTimeout(() => {
    button.classList.remove('done');
    if (label) label.textContent = 'Copy link';
  }, 1400);
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
  };
  source.onerror = () => {
    ui.streamConnected = false;
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

document.addEventListener('pointerover', (event) => {
  const row = event.target.closest('[data-rail-title]');
  if (row && !row.contains(event.relatedTarget)) showRailPopover(row);
});

document.addEventListener('pointerout', (event) => {
  const row = event.target.closest('[data-rail-title]');
  if (row && !row.contains(event.relatedTarget)) hideRailPopover(row);
});

document.addEventListener('focusin', (event) => {
  const row = event.target.closest('[data-rail-title]');
  if (row) showRailPopover(row);
});

document.addEventListener('focusout', (event) => {
  const row = event.target.closest('[data-rail-title]');
  if (row && !row.contains(event.relatedTarget)) hideRailPopover(row);
});

load().then(() => {
  connectEvents();
  startStatePolling();
}).catch((error) => {
  $('#content').innerHTML = `<div class="problem"><h2>Streamboards could not load</h2><p>${escapeHtml(error.message)}</p><button class="retry" type="button" data-action="retry-load">Try again</button></div>`;
  $('#repbar').hidden = true;
});