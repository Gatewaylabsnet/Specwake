import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importSpec, selectTools, MAX_BYTES } from '../core/import.js';
import { inputSchema } from '../core/contracts.js';
import type { ImportedSpec } from '../core/model.js';
import { exportPackage, ROOT } from './export.js';
import { probe, type ProbeOptions } from './probe.js';
import { startMock } from '../mock/server.js';
import { safeDiagnostic } from '../runtime/errors.js';
import { makeProbeReceipt } from '../core/probe-context.js';
import { createPanel } from '../panel/routes.js';
import type { DemoListeners } from '../panel/config.js';

export function checkBrowserRequest(req: Pick<IncomingMessage,'headers'|'method'>, origin: string, token: string) {
  const host = new URL(origin).host;
  if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== origin) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(String(req.headers['sec-fetch-site'])))) return false;
  return req.method === 'GET' || req.method === 'HEAD' || req.headers['x-specwake-token'] === token;
}
async function body(req: IncomingMessage) {
  if (req.headers['content-type'] !== 'application/json') throw new Error('Use application/json.');
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES + 100000) throw new Error('Upload exceeds the 1 MiB document limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value)); }

export async function startStudio(port = 4318, options: ProbeOptions & {panelDataDir?: string; listeners?: DemoListeners; desktopClientExecutable?: string} = {}) {
  const csrf = randomBytes(32).toString('hex');
  const root = options.root ?? ROOT;
  let origin = `http://127.0.0.1:${port}`;
  const docs = new Map<string,{spec:ImportedSpec,at:number}>();
  const mock = await startMock();
  let probing = false;
  let panel: Promise<Awaited<ReturnType<typeof createPanel>>> | undefined;
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (!checkBrowserRequest(req,origin,csrf)) return json(res,403,{error:'Request blocked: use the local Specwake origin and session token.'});
    try {
      const path = new URL(req.url!,origin).pathname;
      if (path.startsWith('/api/panel/')) {
        panel ??= createPanel(root, options.panelDataDir ?? resolve(ROOT,'.local-data'), options.listeners, options.desktopClientExecutable);
        try { await (await panel).handle(req,res,new URL(req.url!,origin)); }
        catch { json(res,503,{code:'PANEL_UNAVAILABLE',error:'Panel kaydı açılamadı. Veri dizinini ve tek çalışan süreç olduğunu kontrol edin.'}); }
        return;
      }
      if (req.method === 'GET' && path === '/api/session') return json(res,200,{token:csrf});
      if (req.method === 'POST' && ['/api/import','/api/sample'].includes(path)) {
        const data = await body(req);
        if (path === '/api/import' && typeof data.source !== 'string') throw new Error('Choose a local JSON or YAML document.');
        const source = path === '/api/sample' ? await readFile(resolve(root,'examples/pet-catalog.yaml'),'utf8') : data.source;
        const spec = importSpec(source);
        for (const [key,entry] of docs) if (Date.now()-entry.at > 30*60*1000) docs.delete(key);
        if (docs.size >= 10) docs.delete(docs.keys().next().value!);
        const documentId = randomUUID(); docs.set(documentId,{spec,at:Date.now()});
        return json(res,200,{documentId,...spec});
      }
      if (req.method === 'POST' && ['/api/preview','/api/test','/api/export'].includes(path)) {
        const data = await body(req);
        const entry = docs.get(data.documentId);
        if (!entry || Date.now()-entry.at > 30*60*1000) throw new Error('Document session expired. Import your file again.');
        const manifest = selectTools(entry.spec,data.selections);
        if (path === '/api/preview') return json(res,200,{tools:manifest.tools.map(t => ({...t,inputSchema:inputSchema(t)}))});
        if (path === '/api/test') {
          if (probing) return json(res,429,{error:'A mock test is already running. Try again after it completes.'});
          if (!manifest.tools.some(t => t.name === data.toolName)) throw new Error('Choose a selected tool.');
          if (!data.args || typeof data.args !== 'object' || Array.isArray(data.args)) {
            const diagnostic=safeDiagnostic(undefined,'SW_PARAMETER_INVALID');
            return json(res,400,{error:`[${diagnostic.code}] ${diagnostic.message} ${diagnostic.hint}`,diagnostic});
          }
          probing = true;
          try {
            const receipt=await makeProbeReceipt(data.documentId,manifest,data.toolName,data.args);
            return json(res,200,{...await probe(manifest,mock.target,data.toolName,data.args,options),receipt});
          }
          catch {const diagnostic=safeDiagnostic(undefined,'SW_MCP_CONNECTION_FAILED');return json(res,400,{error:`[${diagnostic.code}] ${diagnostic.message} ${diagnostic.hint}`,diagnostic});}
          finally { probing = false; }
        }
        const zip = await exportPackage(manifest,root);
        res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="specwake-server.zip"'});res.end(zip);return;
      }
      if (path.startsWith('/api/')) return json(res,404,{error:'Unknown action.'});
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res,405,{error:'Method not allowed.'});
      const asset = ['/', '/panel'].includes(path) ? 'index.html' : /^\/assets\/[A-Za-z0-9_-]+\.(js|css)$/.test(path) ? path.slice(1) : undefined;
      if (!asset) return json(res,404,{error:'Not found.'});
      try {
        const bytes = await readFile(resolve(root,'dist/ui',asset));
        res.writeHead(200,{'Content-Type':asset.endsWith('.html')?'text/html; charset=utf-8':asset.endsWith('.js')?'text/javascript':'text/css'});
        res.end(bytes);
      } catch { json(res,404,{error:'Build the UI with npm run build, then start Specwake again.'}); }
    } catch (e) { json(res,400,{error:e instanceof Error ? e.message.slice(0,300) : 'Action failed. Try again.'}); }
  });
  try { await new Promise<void>((resolve,reject) => {server.once('error',reject);server.listen(port,options.listeners?.bindAddress ?? '127.0.0.1',resolve);}); }
  catch (error) { await mock.close(); throw error; }
  origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  console.error(`Specwake ready: ${origin}`);
  server.headersTimeout = 10000;
  server.requestTimeout = 10000;
  return {server,origin,close:async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (panel) { const active = await panel.catch(() => undefined); await active?.close(); }
    await mock.close();
  }};
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const studio = await startStudio();
    for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal,async () => {await studio.close();process.exit(0);});
  } catch (error) {console.error(JSON.stringify({error:safeDiagnostic(error,'SW_STARTUP_FAILED')}));process.exitCode=1;}
}
