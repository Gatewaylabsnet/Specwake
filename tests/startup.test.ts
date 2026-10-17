import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('runtime startup errors are stable stderr diagnostics and never contaminate MCP stdout',async()=>{
  const root=await mkdtemp(join(tmpdir(),'specwake-startup-'));
  const manifest={version:1,tools:[{operationId:'GET /pets',method:'GET',path:'/pets',name:'pets',description:'Fixture',parameters:[],auth:{kind:'none'}}]};
  const target={mode:'api',baseUrl:'https://agent1',allowedAddresses:['10.42.0.8'],allowInsecureHttp:false};
  const scenarios=[
    {code:'SW_MANIFEST_FILE',manifest:undefined,target:undefined},
    {code:'SW_MANIFEST_INVALID',manifest:'{"secret":"fake-sensitive-value",',target:JSON.stringify(target)},
    {code:'SW_TARGET_FILE',manifest:JSON.stringify(manifest),target:undefined},
    {code:'SW_TARGET_FILE',manifest:JSON.stringify(manifest),target:'not-json fake-sensitive-value'},
    {code:'SW_TARGET_INVALID',manifest:JSON.stringify(manifest),target:JSON.stringify({...target,baseUrl:'https://fake-sensitive-value@agent1?query=fake-sensitive-value'})},
    {code:'SW_MANIFEST_INVALID',manifest:JSON.stringify({version:1,tools:[]}),target:JSON.stringify(target)}
  ];
  try {for(const [index,scenario] of scenarios.entries()) {
    const cwd=join(root,String(index));await (await import('node:fs/promises')).mkdir(cwd);
    if(scenario.manifest!==undefined)await writeFile(join(cwd,'tools.json'),scenario.manifest);
    if(scenario.target!==undefined)await writeFile(join(cwd,'target.json'),scenario.target);
    try {await promisify(execFile)(process.execPath,[resolve('dist/runtime/runtime/cli.js')],{cwd,timeout:10000,env:{...process.env,SPECWAKE_BEARER_TOKEN:'fake-sensitive-value'}});assert.fail('Startup should fail.');}
    catch(error) {const result=error as {code:number;stdout:string;stderr:string};assert.equal(result.code,1);assert.equal(result.stdout,'');const diagnostic=JSON.parse(result.stderr).error;assert.equal(diagnostic.code,scenario.code);assert.ok(diagnostic.hint);assert.doesNotMatch(result.stderr,/fake-sensitive-value|https:|Authorization|node:internal/);}
  }}finally{await rm(root,{recursive:true,force:true});}
});
