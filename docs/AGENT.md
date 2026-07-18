# Agent contract: Cosmise Streamboards

## Purpose

This app is the trusted backend and visible communications surface for organisation-scoped Cosmise Streamboards work. Its local MCP exposes every canonical `streamboards_*` tool, forwards calls to Cosmise with the backend-only profile credential, and records sanitized lifecycle activity automatically.

Before following this contract, run `node scripts/install-hermes-skill.js`, then load `creating-cosmise-streamboards`. The installer refreshes the exact repository copy in the active profile and requires profile-scoped `HERMES_HOME` or explicit `HERMES_PROFILE`; it never infers a Hermes profile from an organisation, workspace, customer, or `SYM_PROFILE_ID`.

## Required entry point and production credential

Before Streamboards work, call `cosmise_app_get_bootstrap`, then `cosmise_app_get_state`. Treat `runtime.backend_mcp_configured=false` as a hard gate: stop all production calls until the exact recovery sequence below succeeds.

The backend uses `COSMISE_MCP_TOKEN` to call `https://cosmise.com/api/mcp` and reads it only from this app's process environment. It does not fall back to the profile Gateway secret file. If production tools are absent:

1. Call `cosmise_app_update_connection` with `state: "missing_key"`.
2. Tell the operator exactly: **Open Connections, select Cosmise, and synchronize this organisation.** Never request or repeat the credential value.
3. Restart `cosmise-streamboards` with the profile-scoped `run_app` tool so SYM-Node injects the synchronized profile integration credential only into this backend process.
4. Call `cosmise_app_sync_now`, then `streamboards_get_context` through this wrapper.
5. Proceed only when `runtime.backend_mcp_configured=true`, `connection.state=ready`, and the returned organisation matches the active profile.

Do not continue production work until the key-scoped organisation and available tools have been verified.

## Security boundary

1. The MCP credential determines the organisation. Never send or trust caller-selected `org_id`, `agency_id`, or `endpoint_id` as authority.
2. The production credential belongs only to this trusted backend process. Never expose it to the browser or public app routes.
3. Never print, log, return, summarize, encode, hash, or persist the credential outside the protected environment.
4. Never copy credentials into browser code, reports, activity, tasks, `.sym-data`, documentation, source, or chat.
5. Use dry-run and preview tools before destructive or broad structural changes.
6. Never claim asynchronous cache completion from a scheduling receipt. Poll cache status.
7. Never claim email delivery. `sent: true` proves the application completed the send call, not inbox delivery.

## Normal agent loop

```text
1. cosmise_app_get_bootstrap
2. cosmise_app_get_state; inspect runtime.backend_mcp_configured
3. If false, execute the exact credential recovery sequence above and stop
4. cosmise_app_sync_now
5. streamboards_get_context; verify the active organisation
6. cosmise_app_start_task with resource.type=streamboard and resource.id when the target is known
7. cosmise_app_set_view whenever planning switches to another Streamboard
8. streamboards_get_capabilities / streamboards_list_connections / streamboards_list_query_catalog
9. Inspect existing boards, branding, live templates and bundled layout examples
10. Perform every production streamboards_* operation through this local wrapper
11. Emit optional planning/interpretation milestones with local communication tools
12. Verify stored state with the recommended read tools
13. cosmise_app_show_verification
14. cosmise_app_complete_task
```

Every wrapped Streamboards call automatically emits running, success, or failure activity, updates bounded local JSON state, and reaches the browser over SSE plus two-second polling. Use `cosmise_app_observe_call` only for relevant non-wrapper work such as connected-data interpretation. Do not send implementation trivia or raw payloads.

If production MCP access is unavailable, immediately call `cosmise_app_update_connection` with `state: "missing_key"` and an actionable message, leave the report task in `waiting`, and stop before attempting production operations. Never send the key, key prefix, authorization header, or raw connection configuration to this app.

## Local communication tools

### `cosmise_app_get_bootstrap`
Read this first. It returns the complete machine-readable startup contract for production credential ownership, missing-access recovery, both API boundaries, required live observations, layout examples, metrics/formulas, refresh and completion verification.

### `cosmise_app_get_state`
Read tasks, activity, connection status, and reports visible in the app.

