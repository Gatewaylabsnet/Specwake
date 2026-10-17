import dns from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { z } from 'zod';
import { toolSchema } from '../core/contracts.js';
import type { Tool } from '../core/model.js';
import { RuntimeFault, connectionFault, errorResult, type ExecutionResult } from './errors.js';

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
  if (!parsed.success) throw new RuntimeFault('SW_TARGET_INVALID');
  const config = parsed.data;
  let url: URL;
  try { url = new URL(config.baseUrl); } catch { throw new RuntimeFault('SW_TARGET_INVALID'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new RuntimeFault('SW_TARGET_INVALID');
  const rawPath = config.baseUrl.replace(/^https?:\/\/[^/]+/, '');
  if (!/^\/[A-Za-z0-9/_~-]*$/.test(rawPath || '/') || rawPath.split('/').some(p => p === '.' || p === '..')) throw new RuntimeFault('SW_TARGET_INVALID');
  if (config.mode === 'mock') {
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || config.allowedAddresses.length !== 1 || config.allowedAddresses[0] !== '127.0.0.1') throw new RuntimeFault('SW_TARGET_FORBIDDEN');
  } else {
    if (url.protocol !== 'https:' && !config.allowInsecureHttp) throw new RuntimeFault('SW_TARGET_FORBIDDEN');
    if (config.allowedAddresses.some(forbiddenAddress) || /^(localhost|.*\.localhost|metadata\.google\.internal)$/i.test(url.hostname)) throw new RuntimeFault('SW_TARGET_FORBIDDEN');
    const literal = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(literal) && (!config.allowedAddresses.includes(literal) || forbiddenAddress(literal))) throw new RuntimeFault('SW_TARGET_FORBIDDEN');
  }
  return config;
}
export function requestUrl(tool: Tool, args: unknown, target: Target): URL {
  const parsed = toolSchema(tool).safeParse(args);
  if (!parsed.success) throw new RuntimeFault('SW_PARAMETER_INVALID');
  const values = parsed.data;
  const segments = tool.path.slice(1).split('/').map(segment => {
    const match = /^\{(.+)\}$/.exec(segment);
    if (!match) return segment;
    const value = String(values[`path_${match[1]}`]);
    if (value === '.' || value === '..' || /[/\\%?#\u0000-\u001f\u007f]/.test(value) || value.length > 256) throw new RuntimeFault('SW_PARAMETER_INVALID');
    return encodeURIComponent(value).replace(/'/g, '%27');
  });
  const url = new URL(target.baseUrl);
  const originalOrigin = url.origin;
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}/${segments.join('/')}`;
  for (const p of tool.parameters) if (p.location === 'query' && values[p.inputName] !== undefined) url.searchParams.set(p.name, String(values[p.inputName]));
  if (url.origin !== originalOrigin || !url.pathname.startsWith(`${prefix}/`)) throw new RuntimeFault('SW_PARAMETER_INVALID');
  return url;
}
export async function executeTool(tool: Tool, args: unknown, inputTarget: unknown, env: Record<string,string|undefined> = process.env): Promise<ExecutionResult> {
  try {
    const target = validateTarget(inputTarget);
    const url = requestUrl(tool, args, target);
    const headers: Record<string,string> = { Accept:'application/json', 'User-Agent':'Specwake/0.1.0' };
    const secrets: string[] = [];
    if (tool.auth.kind !== 'none') {
      const value = env[tool.auth.kind === 'bearer' ? 'SPECWAKE_BEARER_TOKEN' : 'SPECWAKE_API_KEY'];
      if (!value) throw new RuntimeFault('SW_CREDENTIAL_MISSING');
      if (/[^\u0020-\u007e]/.test(value)) throw new RuntimeFault('SW_CREDENTIAL_INVALID');
      secrets.push(value);
      headers[tool.auth.kind === 'bearer' ? 'Authorization' : tool.auth.header] = tool.auth.kind === 'bearer' ? `Bearer ${value}` : value;
    }
    const deadline = Date.now() + TIMEOUT_MS;
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      dns.lookup(url.hostname.replace(/^\[|\]$/g, ''), {all:true}).catch(() => {throw new RuntimeFault('SW_DNS_RESOLUTION_FAILED');}),
      new Promise<never>((_,reject) => { dnsTimer = setTimeout(() => reject(new RuntimeFault('SW_TIMEOUT')), TIMEOUT_MS); })
    ]).finally(() => clearTimeout(dnsTimer));
    if (!addresses.length || addresses.some(a => !target.allowedAddresses.includes(a.address))) throw new RuntimeFault('SW_DNS_MISMATCH');
    const pinned = addresses[0];
    const body = await new Promise<string>((resolve,reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (error?: RuntimeFault, value = '') => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        if (error) reject(error); else resolve(value);
      };
      const request = (url.protocol === 'https:' ? https : http).request(url, {
        method:'GET', headers, agent:false, ...(url.protocol === 'https:' ? {rejectUnauthorized:true} : {}),
        lookup: ((_hostname: string, options: {all?:boolean}, callback: Function) => options.all ? callback(null,[pinned]) : callback(null,pinned.address,pinned.family)) as any
      }, response => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          const status = response.statusCode ?? 0;
          const code = target.mode === 'mock' && status === 404 && response.headers['x-specwake-fixture'] === 'missing' ? 'SW_MOCK_FIXTURE_MISSING' : status >= 300 && status < 400 ? 'SW_REDIRECT_BLOCKED' : status === 401 ? 'SW_HTTP_UNAUTHORIZED' : status === 403 ? 'SW_HTTP_FORBIDDEN' : status === 429 ? 'SW_HTTP_RATE_LIMITED' : 'SW_HTTP_STATUS';
          finish(new RuntimeFault(code)); response.destroy(); return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE) { finish(new RuntimeFault('SW_RESPONSE_TOO_LARGE')); response.destroy(); }
          else chunks.push(chunk);
        });
        response.on('end', () => finish(undefined,Buffer.concat(chunks).toString('utf8')));
        response.on('error', () => finish(new RuntimeFault('SW_RESPONSE_FAILED')));
        response.on('aborted', () => finish(new RuntimeFault('SW_RESPONSE_FAILED')));
      });
      timeout = setTimeout(() => {finish(new RuntimeFault('SW_TIMEOUT'));request.destroy();}, Math.max(1,deadline-Date.now()));
      request.on('error', error => finish(connectionFault(error)));
      request.end();
    });
    let safeBody = body;
    for (const secret of secrets) safeBody = safeBody.split(secret).join('[REDACTED]');
    return { content:[{type:'text' as const, text:safeBody}] };
  } catch (error) {
    // Never expose native errors, request URLs, headers, input arguments or failed response bodies.
    return errorResult(error);
  }
}
