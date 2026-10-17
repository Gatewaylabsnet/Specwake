import { McpServer, type StandardSchemaWithJSON } from '@modelcontextprotocol/server';
import { validateManifest, toolSchema } from '../core/contracts.js';
import { executeTool, validateTarget } from './http.js';
import { RuntimeFault, diagnostics } from './errors.js';
export function createMcpServer(input: unknown, targetInput: unknown) {
  let manifest;
  try {manifest = validateManifest(input);} catch {throw new RuntimeFault('SW_MANIFEST_INVALID');}
  const target = validateTarget(targetInput);
  const server = new McpServer({name:'specwake-generated',version:'0.1.0'});
  for (const tool of manifest.tools) {
    const schema = toolSchema(tool);
    // Standard Schema is an SDK-supported extension point: retain the exact JSON input
    // schema, but never send raw Zod issues (which can include untrusted input) to clients.
    const safeSchema: StandardSchemaWithJSON = {'~standard':{version:1,vendor:'specwake',jsonSchema:{input:()=>schema['~standard'].jsonSchema.input({target:'draft-2020-12'}),output:()=>schema['~standard'].jsonSchema.output({target:'draft-2020-12'})},validate:(value:unknown) => {
      const result = schema.safeParse(value);
      return result.success ? {value:result.data} : {issues:[{message:`[SW_PARAMETER_INVALID] ${diagnostics.SW_PARAMETER_INVALID.join(' ')}`}]};
    }}};
    server.registerTool<StandardSchemaWithJSON, StandardSchemaWithJSON>(tool.name, {
    description:tool.description, inputSchema:safeSchema,
    annotations:{readOnlyHint:false, destructiveHint:true, openWorldHint:true}
    }, async args => executeTool(tool, args, target));
  }
  return server;
}