### `cosmise_app_update_connection`
Publish backend MCP readiness to the dashboard. Valid states are `missing_key`, `checking`, `ready`, `working`, and `error`; optional modes are `read` and `read_write`. Never include the credential.

### `cosmise_app_start_task`
Start one user-visible unit of work. Use a stable `id` when continuing the same request.

```json
{
  "id": "monthly-performance",
  "title": "Build Monthly Performance report",
  "detail": "Checking connections and report requirements.",
  "progress": { "current": 1, "total": 8 }
}
```

### `cosmise_app_update_task`
Update status, detail, progress, or attached resource. Valid statuses: `queued`, `running`, `waiting`, `success`, `failed`, `cancelled`.

### `cosmise_app_complete_task`
Complete a task only after the appropriate read/validation checks. Include machine-readable verification.

### `cosmise_app_fail_task`
Show a safe, actionable explanation. Never include credentials or raw upstream internals that could expose them.

### `cosmise_app_show_message`
Show a meaningful milestone or warning in the realtime feed.

### `cosmise_app_log_call`
Record one sanitized `streamboards_*` production call for the dashboard. Include tool name, status, concise detail, optional duration, and optional Streamboard ID. Do not include arguments, headers, credentials, upstream payloads, query results, or sensitive identifiers.

### `cosmise_app_observe_call`
Use this companion tool only around meaningful connected-data or planning calls that do not already pass through the Streamboards wrapper. Wrapped `streamboards_*` tools record their own lifecycle.

The same payload can be posted to the local HTTP endpoint `POST /api/agent/calls`. Agents can read the current instruction and endpoint from `GET /api/agent/instructions`; MCP clients also receive the instruction in the `initialize` response.

Before the production call:

```json
{
  "task_id": "monthly-performance",
  "call_id": "metric-catalog-1",
  "tool_name": "streamboards_list_query_catalog",
  "phase": "reading",
  "status": "running",
  "message": "Reading the available GA4 and Google Ads metrics."
}
```

After it returns, reuse the same `call_id` so the live event is updated rather than duplicated:

```json
{
  "task_id": "monthly-performance",
  "call_id": "metric-catalog-1",
  "tool_name": "streamboards_list_query_catalog",
  "phase": "learning",
  "status": "success",
  "message": "Found supported GA4 and Google Ads metrics.",
  "learned": [
    "GA4 supports sessions, users, engagement, conversion rate and revenue",
    "Google Ads supports spend, impressions, clicks, conversions and CPA"
  ]
}
```

Allowed phases are `reading`, `learning`, `building`, `refreshing`, `verifying`, and `publishing`. Never include credentials, authorization headers, raw arguments, raw API responses, account IDs, customer IDs, property IDs, or other sensitive identifiers.

## Backend Streamboards wrapper

The backend registers one local HTTP endpoint for every tool in `data/tool-catalog.json`:

```text
POST /api/cosmise/tools/<exact-streamboards-tool-name>
```

Examples:

```text
POST /api/cosmise/tools/streamboards_get_context
POST /api/cosmise/tools/streamboards_create
POST /api/cosmise/tools/streamboards_add_master_metric_widget
POST /api/cosmise/tools/streamboards_validate
POST /api/cosmise/tools/streamboards_get_urls
```

`GET /api/cosmise/tools` returns all 78 exact route names, modes, categories and input schemas. `POST /api/cosmise/sync` refreshes context, the complete organisation board list, and missing canonical URLs. These backend routes and `/mcp` are localhost-only; the public browser receives only safe state and documentation reads.

The request body is the exact MCP tool argument object. The backend returns `{ ok, tool, data, receipt }`, where `data` is the decoded Cosmise tool result and `receipt` contains safe status, duration and time. Every wrapper invocation creates or updates one bounded activity event automatically.

The local `/mcp` exposes the same 78 `streamboards_*` tools in addition to app communication tools, so coding agents should normally use one MCP endpoint instead of the HTTP routes directly.

### `cosmise_app_show_verification`
Display structured checks such as `organisation_scope`, `endpoint_ok`, `layout_ok`, `cache_errors`, `publication_ok`, and `stored_state`.

### `cosmise_app_show_report`
Add a report to the report library/viewer. URLs must be HTTPS on `cosmise.com` or a subdomain. Private report access should later use a short-lived embed token.

