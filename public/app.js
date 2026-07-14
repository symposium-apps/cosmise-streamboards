'use strict';

const ui = { state: null, docs: null };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.add('hidden'), 2200);
}

function statusClass(status) {
  return {
    success: 'bg-emerald-500',
    ready: 'bg-emerald-500',
    running: 'bg-blue-500 animate-pulse',
    checking: 'bg-blue-500 animate-pulse',
    queued: 'bg-neutral-400',
    waiting: 'bg-amber-500',
    warning: 'bg-amber-500',
    missing_key: 'bg-amber-500',
    failed: 'bg-red-500',
    error: 'bg-red-500',
    cancelled: 'bg-neutral-400',
    info: 'bg-violet-500'
  }[status] || 'bg-neutral-400';
}

function timeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '—';
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function renderConnection() {
  const connection = ui.state?.connection || {};
  const state = connection.state || 'missing_key';
  const ready = state === 'ready' || state === 'working';
  const checking = state === 'checking';
  const failed = state === 'error';
  const title = ready ? (state === 'working' ? 'Agent is using MCP' : 'Production access ready') : checking ? 'Checking production access' : failed ? 'Connection failed' : 'MCP key required';
  $('#production-dot').className = `dot ${statusClass(state)}`;
  $('#production-title').textContent = title;
  $('#production-message').textContent = connection.message || (ready ? 'Production Streamboards MCP is available to the agent.' : 'The agent needs a production MCP key before it can build reports.');

  const mode = $('#production-mode');
  mode.classList.toggle('hidden', !connection.mode);
  mode.textContent = connection.mode === 'read_write' ? 'read + write' : connection.mode || '';
  const organisation = connection.organisation?.name || connection.organisation?.id || '';
  const org = $('#production-org');
  org.classList.toggle('hidden', !organisation);
  org.textContent = organisation;

  const tasks = ui.state?.tasks || [];
  const active = tasks.filter((task) => ['queued', 'running', 'waiting'].includes(task.status));
  $('#active-count').textContent = `${active.length} active ${active.length === 1 ? 'task' : 'tasks'}`;
  $('#agent-dot').className = `dot ${active.length ? 'bg-blue-500 animate-pulse' : 'bg-neutral-400'}`;
  $('#agent-title').textContent = active.length ? 'Working' : 'Idle';
  $('#agent-message').textContent = active[0]?.detail || active[0]?.title || 'Waiting for report work.';
}

