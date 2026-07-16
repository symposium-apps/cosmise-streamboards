'use strict';

const PRODUCTION_MCP_URL = 'https://cosmise.com/api/mcp';
const CREDENTIAL_ENV = 'COSMISE_MCP_TOKEN';

const AGENT_BOOTSTRAP = Object.freeze({
  purpose: 'Build real organisation-scoped Cosmise Streamboards through one backend-owned local MCP wrapper with automatic bounded activity.',
  api_boundaries: {
    production: {
      name: 'Cosmise production MCP',
      url: PRODUCTION_MCP_URL,
      responsibility: 'Read connected organisation data and create, update, refresh, validate and publish real Streamboards.',
      credential_owner: 'The trusted local app backend process only; never the browser.'
    },
    local: {
      name: 'Cosmise Streamboards local app',
      mcp_path: '/mcp',
      state_path: '/api/state',
      instructions_path: '/api/agent/bootstrap',
      observations_path: '/api/agent/calls',
      events_path: '/api/events/stream',
      tool_catalog_path: '/api/cosmise/tools',
      responsibility: 'Proxy all Streamboards MCP tools, record their lifecycle automatically, synchronize reports, and expose browser-safe local state.'
    }
  },
  credential_setup: {
    environment_variable: CREDENTIAL_ENV,
    app_secret_path: '/srv/symposium-data/profile-runtime/<profile>/apps/cosmise-streamboards/secrets.env',
    binding_helper: 'SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js',
    preferred_setup: 'Synchronize the profile-scoped Cosmise integration, run the binding helper without printing the credential, then restart this managed app so COSMISE_MCP_TOKEN is present in its own process environment.',
    missing_access_steps: [
      'Open Connections, select Cosmise, and synchronize this organisation.',
      'From the app repository run SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js. The helper copies only COSMISE_MCP_TOKEN into the app-specific private secret file and never prints it.',
      'Restart cosmise-streamboards with the profile-scoped run_app tool.',
      'Call cosmise_app_sync_now, then streamboards_get_context, and verify the active organisation.'
    ],
    hermes_mcp_config_example: {
      mcp_servers: {
        cosmise: {
          url: PRODUCTION_MCP_URL,
          headers: { Authorization: `Bearer \${${CREDENTIAL_ENV}}` },
          tools: { resources: false, prompts: false }
        }
      }
    },
    forbidden: [
      'Do not put a production credential in source, browser code, API responses, activity, reports, templates or .sym-data.',
      'Do not send credentials, headers, raw arguments, raw responses or sensitive identifiers to local telemetry.'
    ]
  },
  credential_gate: {
    state_field: 'runtime.backend_mcp_configured',
    blocked_when: false,
    required_agent_steps: [
      'Call cosmise_app_get_state before production work and inspect runtime.backend_mcp_configured.',
      'When false, call cosmise_app_update_connection with state=missing_key and stop all streamboards_* calls.',
      'Tell the operator exactly: Open Connections, select Cosmise, and synchronize this organisation. Never ask for the token value.',
      'From the app repository run SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js. The helper writes only the named credential to the app-specific private secret file and never prints it.',
      'Restart cosmise-streamboards with the profile-scoped run_app tool so the managed process receives COSMISE_MCP_TOKEN.',
      'Call cosmise_app_sync_now, then streamboards_get_context through this wrapper.',
      'Proceed only when runtime.backend_mcp_configured is true, connection.state is ready, and the returned organisation matches the active profile.'
    ]
  },
  required_workflow: [
    'Call cosmise_app_start_task before production discovery so the UI immediately shows an active build.',
    'Use this local MCP wrapper for every streamboards_* call; it verifies the backend connection and records activity automatically.',
    'Discover with streamboards_get_context, streamboards_get_capabilities, streamboards_list_connections and streamboards_list_query_catalog before writing.',
    'Inspect existing boards, branding and live templates, and call cosmise_app_list_layout_templates for bundled sanitized examples before designing a layout.',
    'Use companion activity tools only for non-MCP planning milestones; wrapped Streamboards calls already record running, success and failure.',
    'Create or update the board idempotently, using exact 48-column layout geometry and supported live schemas.',
    'Validate structure, dry-run cache refresh, execute refresh, poll cache status to terminal, and inspect rendered usefulness.',
    'Publish only when requested, obtain canonical URLs, call cosmise_app_show_verification and cosmise_app_show_report, then cosmise_app_complete_task.'
  ],
  layouts: {
    bundled_tool: 'cosmise_app_list_layout_templates',
    bundled_http: '/api/templates',
    live_tool: 'streamboards_list_templates',
    grid_columns: 48,
    rules: [
      'Review two or three relevant examples before choosing a composition.',
      'Map neutral template slots to newly created widget IDs; never copy client IDs, names, values or prose.',
      'Adapt the pattern to the brief and connected sources; do not blindly clone every slot.',
      'Preview layout changes and validate bounds, overlap and widget/layout/datastream consistency.'
    ]
  },
  metrics: {
    source_of_truth: 'streamboards_list_query_catalog and the live tools/list schemas',
    rules: [
      'Use fixed query widgets only for catalog-listed query keys.',
      'Use streamboards_add_master_metric_widget only for supported platform, metric and display combinations.',
      'Create formula metrics only from catalogued tokens with available inputs, safe divide-by-zero behavior, a clear unit and an honest business label.',
      'Do not describe blended efficiency formulas as attributed ROAS.',
      'Refresh and inspect every dynamic widget. Remove or hide empty, unavailable or misleading widgets unless an explicit meaningful zero-state was requested.'
    ]
  },
  completion_checks: [
    'Correct credential-derived organisation scope',
    'Supported metrics and formulas',
    'Valid 48-column layout with no orphan references',
    'Terminal cache state with no running or scheduled work',
    'Rendered report contains useful populated data',
    'Canonical report URL is shown in the local app',
    'Local task is completed or failed with a safe explanation'
  ]
});

