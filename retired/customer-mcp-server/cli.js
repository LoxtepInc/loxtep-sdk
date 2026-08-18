#!/usr/bin/env node
'use strict';

const message = [
  '@loxtep/customer-mcp-server is retired and no longer runs.',
  'Connect to hosted MCP instead:',
  '  https://mcp.loxtep.io/ai/mcp/stream',
  'Setup: https://github.com/loxtepinc/loxtep-plugins-skills',
].join('\n');

console.error(message);
process.exit(1);