### `cosmise_app_clear_activity`
Requires `confirm: true`. Never clear activity merely to hide a failure.

## Response interpretation

The production MCP returns tool JSON serialized in `result.content[0].text`. Tool-level failures set `isError: true`.

Common write receipts include:

```text
created, updated, duplicated, removed, deleted, archived,
rolled_back, generated, sent, scheduled, revision,
previous_revision_id, streamboard_id, widget_id, public_url
```

Treat those as action receipts, then verify independently.

## Verification matrix

| Action | Verify with | Completion rule |
|---|---|---|
| Create/update board | `streamboards_get`, `streamboards_validate` | Board exists under key organisation and validation is acceptable |
| Add/update/remove widget | `streamboards_get_widget` or `streamboards_list_widgets`, then `streamboards_validate` | Widget/layout/datastream references agree |
| Layout change | `streamboards_get_layout`, `streamboards_validate` | 48-column bounds valid, no overlap/orphan errors |
| Query config | `streamboards_get_effective_query_config`, `streamboards_validate` | Effective widget settings match intent |
| Publish/unpublish | `streamboards_get_publication`, `streamboards_get_urls` | Stored public state and canonical URL match intent |
| Cache refresh | `streamboards_get_cache_status` until terminal | No running/scheduled work remains; report success/error totals honestly |
| Branding | `streamboards_get_branding` | Effective organisation branding matches requested values |
| Rollback | `streamboards_get`, `streamboards_get_layout`, `streamboards_validate` | Restored revision state is present and structurally valid |
| Delete | preview first; then `streamboards_list` | Board absent from organisation list |
| PDF | inspect `generated`, `cdn_url`, `bytes` | Generation completed and artifact metadata exists |
| Email | inspect `sent`, `recipients_sent` | Send call completed for exact confirmed recipients; delivery remains unknown |

## Report-building workflow

1. Discover organisation, capabilities, connections, templates, and query catalog.
2. Clarify missing business requirements before writing.
3. Select an anonymized layout template with `cosmise_app_list_layout_templates` or a live available Streamboards template with `streamboards_list_templates`.
4. Create the board or use an available template.
5. Apply organisation branding and a cover page where appropriate.
6. Use `streamboards_list_query_catalog` to consider fixed query widgets, `master_custom_metric` widgets, and formula-capable static widgets; do not default to only the easiest fixed KPI widgets.
7. Build or compact layout within 48 columns.
8. Validate structure before cache execution.
9. Refresh data and poll status to completion.
10. Inspect each dynamic widget's terminal cache result and rendered usefulness. Empty, unavailable, or non-actionable metrics should not be favored merely to fill a layout slot.
11. Remove or hide empty widgets unless the user explicitly wants a zero-state, the zero is itself meaningful, or the widget is clearly labeled as not connected/no activity. Prefer a relevant custom metric or formula only when its inputs are available and its business meaning is clear.
12. Diagnose and repair any failures; do not conceal partial results.
13. Publish only when requested, then verify canonical URLs.
14. Show the Streamboard in this app and provide a concise verified summary.

## Metric and formula selection

- The query catalog is the source of truth for supported fixed queries and master custom metric options. Read it before creating metric widgets.
- Use `streamboards_add_master_metric_widget` for supported `master_custom_metric` platform/metric/display combinations, then refresh and verify the resulting cache data.
- Formula widgets use cataloged formula fields such as `formula_label`, `formula_tokens`, `lower_is_better`, `show_platform_labels`, and `value_symbol`. Do not invent token names or formulas absent from the live widget schema/catalog.
- A formula must have available inputs, safe divide-by-zero behavior, a clear unit, and a label that states its business meaning. Examples may include ROAS, CPA, conversion rate, or blended efficiency only when the required source metrics exist.
- Do not create a formula solely to make the Streamboard look more complete. Prefer fewer meaningful widgets over a full layout containing empty or misleading metrics.
- After cache completion, inspect the stored result and rendered Streamboard. A successful cache job does not prove the metric is populated or useful.

## Terminology

Call the product artifact a **Streamboard**. Call this package the **local Streamboards app** or **agent-facing Streamboards app**. Use this terminology consistently in interface copy, documentation, task names, activity events, and usage instructions.

