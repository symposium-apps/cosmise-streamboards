'use strict';

const ui = {
  state: null,
  entries: [],
  open: [],
  active: null,
  railOpen: true,
  streamConnected: false,
  initialized: false,
  contentSignature: null
};

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
  const entries = new Map();
  for (const report of reports) {
    const key = entryKey(report.streamboard_id || report.id);
    if (!key) continue;
    entries.set(key, {
      key,
      title: report.title || 'Streamboard',
      status: report.status === 'failed' ? 'failed' : 'ready',
      meta: `${report.verification ? 'verified' : 'ready'} · ${timeAgo(report.updated_at)}`,
      report,
      task: null
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

function reconcileTabs() {
  const keys = new Set(ui.entries.map((entry) => entry.key));
  ui.open = ui.open.filter((key) => keys.has(key));
  if (!ui.initialized) {
    const first = ui.entries[0];
    if (first) {
      ui.open = [first.key];
      ui.active = first.key;
    }
    ui.initialized = true;
  }
  if (ui.active && !keys.has(ui.active)) ui.active = ui.open[0] || null;
}

function renderRail() {
  const connection = ui.state?.connection || {};
  const organisation = connection.organisation?.name || connection.organisation?.id || '';
  const reports = ui.entries.length
    ? ui.entries.map((entry) => `<button class="ri ${entry.key === ui.active ? 'on' : ''}" type="button" data-action="open" data-id="${escapeHtml(entry.key)}" aria-current="${entry.key === ui.active ? 'page' : 'false'}"><span class="ic">${escapeHtml(initials(entry.title))}<span class="s ${entry.status}"></span></span><span class="tx"><span class="n">${escapeHtml(entry.title)}</span><span class="m">${escapeHtml(entry.meta)}</span></span></button>`).join('')
    : '';
  const footer = organisation ? `<div class="foot"><div class="u"><span class="av" aria-hidden="true"></span><div class="uu"><div class="n">${escapeHtml(organisation)}</div></div></div></div>` : '';
  $('#rail').className = `rail${ui.railOpen ? ' open' : ''}`;
  $('#rail').innerHTML = `<div class="top"><span class="logo"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></span><div class="wm"><div class="eye">Cosmise</div><div class="nm">Streamboards</div></div><button class="tg" type="button" data-action="toggle-rail" title="${ui.railOpen ? 'Collapse' : 'Expand'} reports">${ui.railOpen ? ICON.chevron : ICON.menu}</button></div><div class="lbl">Reports</div><div class="list">${reports}</div>${footer}`;
}

function renderTabs() {
  const openEntries = ui.open.map((key) => ui.entries.find((entry) => entry.key === key)).filter(Boolean);
  $('#tabbar').innerHTML = openEntries.length
    ? openEntries.map((entry) => `<div class="tab ${entry.key === ui.active ? 'on' : ''}" role="tab" aria-selected="${entry.key === ui.active}" tabindex="${entry.key === ui.active ? '0' : '-1'}" data-action="tab" data-id="${escapeHtml(entry.key)}"><span class="d ${entry.status}"></span><span class="nm">${escapeHtml(entry.title)}</span><button class="x" type="button" data-action="close" data-id="${escapeHtml(entry.key)}" aria-label="Close ${escapeHtml(entry.title)}">×</button></div>`).join('')
    : '';
}

function taskOperation(task) {
  return (ui.state?.events || []).find((event) => event.task_id === task?.id && event.source === 'remote_mcp') || null;
}

function phaseLabel(event, task) {
  const labels = { reading: 'Reading', learning: 'Learning', building: 'Building', refreshing: 'Refreshing', verifying: 'Verifying', publishing: 'Publishing' };
  return labels[event?.phase] || (task?.status === 'running' ? 'Preparing' : task?.status || 'Working');
}

function observationDetail(event, fallback, includeLearned = false) {
  if (!event) return fallback;
  const learned = includeLearned && Array.isArray(event.learned) ? event.learned.filter(Boolean).slice(0, 2) : [];
  return [event.detail || event.title, learned.length ? learned.join(' · ') : ''].filter(Boolean).join(' — ');
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
  element.hidden = true;
  element.innerHTML = '';
}

function renderToolbar(entry) {
  const toolbar = $('#repbar');
  if (!entry?.report || entry.status !== 'ready') {
    toolbar.hidden = true;
    toolbar.innerHTML = '';
    return;
  }
  const url = entry.report.public_url || entry.report.url;
  toolbar.hidden = false;
  toolbar.innerHTML = `<div class="addr"><span class="lk">${ICON.lock}</span><span class="u">${escapeHtml(url)}</span></div><div class="acts"><button class="tb" type="button" data-action="copy" title="Copy report link">${ICON.copy}<span>Copy link</span></button><button class="tb ic" type="button" data-action="refresh" title="Refresh report">${ICON.refresh}</button><button class="tb ic" type="button" data-action="external" title="Open in new window">${ICON.external}</button><button class="tb ic" type="button" data-action="fullscreen" title="Fullscreen">${ICON.fullscreen}</button></div>`;
}

function buildLog(task) {
  const events = (ui.state?.events || []).filter((event) => event.task_id === task?.id).slice(0, 4);
  if (!events.length) return '';
  return `<div class="log">${events.map((event) => `<div class="l"><span class="c">${event.status === 'success' ? '✓' : '▸'}</span><span><b>${escapeHtml(event.source === 'remote_mcp' ? phaseLabel(event) : event.operation || 'agent')}</b> ${escapeHtml(observationDetail(event, event.detail || event.title || event.status, true))}</span></div>`).join('')}</div>`;
}

function contentSignature(entry) {
  if (!entry) return 'welcome';
  if (entry.status === 'ready') return `ready:${entry.key}:${entry.report?.url}:${entry.report?.updated_at}`;
  const event = (ui.state?.events || []).find((item) => item.task_id === entry.task?.id);
  const latest = event ? `${event.id}:${event.updated_at || event.created_at}:${event.status}:${event.detail}:${JSON.stringify(event.learned || [])}` : '';
  return `${entry.status}:${entry.key}:${entry.task?.updated_at}:${latest}`;
}

function renderContent(entry, force = false) {
  const signature = contentSignature(entry);
  if (!force && ui.contentSignature === signature) return;
  ui.contentSignature = signature;
  const content = $('#content');
  if (!entry) {
    content.innerHTML = '<div class="welcome"><div class="m"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></div><h2>Tell an agent to create a Cosmise Streamboard</h2></div>';
    return;
  }
  if (entry.status === 'ready' && entry.report) {
    const frameUrl = entry.report.url || entry.report.public_url;
    content.innerHTML = `<article class="report-view"><header class="report-mast"><div><div class="report-title">${escapeHtml(entry.title)}</div><div class="report-sub">${escapeHtml(entry.report.organisation || entry.report.public_url || frameUrl)}</div></div><span class="live"><i></i>Live</span></header><div class="frame-wrap"><div class="frame-loading"><i></i>Loading Streamboard</div><iframe id="report-frame" src="${escapeHtml(frameUrl)}" title="${escapeHtml(entry.title)}" referrerpolicy="no-referrer"></iframe></div></article>`;
    $('#report-frame').addEventListener('load', () => $('.frame-wrap')?.classList.add('loaded'), { once: true });
    return;
  }
  const task = entry.task || {};
  const value = progress(task);
  const operation = taskOperation(task);
  const liveDetail = observationDetail(operation, task.detail || 'Composing your Streamboard…');
  const failed = entry.status === 'failed';
  const queued = entry.status === 'queued';
  content.innerHTML = `<div class="empty"><div class="m"><img src="/assets/cosmise-mascot.png" alt="">${queued || failed ? '' : '<span class="spin"></span>'}</div><h2>${failed ? 'Report build needs attention' : 'Report not built yet'}</h2><p>${failed ? escapeHtml(task.detail || 'The coding agent could not complete this Streamboard.') : queued ? 'This Streamboard is queued. The coding agent will start composing it shortly.' : 'The coding agent is composing this Streamboard right now. It’ll render here the moment every widget is verified.'}</p><div class="st ${entry.status}"><span class="d"></span>${failed ? 'Build failed' : queued ? 'Queued' : `Building now · ${escapeHtml(liveDetail)}${value.total ? ` · ${value.current} / ${value.total} widgets` : ''}`}</div>${!failed && !queued && value.total ? `<div class="pbar"><progress max="${value.total}" value="${value.current}">${value.percent}%</progress></div>` : ''}${buildLog(task)}</div>`;
}

function render(forceContent = false) {
  ui.entries = buildEntries();
  reconcileTabs();
  const entry = activeEntry();
  renderRail();
  renderTabs();
  renderAgent();
  renderToolbar(entry);
  renderContent(entry, forceContent);
}

function openEntry(id) {
  if (!ui.entries.some((entry) => entry.key === id)) return;
  if (!ui.open.includes(id)) ui.open.push(id);
  ui.active = id;
  ui.contentSignature = null;
  render();
}

function closeEntry(id) {
  const index = ui.open.indexOf(id);
  if (index < 0) return;
  ui.open.splice(index, 1);
  if (ui.active === id) ui.active = ui.open[Math.max(0, index - 1)] || ui.open[0] || null;
  ui.contentSignature = null;
  render();
}

function currentUrl() {
  const entry = activeEntry();
  return entry?.report?.public_url || entry?.report?.url || null;
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

async function load() {
  const response = await api('/api/state');
  ui.state = response.data;
  render(true);
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
    else if (action === 'open' || action === 'tab') openEntry(id);
    else if (action === 'close') { event.stopPropagation(); closeEntry(id); }
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
    openEntry(ui.open[(index + delta + ui.open.length) % ui.open.length]);
    document.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  }
});

load().then(connectEvents).catch((error) => {
  $('#content').innerHTML = `<div class="problem"><h2>Streamboards could not load</h2><p>${escapeHtml(error.message)}</p><button class="retry" type="button" data-action="retry-load">Try again</button></div>`;
  $('#repbar').hidden = true;
});