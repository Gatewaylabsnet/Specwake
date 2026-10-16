import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startStudio, checkBrowserRequest } from '../src/studio/server.js';
import { unzipSync, strFromU8 } from 'fflate';
test('origin, host, fetch metadata and CSRF checks protect loopback management',()=>{
  const origin='http://127.0.0.1:4318';
  const check=(headers:any,method='POST')=>checkBrowserRequest({headers,method},origin,'test-token');
  assert.equal(check({host:'127.0.0.1:4318',origin,'x-specwake-token':'test-token'}),true);
  assert.equal(check({host:'127.0.0.1:4318',origin:'https://evil.invalid','x-specwake-token':'test-token'}),false);
  assert.equal(check({host:'evil.invalid:4318','x-specwake-token':'test-token'}),false);
  assert.equal(check({host:'127.0.0.1:4318'}),false);
  assert.equal(check({host:'127.0.0.1:4318','sec-fetch-site':'cross-site'},'GET'),false);
});
test('HTTP flow imports, reviews, tests and exports; forged operations and foreign origins fail',async()=>{
  const studio=await startStudio(4320);const base='http://127.0.0.1:4320';
  try {
    assert.equal((await fetch(base)).status,200);
    const token=(await(await fetch(`${base}/api/session`)).json()).token;
    const post=(path:string,data:any,extra:Record<string,string>={})=>fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Specwake-Token':token,...extra},body:JSON.stringify(data)});
    assert.equal((await post('sample',{}, {Origin:'https://evil.invalid'})).status,403);
    assert.equal((await fetch(`${base}/api/sample`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    const doc=await(await post('sample',{})).json();const op=doc.operations.find((o:any)=>o.path==='/pets'&&o.method==='GET');
    const data={documentId:doc.documentId,selections:[{id:op.id,name:'catalog_pets',description:'Pet catalog lookup'}]};
    assert.equal((await post('preview',{...data,selections:[{id:'GET https://evil.invalid',name:'escape',description:'x'}]})).status,400);
    const preview=await(await post('preview',data)).json();assert.equal(preview.tools[0].name,'catalog_pets');
    const probe=await(await post('test',{...data,toolName:'catalog_pets',args:{}})).json();assert.ok(probe.initialized);assert.match(JSON.stringify(probe.result),/Miso/);
    process.env.SPECWAKE_BEARER_TOKEN='export-must-never-contain-this-secret';
    const response=await post('export',data);assert.equal(response.status,200);const files=unzipSync(new Uint8Array(await response.arrayBuffer()));
    assert.ok(files['package-lock.json']);assert.ok(files['src/runtime/cli.ts']);assert.equal(files['target.json'],undefined);
    for(const [path,bytes]of Object.entries(files)){assert.ok(!path.includes('..')&&!path.startsWith('/'));assert.doesNotMatch(strFromU8(bytes),/export-must-never-contain-this-secret|C:\\Projects/);}
    assert.equal(JSON.parse(strFromU8(files['tools.json'])).tools.length,1);
  }finally{delete process.env.SPECWAKE_BEARER_TOKEN;await studio.close();}
});