function renderReports() {
  const reports = ui.state?.reports || [];
  $('#report-count').textContent = reports.length;
  const container = $('#report-list');
  if (!reports.length) {
    container.innerHTML = `<div class="panel p-10 text-center md:col-span-2 xl:col-span-3"><img class="mx-auto h-14 w-14 opacity-80" src="/assets/analytics-pill-pair.svg" alt=""><h3 class="mt-4 text-lg font-semibold">No reports yet</h3><p class="mx-auto mt-2 max-w-md text-sm leading-6 text-neutral-500">Ask the coding agent to build a Streamboard. Once it verifies the result, the report and its canonical links will appear here.</p><button class="copy-mcp-empty btn-secondary mt-5">Copy local MCP URL</button></div>`;
    $$('.copy-mcp-empty').forEach((button) => button.addEventListener('click', copyMcp));
    return;
  }
  container.innerHTML = reports.map((report) => {
    const url = report.public_url || report.url;
    const verified = report.verification?.ok !== false && report.verification;
    return `<article class="panel flex min-h-[260px] flex-col overflow-hidden">
      <div class="flex items-start justify-between gap-4 border-b border-line bg-gradient-to-br from-blue-50 via-white to-pink-50 p-5">
        <img class="h-10 w-10" src="/assets/analytics-pill-pair.svg" alt="">
        <span class="pill ${report.status === 'failed' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-white/90 text-emerald-700'}"><span class="dot ${statusClass(report.status)}"></span>${escapeHtml(report.status)}</span>
      </div>
      <div class="flex flex-1 flex-col p-5">
        <p class="text-xs font-bold uppercase tracking-wider text-neutral-400">${escapeHtml(report.organisation || 'Streamboard')}</p>
        <h3 class="mt-1 text-xl font-semibold">${escapeHtml(report.title)}</h3>
        <p class="mt-2 text-sm leading-5 text-neutral-500">${escapeHtml(report.description || (verified ? 'Agent-verified report ready to view.' : 'Report ready to view.'))}</p>
        <div class="mt-4 flex flex-wrap gap-2 text-[10px] font-semibold text-neutral-500">${verified ? '<span class="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">verified</span>' : ''}<span class="rounded-md bg-neutral-100 px-2 py-1">updated ${timeAgo(report.updated_at)}</span></div>
        <div class="mt-auto flex flex-wrap gap-2 pt-5">${url ? `<button class="btn-primary" data-view-report="${escapeHtml(report.id)}">View report</button><a class="btn-secondary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open link</a>` : ''}${report.edit_url ? `<a class="btn-secondary" href="${escapeHtml(report.edit_url)}" target="_blank" rel="noopener noreferrer">Edit</a>` : ''}</div>
      </div>
    </article>`;
  }).join('');
  $$('[data-view-report]').forEach((button) => button.addEventListener('click', () => openReport(button.dataset.viewReport)));
}

function renderTasks() {
  const tasks = ui.state?.tasks || [];
  const container = $('#task-list');
  if (!tasks.length) {
    container.innerHTML = '<p class="rounded-xl border border-dashed border-line p-7 text-center text-sm text-neutral-500">No report tasks yet.</p>';
    return;
  }
  container.innerHTML = tasks.slice(0, 10).map((task) => {
    const total = Number(task.progress?.total || 0);
    const current = Number(task.progress?.current || 0);
    return `<article class="rounded-xl border border-line p-4"><div class="flex items-start gap-3"><span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusClass(task.status)}"></span><div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-3"><h4 class="font-medium">${escapeHtml(task.title)}</h4><span class="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">${escapeHtml(task.status)}</span></div><p class="mt-1 text-xs leading-5 text-neutral-500">${escapeHtml(task.detail || 'Waiting for the next update.')}</p>${total ? `<progress class="task-progress mt-3 block h-1.5 w-full" max="${total}" value="${Math.min(current, total)}">${current} of ${total}</progress><p class="mt-1 text-[10px] text-neutral-400">${current} of ${total}</p>` : ''}</div></div></article>`;
  }).join('');
}

function renderCalls() {
  const calls = (ui.state?.events || []).filter((event) => String(event.operation || '').startsWith('streamboards_'));
  $('#call-total').textContent = `${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`;
  const container = $('#call-list');
  if (!calls.length) {
    container.innerHTML = '<p class="rounded-xl border border-dashed border-line p-7 text-center text-sm leading-6 text-neutral-500">Calls appear after the agent reports sanitized production MCP activity.</p>';
    return;
  }
  container.innerHTML = calls.slice(0, 50).map((event) => `<article class="grid grid-cols-[12px_minmax(0,1fr)_auto] gap-3 rounded-xl px-2 py-3 hover:bg-neutral-50"><span class="mt-1.5 h-2.5 w-2.5 rounded-full ${statusClass(event.status)}"></span><div class="min-w-0"><code class="block truncate font-mono text-xs font-semibold text-ink">${escapeHtml(event.operation)}</code><p class="mt-1 text-xs leading-5 text-neutral-500">${escapeHtml(event.detail || event.status)}</p>${event.resource?.id ? `<p class="mt-1 truncate font-mono text-[10px] text-neutral-400">${escapeHtml(event.resource.id)}</p>` : ''}</div><div class="text-right"><p class="text-[10px] text-neutral-400">${timeAgo(event.created_at)}</p>${event.duration_ms !== null ? `<p class="mt-1 text-[10px] font-semibold text-neutral-500">${escapeHtml(event.duration_ms)}ms</p>` : ''}</div></article>`).join('');
}

function renderActivity() {
  const events = (ui.state?.events || []).filter((event) => !String(event.operation || '').startsWith('streamboards_'));
  const container = $('#activity-list');
  if (!events.length) {
    container.innerHTML = '<p class="rounded-xl border border-dashed border-line p-7 text-center text-sm text-neutral-500 lg:col-span-2">Verification and agent milestones appear here.</p>';
    return;
  }
  container.innerHTML = events.slice(0, 20).map((event) => {
    const checks = event.verification && typeof event.verification === 'object' ? Object.entries(event.verification).filter(([key]) => key !== 'ok').slice(0, 4) : [];
    return `<article class="rounded-xl border border-line p-4"><div class="flex items-start gap-3"><span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusClass(event.status)}"></span><div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-3"><p class="text-sm font-medium">${escapeHtml(event.title)}</p><time class="shrink-0 text-[10px] text-neutral-400">${timeAgo(event.created_at)}</time></div><p class="mt-1 text-xs leading-5 text-neutral-500">${escapeHtml(event.detail || event.operation)}</p>${checks.length ? `<div class="mt-2 flex flex-wrap gap-1">${checks.map(([key, value]) => `<span class="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-600">${escapeHtml(key.replaceAll('_', ' '))}: ${escapeHtml(value)}</span>`).join('')}</div>` : ''}</div></div></article>`;
  }).join('');
}

function renderState() {
  if (!ui.state) return;
  renderConnection();
  renderReports();
  renderTasks();
  renderCalls();
  renderActivity();
}

function openReport(id) {
  const report = ui.state?.reports?.find((item) => item.id === id);
  if (!report) return;
  $('#viewer-title').textContent = report.title;
  $('#viewer-frame').src = report.url || report.public_url;
  $('#viewer-open').href = report.public_url || report.url;
  $('#report-viewer').classList.remove('hidden');
}

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function load() {
  const [state, docs] = await Promise.all([api('/api/state'), api('/api/docs/tools')]);
  ui.state = state.data;
  ui.docs = docs;
  $('#tool-summary').textContent = `${docs.local_tools.length} local tools · ${docs.tool_count} production tools`;
  renderState();
}

function connectEvents() {
  const source = new EventSource('/api/events/stream');
  source.addEventListener('state', (event) => {
    const message = JSON.parse(event.data);
    ui.state = message.state;
    renderState();
  });
  source.onopen = () => {
    $('#local-server-pill').className = 'pill border-emerald-200 bg-emerald-50 text-emerald-700';
    $('#local-server-pill').innerHTML = '<span class="dot bg-emerald-500"></span><span>Local server live</span>';
    $('#activity-live').innerHTML = '<span class="dot bg-emerald-500"></span>Live';
  };
  source.onerror = () => {
    $('#local-server-pill').className = 'pill border-amber-200 bg-amber-50 text-amber-800';
    $('#local-server-pill').innerHTML = '<span class="dot bg-amber-500"></span><span>Reconnecting</span>';
    $('#activity-live').innerHTML = '<span class="dot bg-amber-500"></span>Reconnecting';
  };
}

async function copyMcp() {
  await navigator.clipboard.writeText(`${location.origin}/mcp`);
  toast('Local MCP URL copied');
}

$('#copy-mcp').addEventListener('click', copyMcp);
$('#clear-activity').addEventListener('click', async () => { if (!confirm('Clear local task and activity history?')) return; try { await api('/api/activity?confirm=true', { method: 'DELETE' }); toast('Activity cleared'); } catch (error) { toast(error.message); } });
$('#viewer-close').addEventListener('click', () => { $('#report-viewer').classList.add('hidden'); $('#viewer-frame').src = 'about:blank'; });
$('#report-viewer').addEventListener('click', (event) => { if (event.target.id === 'report-viewer') $('#viewer-close').click(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#report-viewer').classList.contains('hidden')) $('#viewer-close').click(); });

load().then(connectEvents).catch((error) => toast(error.message));
setInterval(() => { if (ui.state) { renderCalls(); renderActivity(); renderReports(); } }, 15000);
