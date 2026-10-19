import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rmdir, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { demoConfig } from "../src/panel/config.js";
import { LocalJournal } from "../src/panel/journal.js";
import { callSummary } from "../src/core/call-summary.js";
import { connectionExample } from "../src/ui/panel/connection.js";
import { localEndpoint } from "../scripts/mcp-demo-client.js";
import { startStudio } from "../src/studio/server.js";
import type { CallEvent } from "../src/panel/types.js";
import { ROOT } from "../src/studio/export.js";

async function removeOwned(folder: string) {
  assert.ok(resolve(folder).startsWith(resolve(tmpdir()) + sep));
  await rm(folder, { recursive: true, force: true });
}
test("native and container listener configuration is explicit and validates ports", () => {
  assert.deepEqual(demoConfig({}), {
    panelPort: 4319,
    listeners: { bindAddress: "127.0.0.1", mcpPort: 0 },
  });
  assert.deepEqual(demoConfig({ SPECWAKE_CONTAINER_DEMO: "1" }), {
    panelPort: 4319,
    listeners: { bindAddress: "0.0.0.0", mcpPort: 4320 },
  });
  for (const env of [
    { SPECWAKE_CONTAINER_DEMO: "yes" },
    { SPECWAKE_PORT: "-1" },
    { SPECWAKE_PORT: "4319", SPECWAKE_MCP_PORT: "4319" },
    { SPECWAKE_CONTAINER_DEMO: "1", SPECWAKE_MCP_PORT: "0" },
  ])
    assert.throws(() => demoConfig(env));
});
test("connection snippets contain only a local MCP endpoint and safe synthetic arguments", () => {
  const example = connectionExample(
    "http://127.0.0.1:4320/mcp",
    undefined,
    "2025-11-25",
  );
  assert.match(example.command, /mcp-demo-client\.ts/);
  assert.match(example.sdk, /supportedProtocolVersions/);
  assert.match(example.sdk, /listTools/);
  assert.doesNotMatch(example.sdk, /Authorization|password|apiKey|Bearer/);
  assert.equal(localEndpoint("http://127.0.0.1:4320/mcp").port, "4320");
  for (const url of [
    "https://example.invalid/mcp",
    "http://127.0.0.1:4320/mcp?token=secret",
    "http://user:secret@127.0.0.1:4320/mcp",
    "http://127.0.0.1:4320/admin",
  ]) {
    assert.throws(() => connectionExample(url, undefined, "2025-11-25"));
    assert.throws(() => localEndpoint(url));
  }
});
test("call detail summaries never reflect unknown or sensitive error text", () => {
  assert.match(callSummary("TOOL_NOT_SELECTED"), /izin/);
  assert.match(callSummary("CALL_CANCELLED"), /iptal/);
  for (const input of ["secret-password-sentinel", "constructor", "toString"]) {
    const summary = callSummary(input);
    assert.equal(typeof summary, "string");
    assert.ok(!summary.includes(input));
  }
});

test("desktop connection commands quote executable paths without shell interpolation", () => {
  const path = "C:\\Users\\O'Brien $demo\\Specwake.exe";
  const snippet = connectionExample("http://127.0.0.1:4320/mcp", undefined, "2025-11-25", path);
  assert.match(snippet.command, /O''Brien \$demo/);
  assert.match(snippet.command, /--mcp-client/);
  assert.ok(snippet.exerciseCommand.endsWith('--exercise | Out-Host'));
  assert.doesNotMatch(snippet.command, /node --import|scripts\//);
});
test("retention write failures remain failures until disk pruning really succeeds", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-prune-retry-"));
  const journal = await LocalJournal.open(folder);
  try {
    const now = Date.now();
    const event: CallEvent = {
      id: randomUUID(),
      at: new Date(now).toISOString(),
      runId: randomUUID(),
      groupId: randomUUID(),
      tool: "demo",
      client: "qa-demo",
      outcome: "success",
      durationMs: 1,
      code: "OK",
    };
    await journal.append(event);
    t.mock.timers.enable({ apis: ["Date"], now });
    t.mock.timers.tick(8 * 24 * 60 * 60000);
    await mkdir(join(folder, "calls.pending")); // isolated filesystem failure, no permission changes
    await assert.rejects(journal.read());
    await assert.rejects(journal.read());
    assert.equal(
      JSON.parse(await readFile(join(folder, "calls.json"), "utf8")).length,
      1,
    );
    await rmdir(join(folder, "calls.pending"));
    assert.equal((await journal.read()).length, 0);
    assert.equal(
      JSON.parse(await readFile(join(folder, "calls.json"), "utf8")).length,
      0,
    );
    await journal.health();
    assert.ok(
      !(await readdir(folder)).some((name) => name.startsWith(".health-")),
    );
  } finally {
    t.mock.timers.reset();
    await journal.close();
    await removeOwned(folder);
  }
});
test("readiness checks the writable journal and request configuration cannot change listener boundaries", async () => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-health-test-"));
  const studio = await startStudio(0, { panelDataDir: folder });
  try {
    const health = await (
      await fetch(studio.origin + "/api/panel/health")
    ).json();
    assert.equal(health.ready, true);
    assert.equal(health.storage, "writable");
    assert.equal(
      (
        await fetch(studio.origin + "/api/panel/health", {
          headers: { Origin: "https://attacker.invalid" },
        })
      ).status,
      403,
    );
    const token = (await (await fetch(studio.origin + "/api/session")).json())
      .token;
    const injected = await fetch(studio.origin + "/api/panel/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Specwake-Token": token,
      },
      body: JSON.stringify({
        bindAddress: "0.0.0.0",
        target: "https://attacker.invalid",
      }),
    });
    assert.equal(injected.status, 400);
    assert.equal(
      studio.server.address() &&
        (studio.server.address() as { address: string }).address,
      "127.0.0.1",
    );
  } finally {
    await studio.close();
    await removeOwned(folder);
  }
});
test("full HTTP demo uses an independent official SDK process and persisted real call metadata", async () => {
  await new Promise<void>((resolveTest, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve(ROOT, "scripts/verify-http.ts")],
      { cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("HTTP verification deadline"));
    }, 30000);
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", () => {});
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      try {
        assert.equal(code, 0);
        const report = JSON.parse(output);
        assert.equal(report.separateClientProcess, true);
        assert.equal(report.restartVerified, true);
        assert.equal(report.calls, 5);
        assert.equal(report.errors, 2);
        resolveTest();
      } catch (error) {
        reject(error);
      }
    });
  });
});
