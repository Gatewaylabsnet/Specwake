import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { Manifest } from '../core/model.js';
import { ROOT } from './export.js';
import { mkdir } from 'node:fs/promises';
import { errorResult, RuntimeFault } from '../runtime/errors.js';

export interface ProbeOptions { root?: string; runtimeRoot?: string; tempRoot?: string; runtimeEnv?: Record<string,string>; }
export async function probe(manifest: Manifest, target: unknown, toolName: string, args: unknown, options: ProbeOptions = {}) {
  const root = options.root ?? ROOT;
  const tempRoot = options.tempRoot ?? resolve(ROOT,'.tmp');
  await mkdir(tempRoot,{recursive:true});
  const cwd = await mkdtemp(join(tempRoot,'probe-'));
  const client = new Client({name:'specwake-studio',version:'0.2.0'});
  const transport = new StdioClientTransport({command:process.execPath,args:[resolve(options.runtimeRoot ?? root,'dist/runtime/runtime/cli.js')],cwd,stderr:'pipe',env:{...options.runtimeEnv,SPECWAKE_BEARER_TOKEN:'mock-only-fake-token',SPECWAKE_API_KEY:'mock-only-fake-key'}});
  try {
    await writeFile(join(cwd,'tools.json'),JSON.stringify(manifest));
    await writeFile(join(cwd,'target.json'),JSON.stringify(target));
    await client.connect(transport);
    const list = await client.listTools();
    let result = await client.callTool({name:toolName,arguments:args as Record<string,unknown>});
    if (result.isError && JSON.stringify(result.content).includes('[SW_PARAMETER_INVALID]')) result = errorResult(new RuntimeFault('SW_PARAMETER_INVALID'));
    return {initialized:true,toolNames:list.tools.map(t => t.name),result};
  } finally { await client.close(); await transport.close(); await rm(cwd,{recursive:true,force:true}); }
}
