'use strict';

const TOKEN_NAME = 'COSMISE_MCP_TOKEN';

function loadCosmiseCredential() {
  const token = String(process.env[TOKEN_NAME] || '').trim();
  if (token) return { token, source: 'app_process_environment' };
  return { token: '', source: 'missing' };
}

module.exports = { TOKEN_NAME, loadCosmiseCredential };
