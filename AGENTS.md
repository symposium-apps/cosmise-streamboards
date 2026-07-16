# Coding-agent entry point

This repository is the trusted local Cosmise Streamboards backend and visibility app. Its local `/mcp` wraps every canonical `streamboards_*` production tool, calls `https://cosmise.com/api/mcp` with the backend-only profile credential, and records call status automatically. Do not bypass it with a separate production MCP connection.

## Required first actions

1. Run `node scripts/install-hermes-skill.js` to install or refresh the exact repository-owned `creating-cosmise-streamboards` skill in the active Hermes profile, then load it. The installer uses profile-scoped `HERMES_HOME` or explicit `HERMES_PROFILE`; it never infers a Hermes profile from the customer, organisation, workspace, or `SYM_PROFILE_ID`. If the current session already indexed skills, restart it after first installation.
2. Read `docs/AGENT.md`.
3. Call local `cosmise_app_get_bootstrap` (or `GET /api/agent/bootstrap`).
4. Call `cosmise_app_get_state` and inspect `runtime.backend_mcp_configured`.
5. If it is false, call `cosmise_app_update_connection` with `state: "missing_key"`, stop all `streamboards_*` calls, and tell the operator: **Open Connections, select Cosmise, and synchronize this organisation.** Never ask for the token value.
6. After synchronization, run `SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js` from this repository; it must report only `configured=true` and never the credential.
7. Restart `cosmise-streamboards` with the profile-scoped `run_app` tool so the backend receives its app-specific secret.
8. Call `cosmise_app_sync_now`, then `streamboards_get_context` through this wrapper.
9. Proceed only when `runtime.backend_mcp_configured=true`, `connection.state=ready`, and the returned organisation matches the active profile.
10. Call `cosmise_app_start_task` before production work so the UI shows active work.

## Missing production access

The app backend reads `COSMISE_MCP_TOKEN` only from its own process environment. It does not fall back to the profile Gateway secret file. The exact recovery sequence is:

1. Open Connections, select **Cosmise**, and synchronize this organisation.
2. From this app repository run `SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js`. The helper copies only `COSMISE_MCP_TOKEN` into the app-specific private secret file and never prints it.
3. Restart `cosmise-streamboards` with the profile-scoped `run_app` tool.
4. Call `cosmise_app_sync_now`, then `streamboards_get_context`; proceed only after the backend is configured and the organisation matches.

Never ask for, print, log, return, persist, or send the token to browser code, `.sym-data`, tasks, activity, reports, templates, documentation, or chat.

If production tools remain unavailable, leave the task in `waiting`, keep the UI connection state at `missing_key`, explain the required operator action, and stop before production work.

## Required build loop

1. `cosmise_app_start_task`; include `resource: { "type": "streamboard", "id": "<streamboard-id>" }` whenever the target already exists.
2. Use `cosmise_app_set_view` when switching the active Streamboard. `/api/state.view` is authoritative for selected/open tabs, and `/api/state.sidebar_items` is authoritative for each sidebar status.
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