## Versioned layout-template library

`cosmise_app_list_layout_templates` reads **47 sanitized layout examples bundled with this app version** in `data/layout-templates.json`. Filter by required `widget_types`, `min_widgets`, `max_widgets`, and `limit`. Future app versions can add more examples to that file.

Each pattern preserves neutral widget slots, static/dynamic family, safe query/widget type, generic display choices, hidden state, and exact 48-column `x/y/w/h` geometry. It intentionally omits report and organisation names, prose, images, branding, document IDs, URLs, campaign/account selections, datasource fields, query parameter values, cache payloads, and metric results.

Selection and adaptation loop:

```text
1. Identify the report goal and connected platforms.
2. Read the live query/widget catalogs.
3. Find two or three patterns containing relevant widget types.
4. Compare section rhythm, full/half/third-width placement, widget count, and canvas length.
5. Map neutral widget_XX slots to newly created widget IDs.
6. Adapt the composition to the user brief; never blindly clone every slot.
7. Preview layout changes and validate the finished board.
```

The app exposes read-only `GET /api/templates`, `GET /api/templates/:id`, and `cosmise_app_list_layout_templates`. There is deliberately no runtime import endpoint, MCP write tool, template database, extractor, or template-related environment configuration. Templates are versioned app assets.

## Destructive and external side effects

- Use preview/dry-run before hard delete, broad layout replacement, rollback, cache refresh, PDF generation, or email where supported.
- Hard delete requires exact confirmation required by the canonical tool.
- Email requires `confirm_send: true` and an exact normalized `confirm_emails` match.
- Ask the user before sending email or performing permanent deletion unless their request already provides explicit confirmation.

---

# Canonical Streamboards tool reference

The following catalog is generated from the canonical Cosmise MCP source. Runtime `tools/list` remains authoritative for exact live input schemas and key-specific availability.


Catalog total: **78 unique tools**.

## Boards

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_list` | read | List Streamboards owned by the MCP key's organisation. Org ownership is enforced server-side. | Read-only / receipt itself |
| `streamboards_get` | read | Get safe metadata for one org-owned Streamboard. | Read-only / receipt itself |
| `streamboards_get_urls` | read | Get canonical public/shareable and editable dashboard URLs for one org-owned Streamboard. Uses the organisation pretty_id and Streamboard slug/id; never guesses URL parts. | Read-only / receipt itself |
| `streamboards_list_datastreams` | read | List datastreams/widgets for one org-owned Streamboard with cache metadata. | Read-only / receipt itself |
| `streamboards_create_blank` | WRITE | WRITE: Create an empty org-owned Streamboard for the MCP key endpoint. Supports dry_run. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_update_metadata` | WRITE | WRITE: Update safe Streamboard metadata (name, description, slug, tags, allowed_roles, is_public). Does not change org/endpoint/template/user. Supports dry_run. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_archive` | WRITE | WRITE: Archive an org-owned Streamboard by setting archived/status fields. Supports dry_run. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_delete` | WRITE | WRITE: Hard delete an org-owned Streamboard and its datastream/password docs. Requires confirm=true and supports dry_run. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_update_query_config` | WRITE | WRITE: Update date/model/currency query_config on an org-owned Streamboard. Supports dry_run and optional cache refresh. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_get_effective_query_config` | read | Explain board-level and per-widget effective query config after merging widget custom_params. | Read-only / receipt itself |
| `streamboards_create` | WRITE | WRITE: Create a blank board in the key organisation. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_update` | WRITE | WRITE: Update board name, description, tags, roles or commentary. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_duplicate` | WRITE | WRITE: Duplicate a board and widget configurations inside the key organisation without cache state, slug or publication. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_restore` | WRITE | WRITE: Restore an archived board. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_preview_delete` | read | Describe board resources that permanent deletion would remove without writing. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_get_query_config` | read | Get stored query configuration and organisation date capabilities. | Read-only / receipt itself |
| `streamboards_reset_query_config` | WRITE | WRITE: Reset selected query configuration fields or all fields to defaults. | Read-only / receipt itself |
| `streamboards_get_publication` | read | Get slug, publication, protection and canonical URL state. | Read-only / receipt itself |

## Branding

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_get_org_branding` | read | Get organisation and agency style-guide branding used by cover page widgets. | `streamboards_get_branding` |
| `streamboards_update_org_branding` | WRITE | WRITE: Update the MCP key organisation style guide used by Streamboard cover pages. Supports dry_run. | `streamboards_get_branding` |
| `streamboards_get_branding` | read | Get normalized organisation branding with agency fallback. | `streamboards_get_branding` |
| `streamboards_set_branding` | WRITE | WRITE: Set organisation brand name, logo and light-theme colours. | `streamboards_get_branding` |

