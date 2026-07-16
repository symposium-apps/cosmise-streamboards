'use strict';

const PRODUCTION_MCP_URL = 'https://cosmise.com/api/mcp';
const CREDENTIAL_ENV = 'COSMISE_MCP_TOKEN';

const AGENT_BOOTSTRAP = Object.freeze({
  purpose: 'Build real organisation-scoped Cosmise Streamboards through production MCP while publishing sanitized realtime progress to this local app.',
  api_boundaries: {
    production: {
      name: 'Cosmise production MCP',
      url: PRODUCTION_MCP_URL,
      responsibility: 'Read connected organisation data and create, update, refresh, validate and publish real Streamboards.',
      credential_owner: 'The authorised coding-agent profile only.'
    },
    local: {
      name: 'Cosmise Streamboards local app',
      mcp_path: '/mcp',
      state_path: '/api/state',
      instructions_path: '/api/agent/bootstrap',
      observations_path: '/api/agent/calls',
      events_path: '/api/events/stream',
      responsibility: 'Store visible tasks, sanitized activity, verification and report URLs. It never receives a production credential.'
    }
  },
  credential_setup: {
    environment_variable: CREDENTIAL_ENV,
    profile_env_path: '~/.hermes/profiles/<active-profile>/.env',
    profile_config_path: '~/.hermes/profiles/<active-profile>/config.yaml',
    preferred_setup: 'Connect the profile-scoped Cosmise integration so SYM-Node stores COSMISE_MCP_TOKEN in the private gateway environment and adds the cosmise MCP server.',
    missing_access_steps: [
      'Call cosmise_app_update_connection with state=missing_key so the UI explains why work is waiting.',
      'Ask the operator or trusted coding-agent host to connect the Cosmise integration or provide the approved credential file path. Never ask for the credential value in chat.',
      'Import the credential into COSMISE_MCP_TOKEN in the active agent profile private environment, not this app, its repository, browser state or .sym-data.',
      'Ensure the active Hermes profile has an mcp_servers.cosmise entry for https://cosmise.com/api/mcp using Authorization: Bearer ${COSMISE_MCP_TOKEN}.',
      'Reload MCP tools or restart the coding-agent session, then verify streamboards_get_context is available.'
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
      'Do not put a production credential in this app, repository, browser, activity, report, template or .sym-data.',
      'Do not send credentials, headers, raw arguments, raw responses or sensitive identifiers to local telemetry.'
    ]
  },
  required_workflow: [
    'Call cosmise_app_start_task before production discovery so the UI immediately shows an active build.',
    'Verify the separate production MCP connection and report checking, ready, working, missing_key or error through cosmise_app_update_connection.',
    'Discover with streamboards_get_context, streamboards_get_capabilities, streamboards_list_connections and streamboards_list_query_catalog before writing.',
    'Inspect existing boards, branding and live templates, and call cosmise_app_list_layout_templates for bundled sanitized examples before designing a layout.',
    'Before every meaningful production Cosmise MCP call, call cosmise_app_observe_call with status=running.',
    'After the production call, update the same call_id with status=success or failed and a safe user-readable summary.',
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
  'REQUIRED START: call cosmise_app_get_bootstrap and cosmise_app_start_task before doing production Streamboards work.',
  'There are two separate APIs: use the authorised profile connection to https://cosmise.com/api/mcp for real streamboards_* and connected-data calls; use this local MCP only for visible task state, sanitized realtime activity, layout examples, verification and report links.',
  'If production tools or COSMISE_MCP_TOKEN are unavailable, call cosmise_app_update_connection with state=missing_key, then ask the operator or trusted coding-agent host to connect the Cosmise integration or provide the approved credential file path. Store it only as COSMISE_MCP_TOKEN in the active Hermes profile private environment and configure mcp_servers.cosmise; never place or send it to this app.',
  'Discover context, capabilities, connections and streamboards_list_query_catalog before writing. Inspect existing boards and branding, then review cosmise_app_list_layout_templates and streamboards_list_templates before choosing a 48-column composition.',
  'Use only catalog-supported fixed queries, master metrics and formula tokens. Formulas need available inputs, safe division, clear units and honest labels. Refresh, poll to terminal, inspect rendered data, and remove empty or misleading widgets.',
  'For every meaningful production call, send cosmise_app_observe_call status=running before the production call, then update the same call_id to success or failed afterwards. Never send credentials, headers, raw arguments, raw responses or sensitive identifiers.',
  'Finish with structural/cache/rendered verification, cosmise_app_show_verification, cosmise_app_show_report and cosmise_app_complete_task.'
].join('\n');

module.exports = { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, CREDENTIAL_ENV, PRODUCTION_MCP_URL };
