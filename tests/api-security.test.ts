import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { executeTool, MAX_RESPONSE, TIMEOUT_MS } from '../src/runtime/http.js';
import type { Tool } from '../src/core/model.js';
import type { ErrorCode, ExecutionResult } from '../src/runtime/errors.js';

const TEST_IP = '10.42.0.8';
const FAKE_BEARER = 'fixture-only-bearer-not-a-real-secret';
const FAKE_KEY = 'fixture-only-api-key-not-a-real-secret';
const [key,cert,ca] = await Promise.all(['agent1-key.pem','agent1-cert.pem','ca1-cert.pem'].map(name => readFile(new URL(`fixtures/tls/${name}`,import.meta.url))));
const tool: Tool = {operationId:'GET /anonymous',method:'GET',path:'/anonymous',name:'fixture',description:'Isolated test',parameters:[],auth:{kind:'none'}};
const apiTarget = (port=443,hostname='agent1') => ({mode:'api',baseUrl:`https://${hostname}:${port}/v1`,allowedAddresses:[TEST_IP],allowInsecureHttp:false});
function expectCode(result: ExecutionResult, code: ErrorCode) {
  assert.equal(result.isError,true);assert.equal(result.structuredContent?.error.code,code);assert.match(result.content[0].text,new RegExp(code));assert.ok(result.structuredContent?.error.hint);
  assert.doesNotMatch(JSON.stringify(result),/fixture-only-bearer-not-a-real-secret|fixture-only-api-key-not-a-real-secret|sensitive-query|raw-failure-body/);
}

/** Only this test shim maps a validated synthetic private IP to our loopback fixture.
 * The production target is still API + HTTPS, its production DNS/allowlist branch runs,
 * TLS rejectUnauthorized stays true, and no real DNS, remote API or trust-store change occurs. */
async function fixture(t: TestContext, options: {trust?:boolean;hostname?:string} = {}) {
  let received = 0;
  const server = https.createServer({key,cert},(request,response) => {
    received++;
    const route = new URL(request.url!,'https://agent1').pathname;
    response.setHeader('Content-Type','application/json');
    const fail = (status:number) => {response.writeHead(status);response.end('raw-failure-body with sensitive headers must never be returned');};
    if(route === '/v1/bearer' && request.headers.authorization !== `Bearer ${FAKE_BEARER}`) return fail(401);
    if(route === '/v1/key' && request.headers['x-api-key'] !== FAKE_KEY) return fail(403);
    if(route === '/v1/rate') return fail(429);
    if(route === '/v1/redirect') {response.writeHead(302,{Location:'https://unconfigured.invalid/?sensitive-query=1'});response.end();return;}
    if(route === '/v1/large') {response.end('x'.repeat(MAX_RESPONSE+1));return;}
    if(route === '/v1/slow') {const timer=setTimeout(()=>response.end('{}'),TIMEOUT_MS+1000);response.once('close',()=>clearTimeout(timer));return;}
    response.end(JSON.stringify({ok:true,authorization:request.headers.authorization,key:request.headers['x-api-key']}));
  });
  server.on('tlsClientError',()=>{});
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
  const port=(server.address() as {port:number}).port;
  let resolutions=0, connections=0;
  t.mock.method(dns,'lookup',async()=>{resolutions++;return [{address:TEST_IP,family:4}];});
  const nativeRequest=https.request;
  t.mock.method(https,'request',((url:URL,requestOptions:any,callback:any)=>{
    assert.equal(url.hostname,options.hostname ?? 'agent1');assert.equal(Number(url.port),port);assert.equal(requestOptions.rejectUnauthorized,true);assert.equal(requestOptions.agent,false);
    connections++;
    return nativeRequest(url,{...requestOptions,ca:options.trust === false ? undefined : ca,
      lookup:(hostname:string,lookupOptions:{all?:boolean},done:Function)=>requestOptions.lookup(hostname,lookupOptions,(error:Error|null,address:string|{address:string;family:number}[],family:number)=>{
        assert.ifError(error);const pinned=Array.isArray(address)?address[0]:{address,family};assert.equal(pinned.address,TEST_IP);assert.equal(pinned.family,4);
        if(lookupOptions.all)done(null,[{address:'127.0.0.1',family:4}]);else done(null,'127.0.0.1',4);
      })
    },callback);
  }) as typeof https.request);
  return {target:apiTarget(port,options.hostname),received:()=>received,resolutions:()=>resolutions,connections:()=>connections};
}

