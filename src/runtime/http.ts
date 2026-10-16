import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { toolSchema } from '../core/contracts.js';
import type { Tool } from '../core/model.js';

const targetSchema = z.object({
  mode: z.enum(['mock','api']), baseUrl: z.string().max(1000),
  allowedAddresses: z.array(z.string().refine(v => isIP(v) === 4)).min(1).max(8),
  allowInsecureHttp: z.boolean().default(false)
}).strict();
export type Target = z.infer<typeof targetSchema>;
export const TIMEOUT_MS = 5000;
export const MAX_RESPONSE = 256 * 1024;
const forbiddenAddress = (ip: string) => {
  if (isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return a === 0 || a === 127 || a === 169 && b === 254 || a >= 224 || ip === '100.100.100.200';
  }
  // IPv4-mapped, scoped, unspecified, loopback, multicast and link-local IPv6 are excluded.
  return ip.includes('%') || ip.includes('.') || ip.startsWith('::') || /^(fe[89ab]|ff)/i.test(ip);
};
export function validateTarget(input: unknown): Target {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) throw new Error('Target requires mode, baseUrl and an exact IPv4 allowedAddresses list. IPv6 is unsupported in this MVP.');
  const config = parsed.data;
  let url: URL;
  try { url = new URL(config.baseUrl); } catch { throw new Error('Invalid target URL.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Target must be HTTP(S), without credentials, query or fragment.');
  const rawPath = config.baseUrl.replace(/^https?:\/\/[^/]+/, '');
  if (!/^\/[A-Za-z0-9/_~-]*$/.test(rawPath || '/') || rawPath.split('/').some(p => p === '.' || p === '..')) throw new Error('Use a plain target base path.');
  if (config.mode === 'mock') {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || config.allowedAddresses.length !== 1 || config.allowedAddresses[0] !== '127.0.0.1') throw new Error('Mock mode only permits one explicit http://127.0.0.1:port target.');
  } else {
    if (url.protocol !== 'https:' && !config.allowInsecureHttp) throw new Error('API mode requires HTTPS; HTTP needs explicit allowInsecureHttp.');
    if (config.allowedAddresses.some(forbiddenAddress) || /^(localhost|.*\.localhost|metadata\.google\.internal)$/i.test(url.hostname)) throw new Error('Metadata, loopback, link-local and special targets are blocked.');
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literal) && (!config.allowedAddresses.includes(literal) || forbiddenAddress(literal))) throw new Error('Target IP is not allowed.');
  }
  return config;
}
export function requestUrl(tool: Tool, args: unknown, target: Target): URL {
  const values = toolSchema(tool).parse(args);
  const segments = tool.path.slice(1).split('/').map(segment => {
    const match = /^\{(.+)\}$/.exec(segment);
    if (!match) return segment;
    const value = String(values[`path_${match[1]}`]);
    if (value === '.' || value === '..' || /[/\\%?#\u0000-\u001f\u007f]/.test(value) || value.length > 256) throw new Error('Path value contains a forbidden boundary character.');
    return encodeURIComponent(value).replace(/'/g, '%27');
  });
  const url = new URL(target.baseUrl);
  const originalOrigin = url.origin;
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/${segments.join('/')}`;
  for (const p of tool.parameters) if (p.location === 'query' && values[p.inputName] !== undefined) url.searchParams.set(p.name, String(values[p.inputName]));
  if (url.origin !== originalOrigin || !url.pathname.startsWith(`${prefix}/`)) throw new Error('Request escaped target boundary.');
  return url;
}
export async function executeTool(tool: Tool, args: unknown, inputTarget: unknown, env: Record<string,string|undefined> = process.env) {
  try {
    const target = validateTarget(inputTarget);
    const url = requestUrl(tool, args, target);
    const deadline = Date.now() + TIMEOUT_MS;
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      lookup(url.hostname.replace(/^\[|\]$/g, ''), {all:true}),
      new Promise<never>((_,reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS timeout.')), TIMEOUT_MS); })
    ]).finally(() => clearTimeout(dnsTimer));
    if (!addresses.length || addresses.some(a => !target.allowedAddresses.includes(a.address))) throw new Error('Target resolution is outside the allowed address list.');
    const pinned = addresses[0];
    const headers: Record<string,string> = { Accept:'application/json', 'User-Agent':'Specwake/0.1.0' };
    const secrets: string[] = [];
    if (tool.auth.kind !== 'none') {
      const value = env[tool.auth.kind === 'bearer' ? 'SPECWAKE_BEARER_TOKEN' : 'SPECWAKE_API_KEY'];
      if (!value || /[\r\n]/.test(value)) throw new Error('Required runtime credential is missing or invalid.');
      secrets.push(value);
      headers[tool.auth.kind === 'bearer' ? 'Authorization' : tool.auth.header] = tool.auth.kind === 'bearer' ? `Bearer ${value}` : value;
    }
    const body = await new Promise<string>((resolve,reject) => {
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method:'GET', headers, agent:false,
        lookup: ((_hostname: string, _options: unknown, callback: Function) => callback(null, pinned.address, pinned.family)) as any
      }, response => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          response.destroy(); reject(new Error('API returned a non-success status or redirect.')); return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE) { response.destroy(); reject(new Error('Response exceeds 256 KiB.')); }
          else chunks.push(chunk);
        });
        response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        response.on('error', () => reject(new Error('API response failed.')));
      });
      const timeout = setTimeout(() => request.destroy(new Error('Request timed out.')), Math.max(1,deadline-Date.now()));
      request.on('close', () => clearTimeout(timeout));
      request.on('error', () => reject(new Error('API request failed or timed out.')));
      request.end();
    });
    let safeBody = body;
    for (const secret of secrets) safeBody = safeBody.split(secret).join('[REDACTED]');
    return { content:[{type:'text' as const, text:safeBody}] };
  } catch {
    // Never expose native errors, request URLs, headers, input arguments or failed response bodies.
    return { isError:true, content:[{type:'text' as const, text:'Request rejected or failed. Check parameter values, target allowlist, runtime credential, API status and the 5s / 256 KiB limits. Redirects are disabled.'}] };
  }
}
