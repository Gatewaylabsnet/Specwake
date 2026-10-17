import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProbeReceipt,sameProbeReceipt,probeViewKey,currentProbe } from '../src/core/probe-context.js';
import type { Manifest } from '../src/core/model.js';
const manifest:Manifest={version:1,tools:[{operationId:'GET /pets',method:'GET',path:'/pets',name:'pets',description:'Fixture',parameters:[],auth:{kind:'none'}}]};
const selections=[{id:'GET /pets',name:'pets',description:'Fixture'}];
test('mock receipt binds document, full manifest, selected tool and arguments',async()=>{
  const receipt=await makeProbeReceipt('doc1',manifest,'pets',{q:1});
  assert.equal(sameProbeReceipt(receipt,await makeProbeReceipt('doc1',manifest,'pets',{q:1})),true);
  for(const changed of [await makeProbeReceipt('doc2',manifest,'pets',{q:1}),await makeProbeReceipt('doc1',{...manifest,tools:[{...manifest.tools[0],description:'Edited'}]},'pets',{q:1}),await makeProbeReceipt('doc1',manifest,'other',{q:1}),await makeProbeReceipt('doc1',manifest,'pets',{q:2})]) assert.equal(sameProbeReceipt(receipt,changed),false);
  assert.match(receipt.manifestHash,/^[a-f0-9]{64}$/);assert.match(receipt.argumentsHash,/^[a-f0-9]{64}$/);
});
test('navigation, default-argument refresh, selections, edits and late completions cannot reuse a pass',()=>{
  const key=probeViewKey('doc1',selections,'pets','{}');const stored={key,epoch:1,response:{passed:true}};
  assert.ok(currentProbe(stored,key,1));
  // Returning back and then to identical inputs still increments the epoch.
  assert.equal(currentProbe(stored,key,2),undefined);
  for(const changed of [probeViewKey('doc2',selections,'pets','{}'),probeViewKey('doc1',[],'pets','{}'),probeViewKey('doc1',[{...selections[0],name:'edited'}],'edited','{}'),probeViewKey('doc1',selections,'other','{}'),probeViewKey('doc1',selections,'pets','{ }')]) assert.equal(currentProbe(stored,changed,1),undefined);
  // A request begun before an edit must not reappear even if it completes later.
  assert.equal(currentProbe(stored,key,3),undefined);
});
