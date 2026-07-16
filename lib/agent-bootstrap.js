'use strict';

const PRODUCTION_MCP_URL = 'https://cosmise.com/api/mcp';
const CREDENTIAL_ENV = 'COSMISE_MCP_TOKEN';

const AGENT_BOOTSTRAP = Object.freeze({
  purpose: 'Use one private backend MCP that wraps every organization-scoped Cosmise Streamboards tool and automatically publishes sanitized realtime status to this app.',
  api_boundary: {
    name: 'Cosmise Streamboards wrapped MCP',
    local_path: '/mcp',
    upstream_url: PRODUCTION_MCP_URL,
    credential_environment_variable: CREDENTIAL_ENV,
    responsibility: 'List and call every credential-allowed streamboards_* tool, synchronize report metadata, and automatically record running/success/failure status for the UI.'
  },
  credential_setup: {
    owner: 'The trusted app backend process only.',
    environment_variable: CREDENTIAL_ENV,
    source: 'The profile-scoped Cosmise integration managed by SYM-Node.',
    rules: [
      'Never send the credential to browser JavaScript, local JSON, task/activity payloads, reports, templates, logs, source, documentation or chat.',
      'The wrapped MCP requires a matching Bearer credential and must remain on the private profile/app control plane.',
      'If the backend credential is missing or rejected, report the connection error and stop before production work.'
    ]
  },
  automatic_telemetry: {
    state_path: '/api/state',
    events_path: '/api/events/stream',
    browser_poll_ms: 2000,
    persisted_limits: { tasks: 100, events: 100, reports: 100 },
    behavior: 'Every wrapped production tool call creates or reuses a visible task, records running status before forwarding, then updates the same call to success or failed without persisting raw arguments or responses.'
  },
  required_workflow: [
    'Use this wrapped MCP instead of a separate direct Cosmise MCP connection.',
    'Read streamboards_get_org_context, streamboards_get_capabilities, streamboards_list_connections and streamboards_list_query_catalog before writing.',
    'Inspect existing boards, branding and live templates, then use cosmise_app_list_layout_templates for bundled sanitized examples.',
    'Call the normal streamboards_* tools. The wrapper emits realtime status automatically; optional local tools can add human-readable milestones and verification.',
    'Build supported metrics and exact 48-column layouts, validate, refresh, poll cache state to terminal, inspect rendered usefulness and publish only when requested.',
    'Use streamboards_get_urls and cosmise_app_show_report with public_url for embedding and edit_url only for opening authenticated Cosmise externally.'
  ],
  reports: {
    sync_tool: 'cosmise_app_sync_reports',
    background_sync_ms: 60000,
    public_rule: 'Only a verified public_url may be embedded. Private reports remain listed and open edit_url externally.',
    protected_rule: 'Protected embedding requires a short-lived embed token; never substitute an authenticated dashboard URL.'
  },
  layouts: {
    bundled_tool: 'cosmise_app_list_layout_templates',
    bundled_http: '/api/templates',
    live_tool: 'streamboards_list_templates',
    grid_columns: 48,
    rules: [
      'Review two or three relevant examples before choosing a composition.',
      'Map neutral template slots to newly created widget IDs; never copy client IDs, names, values or prose.',
      'Use the live query catalog and tool schemas as authority, then preview and validate the completed layout.'
    ]
  },
  metrics: {
    source_of_truth: 'streamboards_list_query_catalog and wrapped tools/list schemas',
    rules: [
      'Use fixed query widgets only for catalog-listed query keys.',
      'Use master metric widgets only for supported platform, metric and display combinations.',
      'Formula metrics require available catalogued inputs, safe division, clear units and honest business labels.',
      'Refresh and inspect every dynamic widget; remove empty or misleading widgets unless the zero-state is meaningful.'
    ]
  },
  completion_checks: [
    'Correct credential-derived organization scope',
    'Supported metrics and formulas',
    'Valid 48-column layout with no orphan references',
    'Terminal cache state',
    'Useful rendered report',
    'Verified public URL or clearly private status',
    'Local task completed or failed'
  ]
});

const AGENT_INSTRUCTIONS = [
  'Use this app’s single private wrapped MCP for every streamboards_* call; do not bypass it with a separate direct production MCP connection.',
  'COSMISE_MCP_TOKEN belongs to the app backend only. Never request, reveal, log or place it in browser/local state.',
  'The wrapper automatically emits sanitized running/success/failure status around every production call and synchronizes safe report metadata.',
  'Read organization context, capabilities, connections, query catalog, existing boards, branding and layout examples before writing.',
  'Use supported metrics and exact 48-column layouts; validate, refresh to terminal, inspect rendered usefulness and publish only when requested.',
  'Embed only public_url. Keep edit_url external and use short-lived embed access for protected reports.'
].join('\n');

module.exports = { AGENT_BOOTSTRAP, AGENT_INSTRUCTIONS, CREDENTIAL_ENV, PRODUCTION_MCP_URL };
