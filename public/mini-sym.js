'use strict';

const root = document.querySelector('#mini-root');
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

function timeAgo(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'now';
  const seconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${Math.max(1, Math.floor(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function render(state, connected = true) {
  const task = (state.tasks || []).find((item) => ['running', 'queued', 'waiting'].includes(item.status));
  const report = (state.reports || [])[0];
  const current = Math.max(0, Number(task?.progress?.current || 0));
  const total = Math.max(0, Number(task?.progress?.total || 0));
  const rawOperation = (state.events || []).find((event) => event.task_id === task?.id && String(event.operation || '').startsWith('streamboards_'))?.operation || task?.status || 'ready';
  const operation = String(rawOperation).replace(/^streamboards_/, '').replaceAll('_', ' ');
  const taskBlock = task
    ? `<div class="mstat"><div class="mt"><span>Agent</span><span class="live"><i></i>${task.status === 'running' ? 'Building' : 'Queued'}</span></div><div class="mn">${escapeHtml(task.title)}</div>${total ? `<div class="mbar"><progress max="${total}" value="${current}">${current} of ${total}</progress></div>` : ''}<div class="mstep">${total ? `${current} / ${total} widgets` : 'Agent working'} · ${escapeHtml(operation)}</div></div>`
    : '';
  const reportUrl = report?.public_url || report?.edit_url || null;
  const reportBlock = report
    ? `<div class="mcur"><div class="ml">Latest report</div><div class="mrn">${escapeHtml(report.title)}</div><div class="mrm">${escapeHtml(report.organisation || 'Streamboard')} · ${report.public_url ? 'ready' : 'private'} · ${timeAgo(report.updated_at)}</div>${reportUrl ? `<a class="mopen" href="${escapeHtml(reportUrl)}" target="_blank" rel="noopener noreferrer">${report.public_url ? 'Open report' : 'Open in Cosmise'} ↗</a>` : ''}</div>`
    : '';
  root.innerHTML = `<div class="mcard"><div class="mbrand"><span class="mlogo"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></span><div><div class="eye2">Cosmise</div><div class="nm2">Streamboards</div></div></div>${taskBlock}${reportBlock}</div>`;
}

async function start() {
  const response = await fetch('/api/state', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`State request failed (${response.status})`);
  const body = await response.json();
  let state = body.data;
  render(state);
  const source = new EventSource('/api/events/stream');
  source.addEventListener('state', (event) => {
    state = JSON.parse(event.data).state;
    render(state, true);
  });
  source.onerror = () => render(state, false);
  setInterval(async () => {
    if (source.readyState === EventSource.OPEN) return;
    try {
      const next = await fetch('/api/state', { headers: { accept: 'application/json' } });
      if (!next.ok) return;
      state = (await next.json()).data;
      render(state, false);
    } catch (_) {
      // EventSource reconnects automatically; polling keeps stale mini views honest.
    }
  }, 2000);
}

start().catch((error) => {
  root.innerHTML = `<div class="mcard"><div class="mbrand"><span class="mlogo"><img src="/assets/cosmise-mascot.png" alt="Cosmise"></span><div><div class="eye2">Cosmise</div><div class="nm2">Streamboards</div></div></div><div class="mempty">${escapeHtml(error.message)}</div></div>`;
});
