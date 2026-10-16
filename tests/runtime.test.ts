import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importSpec, selectTools } from '../src/core/import.js';
import { executeTool, requestUrl, validateTarget } from '../src/runtime/http.js';
import { startMock } from '../src/mock/server.js';
import { probe } from '../src/studio/probe.js';
import type { Tool } from '../src/core/model.js';
const spec=importSpec(await readFile(new URL('../examples/pet-catalog.yaml',import.meta.url),'utf8'));
const list=spec.operations.find(o=>o.method==='GET'&&o.path==='/pets')!;
const manifest=selectTools(spec,[{id:list.id,name:list.name,description:list.description}]);
const tool=manifest.tools[0];
test('target configuration is mandatory, exact and blocks metadata/loopback escape',()=>{
  assert.throws(()=>validateTarget({}));
  for(const ip of ['169.254.169.254','100.100.100.200','127.0.0.1','0.0.0.0','::1','::ffff:127.0.0.1','fe80::1','224.0.0.1']) assert.throws(()=>validateTarget({mode:'api',baseUrl:'https://example.invalid',allowedAddresses:[ip]}));
  for(const baseUrl of ['http://127.0.0.2:4319','http://localhost:4319','http://127.0.0.1','http://127.0.0.1:4319/../a','http://127.0.0.1:4319/%2e%2e/a','http://user:secret@127.0.0.1:4319','http://127.0.0.1:4319?q=1']) assert.throws(()=>validateTarget({mode:'mock',baseUrl,allowedAddresses:['127.0.0.1']}));
  assert.equal(validateTarget({mode:'api',baseUrl:'https://10.1.2.3/v1',allowedAddresses:['10.1.2.3']}).mode,'api');
  assert.throws(()=>validateTarget({mode:'api',baseUrl:'http://10.1.2.3',allowedAddresses:['10.1.2.3']}));
});
test('path inputs are encoded, cannot traverse or change host, query inputs remain data',()=>{
  const op=spec.operations.find(o=>o.path==='/pets/{id}')!;const pet=selectTools(spec,[{id:op.id,name:op.name,description:op.description}]).tools[0];
  const target=validateTarget({mode:'mock',baseUrl:'http://127.0.0.1:4319/v1',allowedAddresses:['127.0.0.1']});
  for(const path_id of ['..','.','../health','%2e%2e','%252f','a\\b','//evil.invalid','a?x=1','a#b','a\n']) assert.throws(()=>requestUrl(pet,{path_id},target));
  assert.equal(requestUrl(pet,{path_id:'miso cat'},target).pathname,'/v1/pets/miso%20cat');
  const free={...tool,parameters:[{name:'q',inputName:'query_q',location:'query' as const,required:false,type:'string' as const,description:''}]};
  const url=requestUrl(free,{query_q:'https://evil.invalid/?a=1#x'},target);assert.equal(url.origin,'http://127.0.0.1:4319');assert.equal(url.searchParams.get('q'),'https://evil.invalid/?a=1#x');
});
test('real MCP initialize/list/call uses only selected tools and validates arguments',async()=>{
  const mock=await startMock();try {
    const ok=await probe(manifest,mock.target,tool.name,{query_status:'available'});assert.ok(ok.initialized);assert.deepEqual(ok.toolNames,[tool.name]);assert.equal(ok.result.isError,undefined);assert.match(JSON.stringify(ok.result),/Miso/);assert.doesNotMatch(JSON.stringify(ok.result),/Pixel/);
    await assert.rejects(()=>probe(manifest,mock.target,'check_health',{}),/not found/);
    const invalid=await probe(manifest,mock.target,tool.name,{query_status:'invalid'});assert.equal(invalid.result.isError,true);
  } finally {await mock.close();}
});
test('redirects, response limit, DNS mismatch, missing auth and timeout fail safely',async()=>{
  const mock=await startMock();try {
    for(const path of ['/redirect','/large','/missing','/slow']) {const result=await executeTool({...tool,path,parameters:[]},{},mock.target);assert.equal(result.isError,true,path);assert.doesNotMatch(result.content[0].text,/No fixture|xxxx/);}
    const mismatch=await executeTool(tool,{}, {...mock.target,allowedAddresses:['127.0.0.2']});assert.equal(mismatch.isError,true);
    const auth=await executeTool({...tool,auth:{kind:'bearer'}},{},mock.target,{});assert.equal(auth.isError,true);
  }finally{await mock.close();}
});
test('configured credentials are redacted from echoed success data and never printed',async()=>{
  const mock=await startMock();const logs:string[]=[];const original=console.error;console.error=(...x)=>{logs.push(x.join(' '));};
  try {const sentinel='test-secret-sentinel-12345';const result=await executeTool({...tool,path:'/secret',parameters:[],auth:{kind:'bearer'}},{},mock.target,{SPECWAKE_BEARER_TOKEN:sentinel});assert.doesNotMatch(JSON.stringify(result),new RegExp(sentinel));assert.match(JSON.stringify(result),/REDACTED/);assert.equal(logs.length,0);}finally{console.error=original;await mock.close();}
});