const AGENT_INSTRUCTIONS = [
  'REQUIRED START: call cosmise_app_get_bootstrap and cosmise_app_get_state. Inspect runtime.backend_mcp_configured before any production Streamboards call.',
  'If runtime.backend_mcp_configured is false: call cosmise_app_update_connection with state=missing_key, stop all streamboards_* calls, and tell the operator to open Connections, select Cosmise, and synchronize this organisation. Never ask for the token value.',
  'After synchronization: from the app repository run SYM_PROFILE_ID=<active-profile-id> node scripts/bind-profile-credential.js, then restart cosmise-streamboards with the profile-scoped run_app tool. The helper must not print the credential.',
  'After restart: call cosmise_app_sync_now, then call streamboards_get_context. Proceed only after backend_mcp_configured=true, connection.state=ready, and the organisation matches the active profile.',
  'Once the credential gate is clear, call cosmise_app_start_task before doing production Streamboards work.',
  'Whenever work targets a known Streamboard, attach resource={type:streamboard,id:<streamboard_id>} to the task or call cosmise_app_set_view. The status API then owns the selected sidebar item and open tabs.',
  'Use this local MCP for every streamboards_* operation. It securely calls https://cosmise.com/api/mcp with the backend-only profile credential and automatically records running, success and failure activity.',
  'Discover context, capabilities, connections and streamboards_list_query_catalog before writing. Inspect existing boards and branding, then review cosmise_app_list_layout_templates and streamboards_list_templates before choosing a 48-column composition.',
  'Use only catalog-supported fixed queries, master metrics and formula tokens. Formulas need available inputs, safe division, clear units and honest labels. Refresh, poll to terminal, inspect rendered data, and remove empty or misleading widgets.',
  'Wrapped Streamboards calls emit their own activity. Use cosmise_app_show_message only for safe planning or interpretation milestones. Never send credentials, headers, raw arguments, raw responses or sensitive identifiers.',
  'Finish with structural/cache/rendered verification, cosmise_app_show_verification, cosmise_app_show_report and cosmise_app_complete_task.'
].join('\n');

module.exports = { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, CREDENTIAL_ENV, PRODUCTION_MCP_URL };
