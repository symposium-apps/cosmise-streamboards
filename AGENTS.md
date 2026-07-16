# Coding-agent entry point

This repository is the trusted local Cosmise Streamboards backend and visibility app. Its local `/mcp` wraps every canonical `streamboards_*` production tool, calls `https://cosmise.com/api/mcp` with the backend-only profile credential, and records call status automatically. Do not bypass it with a separate production MCP connection.

## Required first actions

1. Read `docs/AGENT.md`.
2. Call local `cosmise_app_get_bootstrap` (or `GET /api/agent/bootstrap`).
3. Call `cosmise_app_get_state` and inspect `runtime.backend_mcp_configured`.
4. If it is not `true`, stop. Tell the operator to open Symposium **Connections**, connect/synchronize Cosmise for this profile, then restart `cosmise-streamboards` with `run_app(action: "restart")`.
5. Read state again, call `cosmise_app_sync_now`, then call local `streamboards_get_context` and verify the credential-derived organisation.
6. Only after the gate passes, call `cosmise_app_start_task` so the UI shows active work.

## Missing production access

The app backend loads `COSMISE_MCP_TOKEN` from its process environment or `/srv/symposium-data/profile-runtime/<profile>/hermes-app-secrets.env`. The missing-key UI is a hard gate: do not use stale reports or attempt production tools while it is visible. Connect the profile's **Cosmise** integration, then restart the app backend. Never ask for, print, log, return, persist, or send the token to browser code, `.sym-data`, tasks, activity, reports, templates, documentation, or chat.

If production tools remain unavailable, leave the task in `waiting`, keep the UI connection state at `missing_key`, explain the required operator action, and stop before production work.

## Required build loop

1. Pass `runtime.backend_mcp_configured=true`, synchronize, and verify `streamboards_get_context`.
2. `cosmise_app_start_task`.
3. Discover production context, capabilities, connections and query catalog through this local MCP.
4. Inspect existing boards/branding plus both layout sources:
   - `cosmise_app_list_layout_templates` for bundled sanitized real-report examples;
   - `streamboards_list_templates` for available live templates.
5. Make every `streamboards_*` call through this wrapper; running/success/failure activity is automatic.
6. Continue task progress updates while creating the board, widgets and exact 48-column layout.
7. Validate, dry-run refresh, execute refresh, poll cache status to terminal and inspect rendered usefulness.
8. Call `cosmise_app_show_verification`, then `cosmise_app_complete_task`. Report discovery and canonical URLs synchronize automatically.

## Layout and metric rules

- Review two or three relevant existing layout examples before choosing a composition. Map neutral slots to newly created widget IDs; never copy client identifiers, names, values or prose.
- `streamboards_list_query_catalog` and live tool schemas are authoritative.
- Use fixed query widgets only for catalogued keys.
- Use master metric widgets only for supported platform/metric/display combinations.
- Formula widgets require catalogued tokens, available inputs, safe divide-by-zero behavior, clear units and honest labels. Blended efficiency is not attributed ROAS.
- Refresh and inspect every dynamic widget. Remove or hide empty, unavailable or misleading widgets unless an explicit meaningful zero-state was requested.

## Realtime and security

The browser receives immediate local state over SSE and polls `/api/state` every two seconds. Wrapped production calls write sanitized lifecycle activity automatically; state keeps at most 100 tasks, events, and reports and the UI shows the latest ten events.

Never send credentials, authorization headers, raw arguments, raw API responses, account/customer/property IDs, production connection details or secret-bearing errors to the local app. Keep activity concise and understandable to a non-technical viewer. Do not redesign the status UI.
