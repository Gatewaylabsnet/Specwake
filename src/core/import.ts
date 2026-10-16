import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import { validateManifest, validatePath } from './contracts.js';
import type { Auth, ImportedSpec, Operation, Parameter, Selection, Manifest } from './model.js';

export const MAX_BYTES = 1024 * 1024;
type Obj = Record<string, any>;
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
function fail(message: string): never { throw new Error(message); }
function text(v: unknown, max = 2000): string { return typeof v === 'string' ? v.slice(0, max) : ''; }

export function importSpec(source: string): ImportedSpec {
  if (Buffer.byteLength(source) > MAX_BYTES) fail('Document exceeds the 1 MiB limit.');
  let root: any;
  try {
    const doc = parseDocument(source, { schema: 'core', uniqueKeys: true, customTags: [], strict: true });
    if (doc.errors.length || doc.warnings.length) fail('Invalid YAML/JSON.');
    root = doc.toJS({ maxAliasCount: 0 });
  } catch { fail('Invalid JSON/YAML. Duplicate keys, custom tags and YAML aliases are not supported.'); }
  let nodes = 0;
  function inspect(v: any, depth: number) {
    if (depth > 40 || ++nodes > 30000) fail('Document exceeds depth (40) or structure (30,000 nodes) limits.');
    if (!v || typeof v !== 'object') return;
    for (const [k, value] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(k)) fail('Unsafe object key in document.');
      if (k === '$ref' && (typeof value !== 'string' || !value.startsWith('#/'))) fail('Only document-local #/ references are supported; external references are never fetched.');
      inspect(value, depth + 1);
    }
  }
  inspect(root, 0);
  if (!object(root) || typeof root.openapi !== 'string' || !/^3\.(0|1)\.\d+$/.test(root.openapi)) fail('Supported versions: OpenAPI 3.0.x and 3.1.x.');
  if (!object(root.info) || typeof root.info.title !== 'string' || typeof root.info.version !== 'string' || !object(root.paths)) fail('OpenAPI requires info.title, info.version and paths.');
  let refs = 0;
  let expanded = 0;
  function resolve(v: any, trail: string[] = [], depth = 0): any {
    if (++expanded > 60000) fail('Reference expansion exceeds 60,000 nodes.');
    if (depth > 40) fail('Reference expansion exceeds depth 40.');
    if (!v || typeof v !== 'object') return v;
    if (typeof v.$ref === 'string') {
      if (++refs > 2000) fail('Reference expansion exceeds 2,000 references.');
      if (trail.includes(v.$ref)) fail('Cyclic document reference is not supported.');
      if (Object.keys(v).some(k => k !== '$ref')) fail('$ref siblings are not supported in this MVP.');
      let target: any = root;
      for (const piece of v.$ref.slice(2).split('/')) {
        const key = piece.replace(/~1/g, '/').replace(/~0/g, '~');
        if (!object(target) && !Array.isArray(target) || !Object.hasOwn(target, key)) fail('Unresolved document reference.');
        target = (target as any)[key];
      }
      return resolve(target, [...trail, v.$ref], depth + 1);
    }
    if (Array.isArray(v)) return v.map(x => resolve(x, trail, depth + 1));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, trail, depth + 1)]));
  }
  root = resolve(root);
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(root.paths)) {
    if (!object(item)) fail('Each path item must be an object.');
    for (const method of ['get','post','put','patch','delete','head','options','trace']) {
      if (!Object.hasOwn(item, method)) continue;
      if (operations.length >= 200) fail('Document exceeds 200 operations.');
      const raw = item[method];
      if (!object(raw)) fail('Each operation must be an object.');
      const issues: string[] = [];
      const parameters: Parameter[] = [];
      if (method !== 'get') issues.push('Only GET operations can be published in this MVP.');
      if (!object(raw.responses) || !Object.keys(raw.responses).length) issues.push('Operation must declare responses.');
      if (raw.requestBody) issues.push('Request bodies are not supported.');
      const combined = new Map<string, any>();
      for (const list of [item.parameters ?? [], raw.parameters ?? []]) {
        if (!Array.isArray(list)) { issues.push('Parameters must be an array.'); continue; }
        const seen = new Set<string>();
        for (const p of list) {
          if (!object(p)) { issues.push('Invalid parameter.'); continue; }
          const key = `${p.in}:${p.name}`;
          if (seen.has(key)) issues.push('Duplicate parameter in the same scope.');
          seen.add(key); combined.set(key, p);
        }
      }
      for (const p of combined.values()) {
        try { parameters.push(readParameter(p)); } catch (e) { issues.push(`${text(p.name, 60) || 'Parameter'}: ${(e as Error).message}`); }
      }
      try { validatePath(path, parameters); } catch (e) { issues.push((e as Error).message); }
      let auth: Auth = { kind: 'none' };
      try { auth = readAuth(raw.security !== undefined ? raw.security : root.security !== undefined ? root.security : [], root.components?.securitySchemes ?? {}); } catch (e) { issues.push((e as Error).message); }
      const id = `${method.toUpperCase()} ${path}`;
      const hash = createHash('sha256').update(id).digest('hex').slice(0, 10);
      const stem = (text(raw.operationId) || `${method}_${path}`).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 46) || 'operation';
      const name = `${/^[A-Za-z]/.test(stem) ? stem : `op_${stem}`}_${hash}`;
      operations.push({ id, method: method.toUpperCase(), path, name, description: text(raw.description) || text(raw.summary) || id, parameters, auth, issues });
    }
  }
  if (!operations.length) fail('No operations were found.');
  // Resolve even a truncated-hash collision deterministically within this document.
  for (const op of operations) {
    const collisions = operations.filter(other => other.name === op.name).sort((a,b) => a.id.localeCompare(b.id));
    if (collisions.length > 1) collisions.forEach((other,index) => {other.name = `${other.name}_${index+1}`;});
  }
  return { title: text(root.info.title, 120), version: root.openapi, operations };
}

