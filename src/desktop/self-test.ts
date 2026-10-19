import { writeFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import assert from 'node:assert/strict';
import { desktopWebPreferences, isDesktopUrl } from './policy.js';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { desktopPanelSelfTest } from './panel-self-test.js';

/** Packaged backend test; no DOM automation, remote debugging port or privileged renderer bridge. */
export async function desktopSelfTest(origin: string, reportPath: string, root: string) {
  const bundledRequire = createRequire(join(root,'package.json'));
  for (const dependency of ['@modelcontextprotocol/server','@modelcontextprotocol/client','zod','yaml','fflate']) assert.ok(bundledRequire.resolve(dependency).startsWith(root),`${dependency} must resolve inside the packaged resources`);
  const session = await (await fetch(`${origin}/api/session`)).json() as {token:string};
  async function post(action: string, data: unknown) {
    const response = await fetch(`${origin}/api/${action}`, {method:'POST',headers:{'Content-Type':'application/json','X-Specwake-Token':session.token},body:JSON.stringify(data)});
    assert.equal(response.status,200,`${action} must succeed`);
    return response;
  }
  const document = await (await post('sample',{})).json() as any;
  const operation = document.operations.find((op: any) => op.id === 'GET /pets');
  const selection = {documentId:document.documentId,selections:[{id:operation.id,name:'catalog_pets',description:operation.description}]};
  const preview = await (await post('preview',selection)).json() as any;
  assert.equal(preview.tools[0].name,'catalog_pets');
  const result = await (await post('test',{...selection,toolName:'catalog_pets',args:{query_status:'available'}})).json() as any;
  assert.equal(result.initialized,true);assert.deepEqual(result.toolNames,['catalog_pets']);assert.ok(!result.result.isError);assert.match(JSON.stringify(result.result),/Miso/);
  const archive = new Uint8Array(await (await post('export',selection)).arrayBuffer());
  const files = unzipSync(archive);
  assert.ok(files['src/runtime/cli.ts']);assert.ok(files['package-lock.json']);
  assert.ok(files['src/runtime/errors.ts']);assert.ok(files['ERROR_CODES.md']);
  await writeFile(reportPath.replace(/\.json$/i,'')+'-server.zip',archive);
  assert.equal(JSON.parse(strFromU8(files['tools.json'])).tools.length,1);
  const foreign = await fetch(`${origin}/api/session`,{headers:{Origin:'https://example.invalid'}});
  assert.equal(foreign.status,403);
  assert.equal(isDesktopUrl('https://example.invalid',origin),false);
  assert.equal(desktopWebPreferences.nodeIntegration,false);assert.equal(desktopWebPreferences.sandbox,true);
  const panel = await desktopPanelSelfTest(origin, post);
  await writeFile(reportPath,JSON.stringify({passed:true,packaged:true,electron:process.versions.electron,node:process.versions.node,checks:['management panel loaded in sandboxed BrowserWindow','dependencies resolved inside packaged resources','sample import','tool preview','bundled runtime MCP initialize/list/call','deterministic mock response','standalone ZIP export from bundled resources','foreign origin rejected','renderer sandbox / no Node integration','bundled separate-process HTTP MCP client without Node/npm','real HTTP success/error/delay/selection boundary','MCP stop closes listener'],origin,...panel},null,2));
}
