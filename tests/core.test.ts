import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importSpec, MAX_BYTES, selectTools } from '../src/core/import.js';
import { inputSchema, toolSchema } from '../src/core/contracts.js';

const source = await readFile(new URL('../examples/pet-catalog.yaml',import.meta.url),'utf8');
const document = (extra: Record<string,unknown> = {}) => ({openapi:'3.0.3',info:{title:'Test',version:'1'},paths:{'/pets':{get:{responses:{'200':{description:'OK'}}}}},...extra});
const parse = (value: unknown) => importSpec(JSON.stringify(value));
test('valid JSON/YAML imports; local refs resolve and no operations are implicitly selected',()=>{
  const spec = importSpec(source);
  assert.equal(spec.operations.length,5);
  assert.equal(spec.operations.filter(o=>!o.issues.length).length,3);
  assert.equal(spec.operations.find(o=>o.path==='/pets/{id}')?.parameters[0].name,'id');
  assert.throws(()=>selectTools(spec,[]),/manifest/i);
  assert.equal(parse(document()).version,'3.0.3');
});
test('malformed, ambiguous YAML, unsupported versions and missing structures fail',()=>{
  for(const input of ['{}','[invalid','a: 1\na: 2','x: &x [a]\ny: *x','a: !!js/function test',JSON.stringify(document({openapi:'2.0'})),JSON.stringify(document({openapi:'3.2.0'})),JSON.stringify(document({paths:null}))]) assert.throws(()=>importSpec(input));
});
test('external refs never resolve; broken refs, cycles and ref siblings fail',()=>{
  for(const ref of ['https://example.invalid/a','#missing','other.yaml#/x','#/missing']) assert.throws(()=>parse(document({components:{schemas:{A:{$ref:ref}}}})),/reference/i);
  assert.throws(()=>parse(document({components:{schemas:{A:{$ref:'#/components/schemas/A'}}}})),/Cyclic/);
  assert.throws(()=>parse(document({components:{schemas:{A:{type:'string'},B:{$ref:'#/components/schemas/A',description:'override'}}}})),/siblings/);
});
test('document bytes, depth, node count and reference expansion are bounded',()=>{
  assert.throws(()=>importSpec(' '.repeat(MAX_BYTES+1)),/1 MiB/);
  let deep:any='end';for(let i=0;i<45;i++)deep={child:deep};
  assert.throws(()=>parse(document({deep})),/depth/);
  assert.throws(()=>parse(document({many:Array(30001).fill(1)})),/structure/);
  assert.throws(()=>parse(document({components:{schemas:{A:{type:'string'}}},many:Array(2001).fill({$ref:'#/components/schemas/A'})})),/2,000/);
  assert.throws(()=>parse(document({components:{schemas:{A:{items:Array(100).fill(1)}}},many:Array(600).fill({$ref:'#/components/schemas/A'})})),/60,000/);
});
test('tool names are stable, unique, editable and collision checked',()=>{
  const spec=importSpec(source);assert.deepEqual(spec.operations.map(o=>o.name),importSpec(source).operations.map(o=>o.name));
  const supported=spec.operations.filter(o=>!o.issues.length);
  assert.equal(new Set(supported.map(o=>o.name)).size,supported.length);
  const selected=supported.slice(0,2).map(o=>({id:o.id,name:o.name,description:o.description}));
  assert.equal(selectTools(spec,[{...selected[0],name:'my_pets',description:'My description'}]).tools[0].name,'my_pets');
  assert.throws(()=>selectTools(spec,selected.map(s=>({...s,name:'same'}))),/unique/);
  assert.throws(()=>selectTools(spec,[{...selected[0],name:'../escape'}]),/manifest/i);
  assert.throws(()=>selectTools(spec,[selected[0],selected[0]]));
});
test('unsupported methods, schema constraints, serialization and auth stay visible but unselectable',()=>{
  const spec=importSpec(source);
  for(const op of spec.operations.filter(o=>o.issues.length)) assert.throws(()=>selectTools(spec,[{id:op.id,name:op.name,description:op.description}]),/unsupported/);
  for(const schema of [{type:'string',format:'uuid'},{type:'array',items:{type:'string'}},{type:'string',minLength:2},{type:'string',nullable:true},{type:'string',enum:[2]},{type:'string',enum:null},{type:'string',enum:[]}]) {
    const s=parse(document({paths:{'/pets':{get:{parameters:[{name:'q',in:'query',schema}],responses:{'200':{description:'ok'}}}}}}));assert.ok(s.operations[0].issues.length);
  }
  const auth=parse(document({security:[{oauth:[]}],components:{securitySchemes:{oauth:{type:'oauth2'}}}}));assert.match(auth.operations[0].issues.join(),/OAuth/);
});
test('required, scalar type, enum and unknown argument validation; enum appears in preview',()=>{
  const spec=importSpec(source);const ops=spec.operations.filter(o=>!o.issues.length);const manifest=selectTools(spec,ops.map(o=>({id:o.id,name:o.name,description:o.description})));
  const get=manifest.tools.find(t=>t.path==='/pets/{id}')!;assert.throws(()=>toolSchema(get).parse({}));assert.throws(()=>toolSchema(get).parse({path_id:1}));
  const list=manifest.tools.find(t=>t.path==='/pets')!;assert.throws(()=>toolSchema(list).parse({query_status:'unknown'}));assert.throws(()=>toolSchema(list).parse({url:'http://evil.invalid'}));
  assert.deepEqual(toolSchema(list).parse({query_status:'available'}),{query_status:'available'});
  assert.deepEqual((inputSchema(list).properties as any).query_status.enum,['available','adopted']);
});
test('path placeholder consistency and unsafe literal paths are blocked',()=>{
  for(const path of ['//evil.invalid/a','/../a','/a/%2e%2e','/a\\b','/pets/{id}','/part{id}']) {
    const spec=parse(document({paths:{[path]:{get:{responses:{'200':{description:'ok'}}}}}}));assert.ok(spec.operations[0].issues.length,path);
  }
});
test('integer, number, boolean and single-value enums enforce their actual types',()=>{
  for(const [type,value,bad] of [['integer',3,3.5],['number',2.5,'2.5'],['boolean',true,'true']] as const) {
    const spec=parse(document({paths:{'/pets':{get:{parameters:[{name:'value',in:'query',required:true,schema:{type}}],responses:{'200':{description:'ok'}}}}}}));
    const op=spec.operations[0];const tool=selectTools(spec,[{id:op.id,name:op.name,description:op.description}]).tools[0];
    assert.deepEqual(toolSchema(tool).parse({query_value:value}),{query_value:value});assert.throws(()=>toolSchema(tool).parse({query_value:bad}));assert.throws(()=>toolSchema(tool).parse({}));
  }
  const one=parse(document({paths:{'/pets':{get:{parameters:[{name:'q',in:'query',schema:{type:'string',enum:['one']}}],responses:{'200':{description:'ok'}}}}}}));
  const op=one.operations[0];const tool=selectTools(one,[{id:op.id,name:op.name,description:op.description}]).tools[0];
  assert.deepEqual(toolSchema(tool).parse({query_q:'one'}),{query_q:'one'});assert.throws(()=>toolSchema(tool).parse({query_q:'two'}));assert.ok(inputSchema(tool));
});
test('inherited auth is preserved and operations can explicitly opt out',()=>{
  const spec=parse(document({security:[{token:[]}],components:{securitySchemes:{token:{type:'http',scheme:'bearer'}}}}));assert.equal(spec.operations[0].auth.kind,'bearer');assert.equal(spec.operations[0].issues.length,0);
  const key=parse(document({security:[{key:[]}],components:{securitySchemes:{key:{type:'apiKey',in:'header',name:'X-API-Key'}}}}));assert.deepEqual(key.operations[0].auth,{kind:'apiKey',header:'X-API-Key'});
  const anonymous=parse(document({security:[{token:[]}],paths:{'/pets':{get:{security:[],responses:{'200':{description:'ok'}}}}}}));assert.equal(anonymous.operations[0].auth.kind,'none');
  const invalid=parse(document({security:null}));assert.match(invalid.operations[0].issues.join(),/security must be an array/);
});