function readParameter(p: Obj): Parameter {
  if (!['path','query'].includes(p.in)) fail('Only path/query parameters are supported.');
  if (typeof p.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(p.name)) fail('Use a simple alphanumeric parameter name.');
  if (p.required !== undefined && typeof p.required !== 'boolean') fail('required must be boolean.');
  if (p.in === 'path' && p.required !== true) fail('Path parameters must be required.');
  if (p.content || p.allowReserved || p.allowEmptyValue || p.deprecated) fail('content, allowReserved, allowEmptyValue and deprecated are unsupported.');
  if ((p.style === undefined ? (p.in === 'query' ? 'form' : 'simple') : p.style) !== (p.in === 'query' ? 'form' : 'simple') || (p.explode !== undefined && p.explode !== (p.in === 'query'))) fail('Only query form/explode=true and path simple/explode=false are supported.');
  const s = p.schema;
  if (!object(s) || !['string','integer','number','boolean'].includes(s.type)) fail('Only scalar string/integer/number/boolean schemas are supported.');
  if (Object.keys(s).some(k => !['type','enum','description','title'].includes(k))) fail('Schema feature unsupported; only type, enum, description and title are supported.');
  if (Object.hasOwn(s,'enum') && (!Array.isArray(s.enum) || !s.enum.length || s.enum.length > 100 || s.enum.some((v: any) => s.type === 'integer' ? !Number.isSafeInteger(v) : s.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== s.type))) fail('Enum values must match the scalar type (1–100 values).');
  return { name: p.name, inputName: `${p.in}_${p.name}`, location: p.in, required: !!p.required, type: s.type, ...(s.enum ? {enum:s.enum} : {}), description: text(p.description) || text(s.description) };
}
function readAuth(security: any, schemes: Obj): Auth {
  if (!Array.isArray(security)) fail('security must be an array.');
  if (!security.length) return { kind:'none' };
  if (security.length !== 1 || !object(security[0]) || Object.keys(security[0]).length !== 1) fail('Security alternatives/combinations are unsupported; no anonymous fallback is generated.');
  const [name, scopes] = Object.entries(security[0])[0];
  if (!Array.isArray(scopes) || scopes.length) fail('OAuth scopes are unsupported.');
  const s = schemes[name];
  if (s?.type === 'http' && s.scheme?.toLowerCase() === 'bearer') return {kind:'bearer'};
  if (s?.type === 'apiKey' && s.in === 'header' && /^X-[A-Za-z0-9-]{1,60}$/i.test(s.name)) return {kind:'apiKey',header:s.name};
  fail('Only HTTP Bearer or X-* header API keys are supported; OAuth is not supported.');
}
export function selectTools(spec: ImportedSpec, selections: Selection[]): Manifest {
  if (!Array.isArray(selections)) fail('Select at least one operation.');
  const tools = selections.map(selection => {
    const op = spec.operations.find(o => o.id === selection.id);
    if (!op || op.issues.length) fail('Selected operation is missing or unsupported.');
    const { issues, id, ...rest } = op;
    return {...rest, operationId:id, name:selection.name, description:selection.description};
  });
  return validateManifest({version:1, tools});
}
