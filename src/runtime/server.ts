import { McpServer } from '@modelcontextprotocol/server';
import { validateManifest, toolSchema } from '../core/contracts.js';
import { executeTool, validateTarget } from './http.js';
export function createMcpServer(input: unknown, targetInput: unknown) {
  const manifest = validateManifest(input);
  const target = validateTarget(targetInput);
  const server = new McpServer({name:'specwake-generated',version:'0.1.0'});
  for (const tool of manifest.tools) server.registerTool(tool.name, {
    description:tool.description, inputSchema:toolSchema(tool),
    annotations:{readOnlyHint:false, destructiveHint:true, openWorldHint:true}
  }, async args => executeTool(tool, args, target));
  return server;
}
