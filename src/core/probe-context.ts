import type { Manifest, Selection } from './model.js';

function canonical(value: unknown, depth=0): unknown {
  if(depth>40) throw new Error('Mock input exceeds the supported structure depth.');
  if(Array.isArray(value)) return value.map(item=>canonical(item,depth+1));
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key],depth+1)]));
  return value;
}
async function digest(value: unknown) {
  const bytes=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export interface ProbeReceipt {documentId:string;toolName:string;manifestHash:string;argumentsHash:string}
export async function makeProbeReceipt(documentId:string,manifest:Manifest,toolName:string,args:unknown):Promise<ProbeReceipt> {
  const [manifestHash,argumentsHash]=await Promise.all([digest(manifest),digest(args)]);
  return {documentId,toolName,manifestHash,argumentsHash};
}
export function sameProbeReceipt(left:ProbeReceipt,right:ProbeReceipt|undefined) {
  return !!right && left.documentId===right.documentId && left.toolName===right.toolName && left.manifestHash===right.manifestHash && left.argumentsHash===right.argumentsHash;
}
export function probeViewKey(documentId:string|undefined,selections:Selection[],toolName:string|undefined,argsText:string) {
  return JSON.stringify([documentId,selections,toolName,argsText]);
}
export interface StoredProbe<T=any> {key:string;epoch:number;response:T}
export function currentProbe<T>(stored:StoredProbe<T>|undefined,key:string,epoch:number):T|undefined {
  return stored?.key===key && stored.epoch===epoch ? stored.response : undefined;
}