## Cache & data

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_get_cache_status` | read | Get cache health rollup for one org-owned Streamboard. | `streamboards_get_cache_status`<br>`streamboards_validate` |
| `streamboards_refresh_datastream_cache` | WRITE | WRITE: Schedule a cache refresh for one datastream under an org-owned Streamboard. Supports dry_run. | `streamboards_get_cache_status`<br>`streamboards_validate` |
| `streamboards_refresh_board_cache` | WRITE | WRITE: Schedule cache refreshes for runnable DB datastreams on an org-owned Streamboard. Supports dry_run, stale_only, only_failed, max_datastreams. | `streamboards_get_cache_status`<br>`streamboards_validate` |

## Discovery & verification

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_get_org_context` | read | Get the MCP key's organisation context for Streamboards: org, endpoint, feature flags, branding, connected platforms, available templates, and board summary. Org-scoped only. | Read-only / receipt itself |
| `streamboards_list_connections` | read | List Streamboards-relevant endpoint connections/platforms for the MCP key's organisation endpoint. | Read-only / receipt itself |
| `streamboards_list_query_catalog` | read | List agent-safe static widget types, dynamic query keys, and master custom metric options that can be used to create widgets. | Read-only / receipt itself |
| `streamboards_validate` | read | Validate Streamboard structure: org ownership, endpoint, layout/datastream joins, widget metadata, cache health, and template scope. | Read-only / receipt itself |
| `streamboards_audit_org` | read | Audit all Streamboards in the MCP key organisation for layout, metadata, endpoint, cache, and datastream issues. | Read-only / receipt itself |
| `streamboards_repair_plan` | read | Generate a no-write repair plan for a Streamboard using validation and cache status. | Read-only / receipt itself |
| `streamboards_get_context` | read | Get the organisation, endpoint, agency, entitlements, branding and Streamboards counts inferred from this org-scoped key. | Read-only / receipt itself |
| `streamboards_get_capabilities` | read | Get supported Streamboards management capabilities and limits for this organisation. | Read-only / receipt itself |
| `streamboards_get_org_summary` | read | Get board, widget, publication, cache and template totals for the key organisation. | Read-only / receipt itself |
| `streamboards_diagnose` | read | Diagnose structural, endpoint, publication, connection and cache issues for one board. | Read-only / receipt itself |

## Publication & access

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_check_slug` | read | Check a slug inside the key organisation. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_set_slug` | WRITE | WRITE: Set an available normalized board slug. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_publish` | WRITE | WRITE: Publish a board with an available slug. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_unpublish` | WRITE | WRITE: Make a board non-public while retaining its slug. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_set_password` | WRITE | WRITE: Set or replace public board password protection. Passwords are salted and hashed and never returned. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_remove_password` | WRITE | WRITE: Remove public board password protection. | `streamboards_get_publication`<br>`streamboards_get_urls` |
| `streamboards_create_embed_token` | WRITE | WRITE: Create a short-lived capture/embed token for an organisation-owned board. | `streamboards_get_publication`<br>`streamboards_get_urls` |

