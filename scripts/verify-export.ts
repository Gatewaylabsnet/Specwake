import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { importSpec, selectTools } from '../src/core/import.js';
import { exportPackage, ROOT } from '../src/studio/export.js';
import { validateManifest } from '../src/core/contracts.js';
import { startMock } from '../src/mock/server.js';

const started=Date.now();
await mkdir(resolve(ROOT,'.tmp'),{recursive:true});
const clean=await mkdtemp(resolve(ROOT,'.tmp/standalone-'));
const spec=importSpec(await readFile(resolve(ROOT,'examples/pet-catalog.yaml'),'utf8'));
const op=spec.operations.find(o=>o.path==='/pets'&&o.method==='GET')!;
let manifest=selectTools(spec,[{id:op.id,name:'catalog_pets',description:'Read the pet catalog.'}]);
const archive=process.argv[2] ? new Uint8Array(await readFile(resolve(ROOT,process.argv[2]))) : await exportPackage(manifest);
if (process.argv[2]) manifest=validateManifest(JSON.parse(new TextDecoder().decode(unzipSync(archive)['tools.json'])));
await mkdir(resolve(ROOT,'artifacts'),{recursive:true});
await writeFile(resolve(ROOT,'artifacts/specwake-server.zip'),archive);
for(const [path,data] of Object.entries(unzipSync(archive))){
  const dest=resolve(clean,path);assert.ok(dest.startsWith(clean+'\\')||dest.startsWith(clean+'/'));
  await mkdir(dirname(dest),{recursive:true});await writeFile(dest,data);
}
const exec=promisify(execFile);
const npmCli=process.env.npm_execpath || resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
console.error('Standalone verification: installing from the exported lockfile in an empty folder…');
await exec(process.execPath,[npmCli,'ci','--no-audit','--no-fund'],{cwd:clean,timeout:120000});
const isolatedRequire=createRequire(resolve(clean,'package.json'));
for(const dependency of ['@modelcontextprotocol/server','zod','typescript','@types/node/package.json']) assert.ok(isolatedRequire.resolve(dependency).startsWith(resolve(clean,'node_modules')),`${dependency} must resolve inside the exported package`);
console.error('Standalone verification: compiling only the exported source…');
await exec(process.execPath,[npmCli,'run','build'],{cwd:clean,timeout:60000});
const mock=await startMock();
const client=new Client({name:'specwake-clean-package-test',version:'1.0.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[resolve(clean,'dist/runtime/cli.js')],cwd:clean,stderr:'pipe'});
let stderr='';transport.stderr?.on('data',chunk=>{stderr+=chunk.toString();});
try {
  await writeFile(resolve(clean,'target.json'),JSON.stringify(mock.target));
  await client.connect(transport);
  const tools=await client.listTools();assert.deepEqual(tools.tools.map(t=>t.name),manifest.tools.map(t=>t.name));
  const testTool=manifest.tools.find(t=>t.path==='/pets')!;assert.ok(testTool);
  const result=await client.callTool({name:testTool.name,arguments:{query_status:'available'}});assert.ok(!result.isError);assert.match(JSON.stringify(result),/Miso/);assert.doesNotMatch(JSON.stringify(result),/Pixel/);
  await assert.rejects(()=>client.callTool({name:'check_health',arguments:{}}),/not found/);
  assert.equal(stderr,'');
  const report={passed:true,checks:['clean zip extraction','npm ci from exported lockfile','dependencies resolved inside clean package','standalone TypeScript build','MCP initialize','tools/list selection boundary','tools/call deterministic mock','unselected tool rejection','stdout protocol / empty stderr'],toolNames:tools.tools.map(t=>t.name),elapsedSeconds:Math.round((Date.now()-started)/1000),folder:clean};
  await writeFile(resolve(ROOT,'artifacts/export-verification.json'),JSON.stringify(report,null,2));
  console.error(JSON.stringify(report,null,2));
}finally{await client.close();await transport.close();await mock.close();}
