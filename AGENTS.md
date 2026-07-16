# Coding-agent entry point

This repository is the local Cosmise Streamboards visibility app. A Streamboards request always involves **two separate APIs**:

1. The profile-scoped production Cosmise MCP at `https://cosmise.com/api/mcp` reads connected organisation data and creates, refreshes, validates and publishes real Streamboards.
2. This app's local `/mcp` and `/api/*` endpoints store visible tasks, sanitized realtime activity, verification and report links. Production calls do not reach it automatically.

## Required first actions

1. Read `docs/AGENT.md`.
2. Call local `cosmise_app_get_bootstrap` (or `GET /api/agent/bootstrap`).
3. Call `cosmise_app_start_task` immediately so the existing UI shows active work.
4. Verify that the separate production profile exposes `streamboards_get_context`.

## Missing production access

The production credential belongs to the coding-agent profile, never this app.

- Preferred: connect the profile's **Cosmise** integration. SYM-Node stores the credential as `COSMISE_MCP_TOKEN` in the private profile gateway environment and configures `mcp_servers.cosmise`.
- Manual recovery: call `cosmise_app_update_connection` with `state: "missing_key"`, then ask the operator or trusted coding-agent host to provide the approved credential **file path**. Never ask them to paste the key into chat.
- Import it into `COSMISE_MCP_TOKEN` in `~/.hermes/profiles/<active-profile>/.env`, ensure the same profile's `config.yaml` points `mcp_servers.cosmise` to `https://cosmise.com/api/mcp`, then reload MCP tools or restart the coding-agent session.
- Never put the key in this repository, the app process, `.sym-data`, browser code, local task/activity payloads, reports, templates or documentation.

If production tools remain unavailable, leave the task in `waiting`, keep the UI connection state at `missing_key`, explain the required operator action, and stop before production work.

## Required build loop

1. `cosmise_app_start_task`.
2. Report production connection state with `cosmise_app_update_connection`.
3. Discover production context, capabilities, connections and query catalog.
4. Inspect existing boards/branding plus both layout sources:
   - `cosmise_app_list_layout_templates` for bundled sanitized real-report examples;
   - `streamboards_list_templates` for available live templates.
5. Before every meaningful production call, send `cosmise_app_observe_call` with `status: "running"`.
6. Make the real production call.
7. Update the same `call_id` to `success` or `failed` with safe, human-readable facts.
8. Continue task progress updates while creating the board, widgets and exact 48-column layout.
9. Validate, dry-run refresh, execute refresh, poll cache status to terminal and inspect rendered usefulness.
10. Call `cosmise_app_show_verification`, `cosmise_app_show_report`, then `cosmise_app_complete_task`.

## Layout and metric rules

- Review two or three relevant existing layout examples before choosing a composition. Map neutral slots to newly created widget IDs; never copy client identifiers, names, values or prose.
- `streamboards_list_query_catalog` and live tool schemas are authoritative.
- Use fixed query widgets only for catalogued keys.
- Use master metric widgets only for supported platform/metric/display combinations.
- Formula widgets require catalogued tokens, available inputs, safe divide-by-zero behavior, clear units and honest labels. Blended efficiency is not attributed ROAS.
- Refresh and inspect every dynamic widget. Remove or hide empty, unavailable or misleading widgets unless an explicit meaningful zero-state was requested.

## Realtime and security

The browser receives immediate local state over SSE and periodically polls `/api/state` as a fallback. Neither transport can infer production calls: paired local observations are mandatory.

Never send credentials, authorization headers, raw arguments, raw API responses, account/customer/property IDs, production connection details or secret-bearing errors to the local app. Keep activity concise and understandable to a non-technical viewer. Do not redesign the status UI.
