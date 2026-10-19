import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApiGroup } from "../panel/catalog.js";
import type { CallEvent } from "../panel/types.js";

export async function desktopPanelSelfTest(
  origin: string,
  post: (action: string, data: unknown) => Promise<Response>,
) {
  const get = async (action: string) =>
    (await fetch(`${origin}/api/panel/${action}`)).json();
  const before = await get("statistics?minutes=10080");
  const state = await get("state");
  assert.equal(state.desktopClientExecutable, process.execPath);
  assert.equal(state.service.phase, "stopped");
  const group: ApiGroup =
    state.groups.find(
      (g: ApiGroup) =>
        g.targetMode === "synthetic" &&
        g.operations.some((op) => op.path === "/services"),
    ) ?? (await (await post("panel/sample", {})).json());
  const paths = ["/services", "/summary", "/simulate/error", "/simulate/slow"];
  const selections = group.operations
    .filter((op) => op.method === "GET" && paths.includes(op.path))
    .map((op) => ({ id: op.id, name: op.name, description: op.description }));
  assert.equal(selections.length, 4);
  await post("panel/configure", { groupId: group.id, selections });
  const running = await (await post("panel/start", {})).json();
  const groupBefore = await get(`statistics?minutes=10080&groupId=${group.id}`);
  let evidence: any;
  try {
    // This is another executable process, not the panel's /call API or global Node.js.
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const child = await promisify(execFile)(
      process.execPath,
      ["--mcp-client", "--endpoint", running.endpoint, "--exercise"],
      { env, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
    );
    assert.equal(child.stderr, "");
    const independent = JSON.parse(child.stdout);
    assert.equal(independent.passed, true);
    assert.equal(independent.calls.length, 5);
    assert.equal(independent.tools.length, 4);
    const stats = await get(`statistics?minutes=10080&groupId=${group.id}`);
    assert.equal(stats.calls, groupBefore.calls + 5);
    assert.equal(stats.errors, groupBefore.errors + 2);
    assert.deepEqual(
      new Set(
        stats.recent
          .filter((e: CallEvent) => independent.correlations.includes(e.id))
          .map((e: CallEvent) => e.id),
      ),
      new Set(independent.correlations),
    );
    evidence = {
      managementPanel: true,
      bundledIndependentClient: true,
      calls: 5,
      errors: 2,
      retainedBefore: before.calls,
      retainedAfter: before.calls + 5,
      retainedIds: stats.recent.map((e: CallEvent) => e.id),
      previousIds: before.recent.map((e: CallEvent) => e.id),
      endpoint: running.endpoint,
    };
  } finally {
    await post("panel/stop", {});
    await assert.rejects(
      fetch(running.endpoint, { signal: AbortSignal.timeout(1500) }),
    );
  }
  const postGroup: ApiGroup =
    state.groups.find(
      (g: ApiGroup) =>
        g.targetMode === "synthetic" &&
        g.operations.some((op) => op.path === "/realPersonSearch"),
    ) ?? (await (await post("panel/read-post-sample", {})).json());
  const postOperation = postGroup.operations.find(
    (op) => op.path === "/realPersonSearch",
  )!;
  await post("panel/configure", {
    groupId: postGroup.id,
    selections: [
      {
        id: postOperation.id,
        name: postOperation.name,
        description: postOperation.description,
        readOnlyConfirmed: true,
        bodyOverrideApproved: true,
        responseAdapterApproved: true,
        bodyOverride: {
          ...postOperation.requestBody!.proposal!,
          required: ["IdNo"],
        },
      },
    ],
  });
  const postRunning = await (await post("panel/start", {})).json();
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    for (const [id, expected] of [
      ["DEMO-DESKTOP-0001", "success"],
      ["demo-app-error", "error"],
    ]) {
      const child = await promisify(execFile)(
        process.execPath,
        [
          "--mcp-client",
          "--endpoint",
          postRunning.endpoint,
          // Electron on Windows treats standalone values as launch URLs/files.
          // Keep tool name and JSON inside their switch using the equals form.
          `--tool=${postOperation.name}`,
          `--args=${JSON.stringify({ body: { IdNo: id } })}`,
        ],
        { env, windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 },
      );
      assert.equal(child.stderr, "");
      const result = JSON.parse(child.stdout).result;
      assert.equal(result.structuredContent.status, expected);
      assert.equal(result.structuredContent.complete, false);
      assert.doesNotMatch(
        JSON.stringify(result),
        /DEMO-DESKTOP-0001|SYNTHETIC PERSON|public-synthetic-upstream/,
      );
    }
  } finally {
    await post("panel/stop", {});
  }
  await assert.rejects(
    fetch(postRunning.endpoint, { signal: AbortSignal.timeout(1500) }),
  );
  const all = await get("statistics?minutes=10080");
  assert.equal(all.calls, before.calls + 7);
  return {
    ...evidence,
    readPostBundledClient: true,
    readPostCalls: 2,
    readPostEndpoint: postRunning.endpoint,
    retainedAfter: all.calls,
    retainedIds: all.recent
      .filter(
        (e: CallEvent) =>
          !before.recent.some((old: CallEvent) => old.id === e.id),
      )
      .map((e: CallEvent) => e.id),
  };
}
