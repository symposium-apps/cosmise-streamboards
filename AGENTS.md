# Coding-agent entry point

This app exposes one private backend MCP at `/mcp`. It wraps every credential-allowed production Cosmise `streamboards_*` tool and the local `cosmise_app_*` communication tools.

## Required start

1. Connect to this app's wrapped `/mcp` endpoint using the backend-managed Bearer credential.
2. Call `cosmise_app_get_bootstrap`.
3. Use the wrapped `streamboards_*` tools for all production work. Do not bypass the wrapper with a separate direct Cosmise MCP connection.

The wrapper automatically records sanitized `running`, `success`, and `failed` activity around every production tool call. Manual observation calls are optional and should only add useful human context.

## Credential boundary

`COSMISE_MCP_TOKEN` belongs to the trusted app backend. SYM-Node may inject it directly; on managed workers the backend can import only that named value from the owning profile's private managed environment.

Never put the credential in:

- browser code or responses;
- `/api/state` or `.sym-data`;
- tasks, activity, reports or templates;
- logs, source, documentation or chat.

The wrapped MCP and private write APIs require a matching Bearer credential. Public browser routes expose sanitized read-only state only.

## Report workflow

1. Read organization context, capabilities, connections and query catalog.
2. Inspect existing boards, branding, live templates and `cosmise_app_list_layout_templates`.
3. Create or update the Streamboard through wrapped production tools.
4. Use supported metrics and exact 48-column geometry.
5. Validate, refresh, poll cache state to terminal and inspect rendered usefulness.
6. Publish only when requested and obtain canonical URLs through `streamboards_get_urls`.
7. Embed only `public_url`. Keep `edit_url` external. Protected reports require short-lived embed access.

## Realtime state

- SSE broadcasts local state immediately.
- The browser reconciles `/api/state` every two seconds.
- Local JSON retains at most 100 tasks, 100 events and 100 reports.
- The visible activity endpoint returns the latest 10 events.
- Raw MCP arguments and responses are never persisted.

See `docs/AGENT.md` for the complete tool, metric, layout and verification reference.
