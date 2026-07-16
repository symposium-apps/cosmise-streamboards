# Cosmise Streamboards

A profile-scoped Symposium app with one backend MCP for real Cosmise Streamboards work and realtime local visibility.

## Architecture

The app backend receives `COSMISE_MCP_TOKEN` from the managed profile integration. Its private `/mcp` endpoint:

- discovers every credential-allowed production `streamboards_*` tool from `https://cosmise.com/api/mcp`;
- forwards production calls without exposing the credential;
- emits sanitized running/success/failure state around every call;
- exposes local `cosmise_app_*` task, report, verification and layout tools;
- synchronizes safe organization report metadata at startup and periodically.

The browser never receives the MCP credential or raw production responses. It reads bounded local JSON, receives immediate SSE updates, and reconciles state every two seconds.

## Configuration

Backend credential:

```text
COSMISE_MCP_TOKEN
```

SYM-Node may inject it as an app secret. On managed workers, the backend can also import only that named value from the owning profile's private managed environment; it never imports unrelated profile secrets.

Optional environment:

```text
COSMISE_MCP_URL=https://cosmise.com/api/mcp
COSMISE_REPORT_SYNC_MS=60000
```

The token must stay in the trusted app backend environment. Never put it in source, browser code, `.sym-data`, task/activity/report payloads, templates, logs, documentation or chat.

## Private backend surfaces

These require a matching Bearer credential:

- `POST /mcp` — combined wrapped production and local MCP;
- `GET /api/cosmise/tools` — wrapped Streamboards tool schemas;
- `POST /api/cosmise/tools/:tool` — custom backend wrapper for each `streamboards_*` tool;
- `POST /api/cosmise/sync` — synchronize safe report metadata;
- all local write endpoints.

Public read-only surfaces:

- `GET /_sym/health`
- `GET /api/health`
- `GET /api/state`
- `GET /api/status`
- `GET /api/tasks`
- `GET /api/activity` — latest 10 events
- `GET /api/reports`
- `GET /api/events/stream`
- `GET /api/templates`

## State and reports

- `.sym-data/state.json` is written atomically.
- Retention is capped at 100 tasks, 100 events and 100 reports.
- SSE provides immediate updates; `/api/state` polling every two seconds repairs missed events.
- Only `public_url` is embedded.
- `edit_url` opens externally in authenticated Cosmise.
- Private reports stay listed but are not embedded.
- Protected reports require short-lived embed access.

## Layouts and metrics

The app bundles 47 sanitized structural layout examples in `data/layout-templates.json`. Agents must still use the live query catalog and wrapped tool schemas as authority for metrics, formulas, widgets and connected platforms.

## Local start

Provide the backend credential through the environment, then start normally:

```bash
npm install
npm run css
npm start
```

SYM-Node supplies `HOST`, `PORT`, profile identity, and managed secrets in production.

See `AGENTS.md` and `docs/AGENT.md` for the coding-agent contract.
