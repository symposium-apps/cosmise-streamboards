# Agent instructions

This repository is the local Cosmise Streamboards visibility app. Production `streamboards_*`, `ga4_*`, `google_ads_*`, and other Cosmise MCP tools are called through the separately authorised agent profile; never put a production credential in this app.

## Required live activity behavior

Whenever a visible Streamboard task is active, mirror every meaningful production Cosmise MCP call into this app:

1. Before the production call, call local MCP tool `cosmise_app_observe_call` with `status: "running"`.
2. Make the real production Cosmise MCP call.
3. Call `cosmise_app_observe_call` again with the same `call_id`, `status: "success"` or `"failed"`, and safe facts learned from the response.

The same contract is available over HTTP at `POST /api/agent/calls`. The local MCP initialize response and `GET /api/agent/instructions` also expose this instruction to connected agents.

Activity must be concise and understandable to a non-technical viewer, for example:

- `Reading available Google Analytics metrics…`
- `Checking Google Ads dimensions…`
- `Comparing compatible fields across both sources…`
- `Defining a custom efficiency metric…`
- `Validating the campaign performance widget…`
- `Publishing the verified Streamboard…`

Never send credentials, authorization headers, raw arguments, raw API responses, account/customer/property IDs, production connection details, or secret-bearing errors. Send only sanitized descriptions and safe aggregate facts.

Do not redesign the status UI. Live activity updates belong in the existing status bar, existing **Building now** text, and existing short build log.
