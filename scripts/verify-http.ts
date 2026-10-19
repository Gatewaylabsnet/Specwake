import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { startStudio } from "../src/studio/server.js";
import type { ApiGroup } from "../src/panel/catalog.js";
import type { CallEvent } from "../src/panel/types.js";
import { ROOT } from "../src/studio/export.js";

async function separateClient(endpoint: string) {
  return new Promise<any>((resolveClient, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        resolve(ROOT, "scripts/mcp-demo-client.ts"),
        "--endpoint",
        endpoint,
        "--exercise",
      ],
      { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let bytes = 0;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Independent client deadline"));
    }, 20000);
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        child.kill();
        reject(new Error("Client output limit"));
      } else stdout += chunk;
    });
    child.stderr.on("data", () => {});
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Independent client launch failed"));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error("Independent client failed"));
      else {
        try {
          resolveClient(JSON.parse(stdout));
        } catch {
          reject(new Error("Independent client report invalid"));
        }
      }
    });
  });
}
async function main() {
  const external = process.env.SPECWAKE_VERIFY_ORIGIN;
  if (external) {
    const url = new URL(external);
    assert.equal(url.origin, external);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.protocol, "http:");
  }
  const dataDir = external
    ? undefined
    : await mkdtemp(join(tmpdir(), "specwake-http-"));
  let owned = external
    ? undefined
    : await startStudio(0, { panelDataDir: dataDir });
  let origin = external ?? owned!.origin;
  let createdService = false;
  let token = "";
  const get = async (action: string) => {
    const response = await fetch(`${origin}/api/panel/${action}`, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  const post = async (action: string, value: unknown = {}) => {
    const response = await fetch(`${origin}/api/panel/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Specwake-Token": token,
      },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200, `${action} must succeed`);
    return response.json();
  };
  try {
    assert.equal((await get("health")).ready, true);
    const before = await get("state");
    assert.equal(
      before.service.phase,
      "stopped",
      "Refuse to stop or replace an existing active service",
    );
    token = (await (await fetch(origin + "/api/session")).json()).token;
    const group: ApiGroup = await post("sample");
    const selections = group.operations
      .filter((op) => !op.issues.length && op.path !== "/services/{id}")
      .map((op) => ({ id: op.id, name: op.name, description: op.description }));
    assert.equal(selections.length, 4);
    await post("configure", { groupId: group.id, selections });
    const running = await post("start");
    createdService = true;
    assert.equal(running.phase, "running");
    const independent = await separateClient(running.endpoint);
    assert.equal(independent.initialized, true);
    assert.equal(independent.tools.length, 4);
    assert.equal(independent.calls.length, 5);
    assert.equal(independent.redactionCanarySent, true);
    const stats = await get(`statistics?minutes=10080&groupId=${group.id}`);
    assert.equal(stats.calls, 5);
    assert.equal(stats.errors, 2);
    assert.equal(stats.errorRate, 0.4);
    assert.equal(stats.byClient[0].value, "local-script");
    assert.equal(
      stats.buckets.reduce((n: number, b: any) => n + b.calls, 0),
      5,
    );
    assert.deepEqual(
      new Set(stats.recent.map((e: CallEvent) => e.id)),
      new Set(independent.correlations),
    );
    const filtered = await get(
      `statistics?minutes=10080&groupId=${group.id}&tool=${selections[0].name}&client=local-script`,
    );
    assert.equal(filtered.calls, 1);
    await post("stop");
    createdService = false;
    await assert.rejects(
      fetch(running.endpoint, { signal: AbortSignal.timeout(1500) }),
    );
    let restartVerified = false;
    if (owned) {
      await owned.close();
      owned = await startStudio(0, { panelDataDir: dataDir });
      origin = owned.origin;
      const restarted = await get("state");
      assert.equal(restarted.service.phase, "stopped");
      assert.equal(restarted.groups.length, 1);
        assert.equal(restarted.groups[0].id,group.id);
      const persisted = await get(
        `statistics?minutes=10080&groupId=${group.id}`,
      );
      assert.equal(persisted.calls, 5);
      const records = JSON.parse(
        await readFile(join(dataDir!, "calls.json"), "utf8"),
      ) as CallEvent[];
      assert.equal(records.length, 5);
      assert.ok(!JSON.stringify(records).includes("never-log-this-secret"));
      const keys = [
        "at",
        "client",
        "code",
        "durationMs",
        "groupId",
        "id",
        "outcome",
        "runId",
        "tool",
      ].sort();
      assert.ok(
        records.every(
          (e) => JSON.stringify(Object.keys(e).sort()) === JSON.stringify(keys),
        ),
      );
      restartVerified = true;
    }
    const report = {
      passed: true,
      at: new Date().toISOString(),
      platform: process.platform,
      node: process.versions.node,
      separateClientProcess: true,
      source: external
        ? "existing-explicit-loopback-origin"
        : "owned-isolated-studio",
      restartVerified,
      dataDir,
      calls: stats.calls,
      errors: stats.errors,
      independent,
      checks: [
        "OpenAPI import + 4 selected GETs",
        "separate SDK process initialize/list/call",
        "success/error/real-delay/unselected rejection",
        "correlation matches actual persisted calls",
        "group/tool/client filters + exact error rate",
        "stop closes MCP port",
        ...(restartVerified
          ? [
              "restart retains metadata; services start stopped",
              "metadata-only journal schema",
            ]
          : []),
      ],
    };
    await mkdir(resolve(ROOT, "artifacts"), { recursive: true });
    await writeFile(
      resolve(ROOT, "artifacts/http-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (createdService) await post("stop").catch(() => {});
    await owned?.close();
  }
}
main().catch(() => {
  console.error(
    "HTTP demo verification failed. No existing service is intentionally replaced. Check local readiness and selected demo fixtures.",
  );
  process.exitCode = 1;
});
