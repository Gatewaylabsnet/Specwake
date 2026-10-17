import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server.js';
import { RuntimeFault, safeDiagnostic } from './errors.js';
async function readConfiguration(path: string, kind: 'manifest'|'target') {
  let source: string;
  try { source = await readFile(path,'utf8'); }
  catch {throw new RuntimeFault(kind === 'manifest' ? 'SW_MANIFEST_FILE' : 'SW_TARGET_FILE');}
  try {return JSON.parse(source);}
  catch {throw new RuntimeFault(kind === 'manifest' ? 'SW_MANIFEST_INVALID' : 'SW_TARGET_FILE');}
}
try {
  const manifest = await readConfiguration(resolve('tools.json'),'manifest');
  const target = await readConfiguration(resolve(process.env.SPECWAKE_TARGET_FILE || 'target.json'),'target');
  const server = createMcpServer(manifest, target);
  await serveStdio(() => server);
} catch (error) {
  console.error(JSON.stringify({error:safeDiagnostic(error,'SW_STARTUP_FAILED')}));
  process.exitCode = 1;
}
