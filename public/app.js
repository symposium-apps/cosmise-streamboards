'use strict';

const ui = {
  state: null,
  docs: null,
  templates: null,
  page: 'home',
  category: 'All',
  search: '',
  templateSearch: ''
};

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
    running: 'bg-blue-500 animate-pulse',
    queued: 'bg-neutral-400',
    waiting: 'bg-amber-500',
    warning: 'bg-amber-500',
    failed: 'bg-red-500',
    cancelled: 'bg-neutral-400',
    info: 'bg-violet-500'
  }[status] || 'bg-neutral-400';
}

function timeAgo(value) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

function setPage(page) {
  ui.page = page;
  $$('[data-section]').forEach((node) => node.classList.toggle('hidden', node.dataset.section !== page));
  $$('[data-page]').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
  if (page === 'docs') renderTools();
  if (page === 'templates') renderTemplates();
}

function renderConnection() {
  const connection = ui.state?.connection || {};
  const ready = connection.state === 'ready' || connection.state === 'agent_ready';
  const working = connection.state === 'working';
  const failed = connection.state === 'error';
  const pill = $('#connection-pill');
  pill.className = `pill ${ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : failed ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`;
  pill.innerHTML = `<span class="dot ${ready ? 'bg-emerald-500' : failed ? 'bg-red-500' : working ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'}"></span><span>${escapeHtml(connection.state === 'agent_ready' ? 'Agent channel ready' : ready ? 'Production verified' : working ? 'Agent working' : failed ? 'Agent reported an error' : 'Waiting for agent')}</span>`;
  $('#integration-state').className = `dot ${ready ? 'bg-emerald-500' : failed ? 'bg-red-500' : 'bg-amber-500'}`;
  $('#org-name').textContent = connection.organisation?.name || connection.organisation?.id || 'Architects of Skin';
  $('#connection-message').textContent = connection.message || 'The local app is ready to receive sanitized progress from an authorised agent.';
  $('#profile-id').textContent = ui.state?.profile_id || 'local';
}

function renderTasks() {
  const tasks = ui.state?.tasks || [];
  const active = tasks.filter((task) => ['queued', 'running', 'waiting'].includes(task.status));
  $('#active-count').textContent = active.length;
  const container = $('#task-list');
  if (!tasks.length) {
    container.innerHTML = '<p class="rounded-xl border border-dashed border-line p-6 text-center text-sm text-neutral-500">No tasks yet. Run the demo or let Hermes start one.</p>';
    return;
  }
  container.innerHTML = tasks.slice(0, 8).map((task) => {
    const total = Number(task.progress?.total || 0);
    const current = Number(task.progress?.current || 0);
    return `<article class="rounded-xl border border-line p-4">
      <div class="flex items-start gap-3"><span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusClass(task.status)}"></span><div class="min-w-0 flex-1"><div class="flex items-start justify-between gap-3"><h4 class="font-medium">${escapeHtml(task.title)}</h4><span class="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">${escapeHtml(task.status)}</span></div><p class="mt-1 text-xs leading-5 text-neutral-500">${escapeHtml(task.detail || 'Waiting for the next update.')}</p>${total ? `<progress class="task-progress mt-3 block h-1.5 w-full" max="${total}" value="${Math.min(current, total)}">${current} of ${total}</progress><p class="mt-1 text-[10px] text-neutral-400">${current} of ${total}</p>` : ''}</div></div>
    </article>`;
  }).join('');
}

function renderActivity() {
  const events = ui.state?.events || [];
  const container = $('#activity-list');
  if (!events.length) {
    container.innerHTML = '<p class="rounded-xl border border-dashed border-line p-6 text-center text-sm text-neutral-500">Activity appears here as the agent works.</p>';
    return;
  }
  container.innerHTML = events.slice(0, 60).map((event) => {
    const checks = event.verification && typeof event.verification === 'object'
      ? Object.entries(event.verification).filter(([key]) => key !== 'ok').slice(0, 5)
      : [];
    return `<article class="group grid grid-cols-[18px_minmax(0,1fr)_auto] gap-3 rounded-xl px-2 py-3 hover:bg-neutral-50"><div class="relative flex justify-center"><span class="mt-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${statusClass(event.status)}"></span></div><div class="min-w-0"><p class="text-sm font-medium">${escapeHtml(event.title)}</p><p class="mt-0.5 text-xs leading-5 text-neutral-500">${escapeHtml(event.detail || event.operation)}</p>${checks.length ? `<div class="mt-2 flex flex-wrap gap-1">${checks.map(([key, value]) => `<span class="rounded-md bg-neutral-100 px-2 py-1 text-[10px] font-medium text-neutral-600">${escapeHtml(key.replaceAll('_', ' '))}: ${escapeHtml(value)}</span>`).join('')}</div>` : ''}</div><time class="text-[10px] text-neutral-400">${timeAgo(event.created_at)}</time></article>`;
  }).join('');
}

