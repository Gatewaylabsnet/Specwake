import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ApiGroup } from '../panel/catalog.js';
import type { CallEvent } from '../panel/types.js';

export async function desktopPanelSelfTest(origin: string, post: (action: string, data: unknown) => Promise<Response>) {
  const get = async (action: string) => (await fetch(`${origin}/api/panel/${action}`)).json();
  const before = await get('statistics?minutes=10080');
  const state = await get('state');
  assert.equal(state.desktopClientExecutable, process.execPath);
  assert.equal(state.service.phase, 'stopped');
  const group = await (await post('panel/sample', {})).json() as ApiGroup;
  const paths = ['/services', '/summary', '/simulate/error', '/simulate/slow'];
  const selections = group.operations.filter(op => op.method === 'GET' && paths.includes(op.path))
    .map(op => ({ id: op.id, name: op.name, description: op.description }));
  assert.equal(selections.length, 4);
  await post('panel/configure', { groupId: group.id, selections });
  const running = await (await post('panel/start', {})).json();
  try {
    // This is another executable process, not the panel's /call API or global Node.js.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const child = await promisify(execFile)(process.execPath,
      ['--mcp-client', '--endpoint', running.endpoint, '--exercise'],
      { env, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
    assert.equal(child.stderr, '');
    const independent = JSON.parse(child.stdout);
    assert.equal(independent.passed, true);
    assert.equal(independent.calls.length, 5);
    assert.equal(independent.tools.length, 4);
    const stats = await get(`statistics?minutes=10080&groupId=${group.id}`);
    assert.equal(stats.calls, 5);
    assert.equal(stats.errors, 2);
    assert.deepEqual(new Set(stats.recent.map((e: CallEvent) => e.id)), new Set(independent.correlations));
    return {
      managementPanel: true, bundledIndependentClient: true, calls: stats.calls, errors: stats.errors,
      retainedBefore: before.calls, retainedAfter: before.calls + 5,
      retainedIds: stats.recent.map((e: CallEvent) => e.id),
      previousIds: before.recent.map((e: CallEvent) => e.id),
      endpoint: running.endpoint,
    };
  } finally {
    await post('panel/stop', {});
    await assert.rejects(fetch(running.endpoint, { signal: AbortSignal.timeout(1500) }));
  }
}
