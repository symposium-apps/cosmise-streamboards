# Local API and MCP

Base URL is the managed SYM app URL. For local development it defaults to `http://127.0.0.1:4322`.

All JSON bodies are limited to 256 KiB. Secret values are never accepted by these endpoints.

## Response envelope

Local HTTP APIs return:

```json
{
  "ok": true,
  "data": {},
  "receipt": {
    "action": "update_task",
    "changed": true,
    "verification": null,
    "at": "2026-07-13T00:00:00.000Z"
  }
}
```

Failures return an HTTP 4xx response:

```json
{
  "ok": false,
  "error": "Human-readable explanation"
}
```

## Health and state

### `GET /_sym/health`
Managed-runtime health endpoint.

### `GET /api/health`
Returns app status, the `agent_only` credential boundary, and documented production/local tool counts. The app has no production credential.

### `GET /api/state`
Returns the complete browser-safe state: profile ID, connection status, tasks, activity, and reports.

### `GET /api/status`
Returns only connection status.

### `PATCH /api/status`
Agent status display update. Accepted states are `missing_key`, `checking`, `ready`, `working`, and `error`; safe fields include `mode`, `organisation`, `endpoint`, `message`, and `last_checked_at`. Do not pass credentials.

## Tasks

### `POST /api/tasks`

```json
{
  "id": "monthly-report",
  "title": "Build monthly report",
  "detail": "Checking connected platforms.",
  "status": "running",
  "progress": { "current": 1, "total": 8 }
}
```

### `PATCH /api/tasks/:id`
Updates title, detail, status, progress, or resource. Terminal statuses set `completed_at`.

### `GET /api/tasks`
Lists newest tasks first.

## Activity

### `POST /api/activity`

```json
{
  "task_id": "monthly-report",
  "status": "success",
  "operation": "streamboards_validate",
  "title": "Report structure verified",
  "detail": "Layout and endpoint checks passed.",
  "verification": {
    "ok": true,
    "layout_ok": true,
    "endpoint_ok": true,
    "cache_errors": 0
  }
}
```

### `GET /api/activity`
Lists newest events first.

### `DELETE /api/activity?confirm=true`
Clears local task and event history. Reports remain.

## Realtime stream

### `GET /api/events/stream`
Server-Sent Events endpoint. Event name is `state`; each event contains the complete browser-safe state so reconnecting clients can reconcile without replay gaps.

```text
event: state
data: {"type":"event","at":"...","state":{...}}
```

A heartbeat comment is sent every 20 seconds.

## Reports

### `POST /api/reports`

```json
{
  "streamboard_id": "board_123",
  "title": "Monthly Performance",
  "description": "Monthly acquisition and revenue performance.",
  "organisation": "Example organisation",
  "url": "https://cosmise.com/board/example/monthly-performance",
  "public_url": "https://cosmise.com/board/example/monthly-performance",
  "edit_url": "https://cosmise.com/dashboard/streamboards/board_123",
  "verification": {
    "ok": true,
    "publication_ok": true,
    "layout_ok": true,
    "cache_errors": 0
  }
}
```

Only HTTPS `cosmise.com` URLs and subdomains are accepted. This prevents the app from becoming an arbitrary URL/iframe launcher.

### `GET /api/reports`
Lists reports visible in the app.

### `DELETE /api/reports/:id`
Removes a local report card/viewer entry. It does not delete the remote Streamboard.

## Documentation

### `GET /api/docs/tools`
Returns the generated 78-tool documentation catalog and local communication tools. This is an agent endpoint, not a dashboard page. The agent should query its production MCP connection for authoritative live schemas.

### `GET /api/templates`
Returns the versioned template examples bundled in `data/layout-templates.json`. Optional query parameters: `widget_type` (comma-separated), `min_widgets`, `max_widgets`, and `limit` (maximum 100). Each template includes neutral widget slots, exact `x/y/w/h` geometry, safe widget/query families, and generic display configuration.

### `GET /api/templates/:id`
Returns one complete bundled layout example and the rules the agent must follow while adapting it. Templates are app files and change only when a new app version adds or edits them. There is no runtime import/write endpoint.

## Local MCP

### `POST /mcp`
JSON-RPC endpoint compatible with MCP operations:

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
    "name": "cosmise_app_show_message",
    "arguments": {
      "status": "running",
      "title": "Refreshing report data",
      "detail": "Waiting for three Streamboards widgets."
    }
  }
}
```

This endpoint accepts only `cosmise_app_*` communication tools. It rejects `streamboards_*` calls because production credentials and operations belong to the agent profile's separate MCP connection.
