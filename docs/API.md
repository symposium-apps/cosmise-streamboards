# Backend API and wrapped MCP

The managed SYM app URL serves a browser-safe read surface and a private backend control surface. JSON bodies are limited to 256 KiB.

## Authentication

Private endpoints require:

```text
Authorization: Bearer <COSMISE_MCP_TOKEN>
```

The token is read from the app backend environment, forwarded only to `https://cosmise.com/api/mcp`, and never returned or persisted.

## Public read-only endpoints

- `GET /_sym/health` — runtime health and boolean backend readiness.
- `GET /api/health` — safe service/tool counts.
- `GET /api/state` — complete bounded browser-safe state.
- `GET /api/status` — safe connection state.
- `GET /api/tasks` — at most 100 tasks.
- `GET /api/activity` — latest 10 of at most 100 persisted events.
- `GET /api/reports` — at most 100 synchronized reports.
- `GET /api/events/stream` — immediate SSE state snapshots.
- `GET /api/templates` and `/api/templates/:id` — sanitized structural layouts.

The browser also reconciles `/api/state` every two seconds.

## Private local writes

Bearer authentication is required for:

- `PATCH /api/status`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `POST/DELETE /api/activity`
- `POST/DELETE /api/reports`
- `POST /api/agent/calls`

Only `public_url` is embeddable. `edit_url` opens externally. URLs must use HTTPS on `cosmise.com` or its subdomains.

## Custom Cosmise backend wrapper

### `GET /api/cosmise/tools`

Returns every credential-allowed wrapped `streamboards_*` tool and its live input schema.

### `POST /api/cosmise/tools/:tool`

Calls one wrapped Streamboards tool with the JSON body as arguments. The backend automatically:

1. creates or reuses a visible task;
2. records a sanitized running event;
3. forwards the call to production Cosmise MCP;
4. records success/failure and duration;
5. reconciles safe report metadata when present;
6. returns the real MCP result.

Raw arguments and responses are not persisted in local state.

### `POST /api/cosmise/sync`

Synchronizes organization context and up to 100 Streamboards into local report state. Canonical URLs are resolved for the latest 10 reports during each sync.

## Combined wrapped MCP

### `POST /mcp`

This is the single MCP endpoint for agents. It combines:

- every credential-allowed production `streamboards_*` tool;
- local `cosmise_app_*` task, state, report, verification and layout tools.

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

Tool call:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "streamboards_list",
    "arguments": { "limit": 100 }
  }
}
```

Agents should use this wrapper rather than a separate direct production Cosmise MCP server so realtime status cannot be bypassed.

## State retention

`.sym-data/state.json` is written atomically and capped at:

- 100 tasks;
- 100 activity events;
- 100 reports.

Active state is delivered immediately through SSE and repaired through two-second polling.
