# Cosmise Streamboards

A local-first Symposium app that makes agent-driven Streamboards work visible.

## What it does

- keeps the canonical 78-tool Streamboards MCP catalog in agent-readable documentation;
- provides a local JSON-RPC MCP endpoint with app communication tools for Hermes;
- keeps production Streamboards credentials and calls inside the authorised agent profile;
- turns sanitized agent updates into realtime activity;
- gives connected agents one machine-readable bootstrap covering production credential setup, both APIs, layouts, metrics, formulas, realtime state and verification;
- tells connected agents through MCP initialization instructions to run the complete build lifecycle and mirror meaningful production calls into the live **Building now** status;
- gives the coding agent local communication tools for connection readiness, call receipts, tasks, messages, verification, reports, and layout-template selection;
- ships versioned sanitized layout examples as app files;
- streams UI updates over Server-Sent Events and polls local state every five seconds as a resilience fallback;
- persists local activity under `.sym-data/`;
- displays canonical Cosmise report URLs without receiving a production MCP credential.

## Local start

```bash
npm install
npm run css
npm start
```

The server prints local and LAN URLs. SYM-Node supplies its managed host/port at runtime.

## Configuration

The app has no environment or secret configuration. It does not accept, read, store, or proxy a production MCP credential. Its manifest requests the profile-scoped `cosmise` integration.

The authorised agent profile owns its production Streamboards MCP connection at `https://cosmise.com/api/mcp`. The preferred setup stores `COSMISE_MCP_TOKEN` in the private profile gateway environment. If it is missing, the bootstrap tells the coding agent to report `missing_key`, ask for an approved credential file path or connected integration, and configure the active profile without sending the value to this app. Never put a real credential in this repository, app process, browser code, status payload, activity event, report object, template file, or documentation.

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
- `GET /api/templates`
- `GET /api/templates/:id`
- `GET /api/events/stream` (SSE)


### Agent MCP

```text
POST /mcp
```

Supports MCP JSON-RPC `initialize`, `ping`, `tools/list`, and `tools/call`. It exposes 14 local app communication tools. `cosmise_app_get_bootstrap` is the required entry point and the MCP initialize response includes the complete operating contract. `cosmise_app_observe_call` accepts paired before/after updates that drive the existing **Building now** bar through SSE and polling fallback. The 78 production Streamboards tools remain on the agent's separate production MCP connection; this app receives only sanitized telemetry, never credentials or raw API payloads.

## Verification

```bash
npm run check
```

See `docs/AGENT.md` for the complete Hermes operating contract and generated tool reference.

## Repository status

The canonical public repository is `symposium-apps/cosmise-streamboards`. Installations should pull released app code from that repository and keep organisation credentials in the managed SYM profile/app secret store, never in the checkout.