function renderReports() {
  const reports = ui.state?.reports || [];
  $('#report-count').textContent = reports.length;
  const container = $('#report-list');
  if (!reports.length) {
    container.innerHTML = '<div class="panel p-8 text-center text-sm text-neutral-500 md:col-span-2">No reports are visible yet. Hermes can add one with <code>cosmise_app_show_report</code>.</div>';
    return;
  }
  container.innerHTML = reports.map((report) => `<article class="panel overflow-hidden"><div class="h-36 bg-gradient-to-br from-mint via-white to-neutral-100 p-5"><span class="pill border-emerald-200 bg-white/80 text-moss"><span class="dot bg-emerald-500"></span>${escapeHtml(report.status)}</span></div><div class="p-5"><p class="text-xs font-bold uppercase tracking-wider text-neutral-400">Streamboard</p><h3 class="mt-1 text-xl font-semibold">${escapeHtml(report.title)}</h3><p class="mt-2 truncate font-mono text-[11px] text-neutral-400">${escapeHtml(report.streamboard_id || report.id)}</p><div class="mt-5 flex gap-2"><button class="btn-primary" data-view-report="${escapeHtml(report.id)}">View report</button><a class="btn-secondary" href="${escapeHtml(report.public_url || report.url)}" target="_blank" rel="noopener noreferrer">Open link</a></div></div></article>`).join('');
  $$('[data-view-report]').forEach((button) => button.addEventListener('click', () => openReport(button.dataset.viewReport)));
}

function renderState() {
  if (!ui.state) return;
  renderConnection();
  renderTasks();
  renderActivity();
  renderReports();
}

function renderTools() {
  if (!ui.docs) return;
  const categories = ['All', ...new Set(ui.docs.tools.map((tool) => tool.category))];
  $('#docs-remote-count').textContent = ui.docs.tool_count;
  $('#docs-local-count').textContent = ui.docs.local_tools.length;
  $('#tool-count').textContent = ui.docs.tool_count;
  $('#tool-total-side').textContent = `${ui.docs.tool_count} Streamboards + ${ui.docs.local_tools.length} local tools`;
  $('#category-filters').innerHTML = categories.map((category) => `<button class="rounded-full border px-3 py-1.5 text-xs font-semibold ${ui.category === category ? 'border-ink bg-ink text-white' : 'border-line bg-white text-neutral-500'}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
  $$('[data-category]').forEach((button) => button.addEventListener('click', () => { ui.category = button.dataset.category; renderTools(); }));
  const query = ui.search.toLowerCase();
  const tools = ui.docs.tools.filter((tool) => (ui.category === 'All' || tool.category === ui.category) && (!query || `${tool.name} ${tool.description}`.toLowerCase().includes(query)));
  $('#tool-list').innerHTML = tools.length ? tools.map((tool) => `<article class="py-4"><div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><code class="font-mono text-xs font-semibold text-moss">${escapeHtml(tool.name)}</code><span class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tool.mode === 'write' ? 'bg-amber-100 text-amber-800' : 'bg-neutral-100 text-neutral-600'}">${tool.mode}</span>${tool.supports_dry_run ? '<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-700">dry run</span>' : ''}</div><p class="mt-2 text-sm leading-6 text-neutral-600">${escapeHtml(tool.description)}</p>${tool.verify_with?.length ? `<p class="mt-2 text-xs text-neutral-400">Verify with: ${tool.verify_with.map((item) => `<code>${escapeHtml(item)}</code>`).join(' · ')}</p>` : ''}</div><span class="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">${escapeHtml(tool.category)}</span></div></article>`).join('') : '<p class="py-10 text-center text-sm text-neutral-500">No tools match that search.</p>';
}

