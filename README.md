# Cosmise Streamboards

A local-first Symposium app that makes agent-driven Streamboards work visible.

## What it does

- keeps the canonical 78-tool Streamboards MCP catalog in agent-readable documentation;
- provides one local JSON-RPC MCP endpoint containing app communication tools plus all 78 production Streamboards tools;
- loads the profile-scoped `COSMISE_MCP_TOKEN` into the trusted backend only;
- wraps every production call with automatic sanitized realtime activity;
- gives connected agents one machine-readable bootstrap covering production credential setup, both APIs, layouts, metrics, formulas, realtime state and verification;
- tells connected agents through MCP initialization instructions to run the complete build lifecycle and drive a stable in-view build overlay tied to the active report task;
- gives the coding agent local communication tools for connection readiness, call receipts, tasks, messages, verification, reports, and layout-template selection;
- ships versioned sanitized layout examples as app files;
- streams UI updates over Server-Sent Events and polls local state every two seconds as a resilience fallback;
- persists at most 100 tasks, activity events and reports under `.sym-data/`;
- synchronizes organisation Streamboards and displays canonical public URLs without exposing the credential to the browser.

## Local start

```bash
npm install
npm run css
npm start
```

The server prints local and LAN URLs. SYM-Node supplies its managed host/port at runtime.

## Configuration

The app requires the profile-scoped `cosmise` integration. Its trusted backend reads `COSMISE_MCP_TOKEN` only from the managed app's own process environment and calls `COSMISE_MCP_URL` (default `https://cosmise.com/api/mcp`).

If the app secret is missing, the UI becomes a connection gate. Synchronize Cosmise, run `SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js` from this repository, and restart the managed app. The helper copies only the named credential into the app-specific private secret file without printing it.

When `runtime.backend_mcp_configured` is not `true`, the UI shows a hard connection gate and hides stale report navigation. The coding agent receives the same exact recovery sequence through MCP initialization and `cosmise_app_get_bootstrap`: connect/synchronize Cosmise in Symposium Connections, restart `cosmise-streamboards`, re-read state, call `cosmise_app_sync_now`, and verify `streamboards_get_context` before writing.

## Terminology and metric quality

- The artifact the agent builds is a **Streamboard**.
- The package itself is the **local Streamboards app** or **agent-facing Streamboards app**.
- Inspect the live query catalog before selecting fixed metrics, master custom metrics, or formulas.
- Empty or non-actionable widgets are not layout filler: remove or hide them unless a meaningful zero-state was explicitly requested.
- Use a custom metric or formula only when its inputs are available, the calculation is supported by the live schema/catalog, and the result has a clear business meaning.

## Versioned templates

The layout examples are a feature of the app version and live in:

```text
data/layout-templates.json
```

They are committed app files, not runtime state and not environment-driven config. Keep adding new sanitized patterns there as the app improves.

Current bundled library:

- 47 unique structural layouts
- 49 source reports reviewed
- 834 sanitized widget examples

Allowed template data:

- widget family/type;
- neutral slot names;
- 48-column `x/y/w/h` geometry;
- hidden state;
- safe display/content field names;
- structural hash/dedup metadata.

Forbidden template data:

- client/company names;
- report names;
- metric values;
- account/campaign/source IDs;
- URLs;
- query parameters;
- cached data;
- prose/report copy;
- screenshots;
- secrets.

## Endpoints

### App API

- `GET /_sym/health`
- `GET /api/state`
- `GET/PATCH /api/status`
- `GET/POST /api/tasks`
- `PATCH /api/tasks/:id`
- `GET/POST/DELETE /api/activity`
- `GET /api/agent/instructions`
- `GET /api/agent/bootstrap`
- `POST /api/agent/calls`
- `GET/POST /api/reports`
- `GET /api/docs/tools`
- `GET /api/cosmise/tools` (localhost-only catalog of all 78 wrappers)
- `POST /api/cosmise/tools/:exactToolName` (localhost-only exact tool wrapper)
- `POST /api/cosmise/sync` (localhost-only organisation reconciliation)
- `GET /api/templates`
- `GET /api/templates/:id`
- `GET /api/events/stream` (SSE)


### Agent MCP

```text
POST /mcp
```

Supports MCP JSON-RPC `initialize`, `ping`, `tools/list`, and `tools/call`. It exposes 15 local app communication tools and every tool in the canonical 78-tool Streamboards catalog. Calls to `streamboards_*` are forwarded by the backend and automatically record running, success, or failure activity. The MCP endpoint is localhost-only.

## Verification

```bash
npm run check
```

See `docs/AGENT.md` for the complete Hermes operating contract and generated tool reference.

## Repository status

The canonical public repository is `symposium-apps/cosmise-streamboards`. Installations should pull released app code from that repository and keep organisation credentials in the managed SYM profile/app secret store, never in the checkout.