## Reports

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_generate_pdf` | WRITE | WRITE: Generate and upload a PDF snapshot for an org-owned Streamboard. Returns CDN URL and attachment metadata. Supports dry_run. | Read-only / receipt itself |
| `streamboards_send_pdf_report` | WRITE | WRITE: Generate a PDF snapshot and email it to up to 10 explicit recipients for an org-owned Streamboard. Requires confirm_send=true and confirm_emails to exactly match emails. Supports dry_run. | Read-only / receipt itself |

## Revisions

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_list_revisions` | read | List configuration revisions captured before MCP writes. | Read-only / receipt itself |
| `streamboards_get_revision` | read | Get one board configuration revision. | Read-only / receipt itself |
| `streamboards_preview_rollback` | read | Preview restoring a board configuration revision. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_rollback` | WRITE | WRITE: Restore board metadata, layout and datastream configurations from a revision. | `streamboards_get`<br>`streamboards_validate` |

## Templates

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_list_templates` | read | List templates available to the MCP key's organisation. Agency templates are agency-gated by the org agency_id. | Read-only / receipt itself |
| `streamboards_create_from_template` | WRITE | WRITE: Create a new org-owned Streamboard from a global or org-agency template. Server infers org_id and endpoint_id from the MCP key. Supports dry_run. | `streamboards_get`<br>`streamboards_validate` |
| `streamboards_list_template_versions` | read | List versions for a global or agency template available to the organisation. | Read-only / receipt itself |
| `streamboards_get_template` | read | Get an available template and selected/current version summary. | Read-only / receipt itself |

## Widgets & layout

| Tool | Mode | Purpose | Verify with |
|---|---:|---|---|
| `streamboards_explain_widget` | read | Explain a Streamboard widget/datastream: display config, data source, effective query config, cache state, and likely issues. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_get_layout` | read | Get React Grid Layout items plus joined widget metadata/datastream summaries for one org-owned Streamboard. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_preview_layout_update` | read | Validate a proposed React Grid Layout update without writing. Enforces 48-column bounds and widget/datastream ID integrity. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_update_layout` | WRITE | WRITE: Update React Grid Layout for an org-owned Streamboard after validation. Does not delete datastreams. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_auto_layout` | read | Preview or write a simple compact grid layout for current widgets. Supports dry_run. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_create_static_widget` | WRITE | WRITE: Create a static widget/datastream and append layout + metadata. Supports cover_page, nav_header, markdown, header, image, etc. Supports dry_run. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_create_dynamic_widget` | WRITE | WRITE: Create a dynamic DB widget/datastream and append layout + metadata. Use streamboards_list_query_catalog first. Supports dry_run and optional cache scheduling. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_update_widget` | WRITE | WRITE: Update safe widget/datastream fields (name, content, custom_params, master_widget_config, status). Supports dry_run and optional refresh. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_delete_widget` | WRITE | WRITE: Delete one widget/datastream and remove layout/metadata/hidden references. Supports dry_run. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_duplicate_widget` | WRITE | WRITE: Duplicate a widget/datastream into a new widget id and append layout/metadata. Supports dry_run. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_hide_widget` | WRITE | WRITE: Add one widget ID to hidden_widget_ids on an org-owned Streamboard. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_unhide_widget` | WRITE | WRITE: Remove one widget ID from hidden_widget_ids on an org-owned Streamboard. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_list_widget_types` | read | List supported static and dynamic widget families with default sizes. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_get_widget_type_schema` | read | Get the input schema for one widget family. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_list_widgets` | read | List normalized widgets joined to layout and metadata. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_get_widget` | read | Get one normalized widget with configuration, layout and cache state. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_add_static_widget` | WRITE | WRITE: Add a static widget, including cover_page, with automatic or explicit placement. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_add_query_widget` | WRITE | WRITE: Add a fixed query-key dynamic DB widget. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_add_master_metric_widget` | WRITE | WRITE: Add a master_custom_metric widget with validated platform/metric/display configuration. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_preview_remove_widget` | read | Describe layout/datastream references removed with a widget. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_remove_widget` | WRITE | WRITE: Atomically remove a widget from layout, metadata, hidden IDs and datastreams. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_find_layout_space` | read | Find the next available 48-column grid position for a requested widget size. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_move_widget` | WRITE | WRITE: Move one widget without replacing the complete layout. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_resize_widget` | WRITE | WRITE: Resize one widget with grid-bound validation. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_place_widget` | WRITE | WRITE: Move and resize one widget atomically. | `streamboards_get_layout`<br>`streamboards_validate` |
| `streamboards_preview_auto_layout` | read | Preview a compact non-overlapping row layout. | `streamboards_get_layout`<br>`streamboards_validate` |

## Runtime authority

The live `tools/list` response is authoritative for exact schemas, key mode, `allowed_tools`, and deployed additions. This generated reference is for planning and verification behavior; do not invent arguments that are absent from the live schema.