function renderTemplates() {
  if (!ui.templates) return;
  const summary = ui.templates.catalog_summary || {};
  $('#template-report-count').textContent = summary.source_reports_reviewed ?? '—';
  $('#template-widget-count').textContent = summary.sanitized_widget_examples ?? '—';
  $('#template-layout-count').textContent = summary.unique_layouts ?? '—';
  const query = ui.templateSearch.toLowerCase();
  const templates = (ui.templates.templates || []).filter((template) => !query || template.widgets.some((widget) => `${widget.widget_type} ${widget.family}`.toLowerCase().includes(query)));
  const container = $('#template-list');
  container.innerHTML = templates.length ? templates.map((template) => {
    const rows = Math.max(1, template.canvas_rows);
    const types = [...new Set(template.widgets.map((widget) => widget.widget_type))];
    const diagram = template.widgets.map((widget) => `<rect x="${widget.layout.x}" y="${widget.layout.y}" width="${widget.layout.w}" height="${widget.layout.h}" rx="0.7" class="${widget.family === 'static' ? 'fill-emerald-100 stroke-emerald-400' : 'fill-blue-100 stroke-blue-400'}"><title>${escapeHtml(widget.slot)} · ${escapeHtml(widget.widget_type)} · x${widget.layout.x} y${widget.layout.y} w${widget.layout.w} h${widget.layout.h}</title></rect>`).join('');
    return `<article class="overflow-hidden rounded-xl border border-line"><div class="border-b border-line bg-neutral-50 p-4"><div class="flex items-start justify-between gap-3"><div><p class="font-mono text-[11px] font-semibold text-moss">${escapeHtml(template.id)}</p><h4 class="mt-1 font-semibold">${template.widget_count} widgets · ${rows} rows</h4></div><span class="pill border-neutral-200 bg-white text-neutral-600">example</span></div><div class="mt-3 flex flex-wrap gap-1">${types.slice(0, 8).map((type) => `<span class="rounded-md bg-white px-2 py-1 text-[10px] text-neutral-600">${escapeHtml(type)}</span>`).join('')}${types.length > 8 ? `<span class="rounded-md bg-white px-2 py-1 text-[10px] text-neutral-400">+${types.length - 8}</span>` : ''}</div></div><div class="p-4"><svg class="h-64 w-full" viewBox="0 0 48 ${rows}" preserveAspectRatio="none" role="img" aria-label="Sanitized 48-column widget layout">${diagram}</svg><p class="mt-3 text-[11px] text-neutral-400">Versioned app template · structural hash ${escapeHtml(template.structural_hash)}</p></div></article>`;
  }).join('') : '<div class="p-8 text-center text-sm text-neutral-500 xl:col-span-2">No layout contains that widget type.</div>';
}

function openReport(id) {
  const report = ui.state?.reports?.find((item) => item.id === id);
  if (!report) return;
  $('#viewer-title').textContent = report.title;
  $('#viewer-frame').src = report.url;
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
  const [state, docs, templates] = await Promise.all([api('/api/state'), api('/api/docs/tools'), api('/api/templates')]);
  ui.state = state.data;
  ui.docs = docs;
  ui.templates = templates.data;
  renderState();
  renderTools();
  renderTemplates();
}

function connectEvents() {
  const source = new EventSource('/api/events/stream');
  source.addEventListener('state', (event) => {
    const message = JSON.parse(event.data);
    ui.state = message.state;
    renderState();
  });
  source.onopen = () => { $('#live-pill').innerHTML = '<span class="dot bg-emerald-500"></span>Live'; };
  source.onerror = () => { $('#live-pill').innerHTML = '<span class="dot bg-amber-500"></span>Reconnecting'; };
}

$$('[data-page]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
$$('[data-go]').forEach((button) => button.addEventListener('click', () => setPage(button.dataset.go)));
$('#tool-search').addEventListener('input', (event) => { ui.search = event.target.value; renderTools(); });
$('#template-search').addEventListener('input', (event) => { ui.templateSearch = event.target.value; renderTemplates(); });
$('#run-demo').addEventListener('click', async () => { try { await api('/api/demo', { method: 'POST', body: '{}' }); toast('Realtime demo started'); } catch (error) { toast(error.message); } });
$('#clear-activity').addEventListener('click', async () => { if (!confirm('Clear local activity history?')) return; try { await api('/api/activity?confirm=true', { method: 'DELETE' }); toast('Activity cleared'); } catch (error) { toast(error.message); } });
$('#copy-mcp').addEventListener('click', async () => { await navigator.clipboard.writeText(`${location.origin}/mcp`); toast('MCP URL copied'); });
$('#viewer-close').addEventListener('click', () => { $('#report-viewer').classList.add('hidden'); $('#viewer-frame').src = 'about:blank'; });
$('#report-viewer').addEventListener('click', (event) => { if (event.target.id === 'report-viewer') $('#viewer-close').click(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#report-viewer').classList.contains('hidden')) $('#viewer-close').click(); });

load().then(connectEvents).catch((error) => toast(error.message));
setInterval(() => { if (ui.state) renderActivity(); }, 15000);
