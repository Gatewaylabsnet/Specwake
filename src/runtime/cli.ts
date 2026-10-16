import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server.js';
try {
  const manifest = JSON.parse(await readFile(resolve('tools.json'), 'utf8'));
  const target = JSON.parse(await readFile(resolve(process.env.SPECWAKE_TARGET_FILE || 'target.json'), 'utf8'));
  const server = createMcpServer(manifest, target);
  await serveStdio(() => server);
} catch {
  console.error('Specwake could not start. Check tools.json and the explicitly configured target.json.');
  process.exitCode = 1;
}