test('API DNS mismatch reaches the DNS policy branch and never opens a connection',async t=>{
  let lookups=0,requests=0;
  t.mock.method(dns,'lookup',async()=>{lookups++;return [{address:'10.42.0.99',family:4}];});
  t.mock.method(https,'request',(()=>{requests++;throw new Error('Network must not be reached.');}) as typeof https.request);
  const result=await executeTool(tool,{},apiTarget());
  expectCode(result,'SW_DNS_MISMATCH');assert.equal(lookups,1);assert.equal(requests,0);
});
test('all DNS answers must be configured, including mixed and empty answers',async t=>{
  let requests=0;t.mock.method(https,'request',(()=>{requests++;throw new Error('DNS policy must reject before any socket.');}) as typeof https.request);
  const lookup=t.mock.method(dns,'lookup',async()=>[{address:TEST_IP,family:4},{address:'169.254.169.254',family:4}]);
  expectCode(await executeTool(tool,{},apiTarget()),'SW_DNS_MISMATCH');
  lookup.mock.mockImplementation(async()=>[]);expectCode(await executeTool(tool,{},apiTarget()),'SW_DNS_MISMATCH');
  assert.equal(requests,0);
});
test('API anonymous HTTPS success uses the validated pinned address exactly once',async t=>{
  const f=await fixture(t);const result=await executeTool(tool,{},f.target);
  assert.ok(!result.isError);assert.match(result.content[0].text,/"ok":true/);assert.equal(f.resolutions(),1);assert.equal(f.connections(),1);assert.equal(f.received(),1);
});
test('API Bearer succeeds, redacts echoes, and wrong fake credential yields 401 without raw data',async t=>{
  const f=await fixture(t);const bearer={...tool,path:'/bearer',auth:{kind:'bearer' as const}};
  const result=await executeTool(bearer,{},f.target,{SPECWAKE_BEARER_TOKEN:FAKE_BEARER});assert.ok(!result.isError);assert.match(result.content[0].text,/REDACTED/);assert.doesNotMatch(result.content[0].text,new RegExp(FAKE_BEARER));
  expectCode(await executeTool(bearer,{},f.target,{SPECWAKE_BEARER_TOKEN:'fake-wrong-bearer'}),'SW_HTTP_UNAUTHORIZED');
});
test('API X-* key succeeds and wrong fake credential yields 403; anonymous cannot impersonate auth',async t=>{
  const f=await fixture(t);const keyed={...tool,path:'/key',auth:{kind:'apiKey' as const,header:'X-API-Key'}};
  const result=await executeTool(keyed,{},f.target,{SPECWAKE_API_KEY:FAKE_KEY});assert.ok(!result.isError);assert.match(result.content[0].text,/REDACTED/);assert.doesNotMatch(result.content[0].text,new RegExp(FAKE_KEY));
  expectCode(await executeTool(keyed,{},f.target,{SPECWAKE_API_KEY:'fake-wrong-key'}),'SW_HTTP_FORBIDDEN');
  expectCode(await executeTool({...tool,path:'/bearer'},{},f.target),'SW_HTTP_UNAUTHORIZED');
  expectCode(await executeTool({...tool,path:'/key'},{},f.target),'SW_HTTP_FORBIDDEN');
});
test('missing/invalid credential and parameter failures happen before DNS or network',async t=>{
  let lookups=0;t.mock.method(dns,'lookup',async()=>{lookups++;throw new Error('must not resolve');});
  expectCode(await executeTool({...tool,auth:{kind:'bearer'}},{},apiTarget(),{}),'SW_CREDENTIAL_MISSING');
  expectCode(await executeTool({...tool,auth:{kind:'apiKey',header:'X-Key'}},{},apiTarget(),{SPECWAKE_API_KEY:'fake\r\nheader'}),'SW_CREDENTIAL_INVALID');
  expectCode(await executeTool(tool,{url:'https://unconfigured.invalid/?sensitive-query=1'},apiTarget()),'SW_PARAMETER_INVALID');assert.equal(lookups,0);
  for(const forbiddenOptions of [{allowLoopback:true},{rejectUnauthorized:false},{ca:'fake-test-ca'}]) expectCode(await executeTool(tool,{}, {...apiTarget(),...forbiddenOptions}),'SW_TARGET_INVALID');
  expectCode(await executeTool(tool,{}, {...apiTarget(),baseUrl:'https://127.0.0.1',allowedAddresses:['127.0.0.1']}),'SW_TARGET_FORBIDDEN');assert.equal(lookups,0);
});
test('TLS rejects an untrusted chain and a hostname mismatch with verification enabled',async t=>{
  await t.test('untrusted CA',async child=>{const f=await fixture(child,{trust:false});expectCode(await executeTool(tool,{},f.target),'SW_TLS_FAILED');assert.equal(f.received(),0);});
  await t.test('wrong certificate hostname',async child=>{const f=await fixture(child,{hostname:'wrong-agent'});expectCode(await executeTool(tool,{},f.target),'SW_TLS_FAILED');assert.equal(f.received(),0);});
});
test('API redirect, rate limit, response-size cap and deadline retain distinct safe codes',async t=>{
  const f=await fixture(t);
  for(const [path,code] of [['/redirect','SW_REDIRECT_BLOCKED'],['/rate','SW_HTTP_RATE_LIMITED'],['/large','SW_RESPONSE_TOO_LARGE'],['/slow','SW_TIMEOUT']] as const) expectCode(await executeTool({...tool,path},{},f.target),code);
  assert.equal(f.connections(),4);assert.equal(f.received(),4);
});
test('DNS failure/deadline and network refusal have distinct safe codes and no logging',async t=>{
  const logs:string[]=[];t.mock.method(console,'error',(...parts:unknown[])=>{logs.push(parts.join(' '));});t.mock.method(console,'log',(...parts:unknown[])=>{logs.push(parts.join(' '));});
  const lookup=t.mock.method(dns,'lookup',(async()=>{throw Object.assign(new Error('sensitive-query and raw-failure-body'),{code:'ENOTFOUND'});}) as typeof dns.lookup);
  expectCode(await executeTool(tool,{},apiTarget()),'SW_DNS_RESOLUTION_FAILED');
  lookup.mock.mockImplementation((()=>new Promise<never>(()=>{})) as typeof dns.lookup);expectCode(await executeTool(tool,{},apiTarget()),'SW_TIMEOUT');
  lookup.mock.mockImplementation((async()=>[{address:TEST_IP,family:4}]) as unknown as typeof dns.lookup);
  t.mock.method(https,'request',(()=>{throw Object.assign(new Error('raw-failure-body'),{code:'ECONNREFUSED'});}) as typeof https.request);
  expectCode(await executeTool(tool,{},apiTarget()),'SW_NETWORK_FAILED');assert.deepEqual(logs,[]);
});
