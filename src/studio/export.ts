import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { validateManifest } from '../core/contracts.js';

export const ROOT = resolve(import.meta.dirname, '../..');
export async function exportPackage(input: unknown, root = ROOT): Promise<Uint8Array> {
  const manifest = validateManifest(input);
  const files: Record<string,Uint8Array> = {};
  // Fixed allowlist: neither uploaded filenames nor operation names become filesystem paths.
  const sources = ['runtime/cli.ts','runtime/server.ts','runtime/http.ts','core/model.ts','core/contracts.ts'];
  for (const file of sources) files[`src/${file}`] = new Uint8Array(await readFile(resolve(root,'src',file)));
  for (const [source,dest] of [['templates/runtime-package.json','package.json'],['templates/runtime-package-lock.json','package-lock.json'],['templates/RUNTIME_README.md','README.md'],['LICENSE','LICENSE']]) files[dest] = new Uint8Array(await readFile(resolve(root,source)));
  files['tools.json'] = strToU8(JSON.stringify(manifest,null,2));
  files['tsconfig.json'] = strToU8(JSON.stringify({compilerOptions:{target:'ES2023',module:'NodeNext',moduleResolution:'NodeNext',strict:true,skipLibCheck:true,types:['node'],outDir:'dist',rootDir:'src'},include:['src']},null,2));
  files['target.example.json'] = strToU8(JSON.stringify({mode:'api',baseUrl:'https://example.invalid/v1',allowedAddresses:['192.0.2.10'],allowInsecureHttp:false},null,2));
  files['.env.example'] = strToU8('# Illustrations only. Supply values in the launching process environment.\n# SPECWAKE_BEARER_TOKEN=fake-token-replace-at-runtime\n# SPECWAKE_API_KEY=fake-key-replace-at-runtime\n');
  files['.gitignore'] = strToU8('node_modules/\ndist/\ntarget.json\n.env\n');
  return zipSync(files,{level:6});
}
