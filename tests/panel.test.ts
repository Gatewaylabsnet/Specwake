import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { startStudio } from "../src/studio/server.js";
import { statistics } from "../src/panel/statistics.js";
import { randomUUID } from "node:crypto";
import { LocalJournal } from "../src/panel/journal.js";
import { request } from "node:http";
import type { CallEvent } from "../src/panel/types.js";
import { DemoMcpService } from "../src/panel/mcp-service.js";
import { startDemoApi } from "../src/demo/server.js";
import { importSpec, selectTools } from "../src/core/import.js";

test("a call hashing its context cannot migrate onto a restarted service", async (t) => {
  const demo = await startDemoApi();
  const spec = importSpec(
    await readFile(
      new URL("../examples/operations-demo.yaml", import.meta.url),
      "utf8",
    ),
  );
  const op = spec.operations.find((o) => o.path === "/summary")!;
  const manifest = selectTools(spec, [
    { id: op.id, name: op.name, description: op.description },
  ]);
  let calls = 0;
  const service = new DemoMcpService(demo.target, {
    append: async () => {
      ++calls;
    },
  });
  service.configure(randomUUID(), manifest);
  await service.start();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(
    crypto.subtle,
    "digest",
    async (...args: Parameters<typeof digest>) => {
      await gate;
      return digest(...args);
    },
  );
  try {
    const pending = service.call(op.name, {}, "qa-demo").then(
      () => "unexpected-success",
      (error) => error.code,
    );
    await service.stop();
    service.configure(randomUUID(), manifest);
    await service.start();
    release();
    assert.equal(await pending, "CALL_STALE");
    assert.equal(
      calls,
      0,
      "an old invocation must not execute on the new service",
    );
  } finally {
    release();
    await service.stop();
    await demo.close();
  }
});
import { callViewKey, visibleCall } from "../src/ui/panel/result-context.js";

test("real HTTP MCP lifecycle, selection, safe journal, statistics and restart persistence", async (t) => {
  const captured: unknown[][] = [];
  for (const method of ["log", "warn", "error"] as const)
    t.mock.method(console, method, (...args: unknown[]) => captured.push(args));
  const folder = await mkdtemp(join(tmpdir(), "specwake-panel-test-"));
  let studio = await startStudio(0, { panelDataDir: folder });
  let closed = false;
  try {
    let token = (await (await fetch(studio.origin + "/api/session")).json())
      .token;
    const post = async (action: string, data: unknown = {}) => {
      const response = await fetch(studio.origin + "/api/panel/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Specwake-Token": token,
        },
        body: JSON.stringify(data),
      });
      return { status: response.status, data: await response.json() };
    };
    assert.equal((await post("start")).status, 409);
    const group = (await post("sample")).data;
    assert.equal(group.operations.length, 6);
    assert.ok(
      group.operations.find((op: any) => op.method === "POST").issues.length,
    );
    const ops = group.operations.filter((op: any) => !op.issues.length);
    const selections = ops
      .filter((op: any) => op.path !== "/summary")
      .map((op: any) => ({
        id: op.id,
        name: op.name,
        description: op.description,
      }));
    assert.equal(
      (await post("configure", { groupId: group.id, selections })).status,
      200,
    );
    const started = await post("start");
    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.phase, "running");
    assert.equal(started.data.listening, true);
    const endpoint = started.data.endpoint;
    assert.equal(
      (await post("configure", { groupId: group.id, selections })).status,
      409,
    );
    assert.equal((await post("start")).status, 409);
    assert.equal(
      (
        await fetch(endpoint, {
          method: "POST",
          headers: {
            Origin: studio.origin,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(endpoint.replace("/mcp", "/api/panel/state"))).status,
      404,
    );
    const forgedHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          endpoint,
          {
            method: "POST",
            headers: {
              Host: "attacker.invalid",
              "Content-Type": "application/json",
            },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end("{}");
      },
    );
    assert.equal(forgedHost, 403);
    const postMcp = (value: unknown, extra: Record<string, string> = {}) =>
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...extra,
        },
        body: JSON.stringify(value),
      });
    assert.equal((await postMcp({ padding: "x".repeat(70000) })).status, 413);
    assert.equal((await postMcp([])).status, 400);
    assert.equal(
      (
        await postMcp(
          { jsonrpc: "2.0", id: 1, method: "tools/list" },
          { "MCP-Protocol-Version": "unknown-version" },
        )
      ).status,
      400,
    );
    const forgedName = await (
      await postMcp({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "secret-tool-sentinel", arguments: {} },
      })
    ).json();
    assert.ok(forgedName.error);
    assert.ok(!JSON.stringify(forgedName).includes("secret-tool-sentinel"));
    const client = new Client({ name: "qa-demo", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: {
          headers: {
            "X-Specwake-Client": "local-script",
            Authorization: "Bearer never-log-this-secret",
          },
        },
      }),
    );
    try {
      const list = await client.listTools();
      assert.equal(list.tools.length, 4);
      const result = await client.callTool({
        name: selections[0].name,
        arguments: {},
      });
      assert.equal(result.isError, undefined);
      assert.match(JSON.stringify(result), /Sipariş/);
      const failure = await client.callTool({
        name: ops.find((o: any) => o.path === "/simulate/error").name,
        arguments: {},
      });
      assert.equal(failure.isError, true);
      const invalid = await client.callTool({
        name: selections[0].name,
        arguments: { unknown: "password-sentinel" },
      });
      assert.equal(invalid.isError, true);
      await assert.rejects(
        () =>
          client.callTool({
            name: ops.find((o: any) => o.path === "/summary").name,
            arguments: {},
          }),
        /rejected/,
      );
    } finally {
      await client.close();
    }
    const stats = await (
      await fetch(studio.origin + "/api/panel/statistics?minutes=60")
    ).json();
    assert.equal(stats.calls, 5);
    assert.equal(stats.errors, 4);
    assert.equal(stats.errorRate, 0.8);
    const filtered = await (
      await fetch(
        studio.origin +
          "/api/panel/statistics?minutes=60&client=local-script&groupId=" +
          group.id +
          "&tool=" +
          selections[0].name,
      )
    ).json();
    assert.equal(filtered.calls, 2);
    assert.equal(filtered.errors, 1);
    assert.equal(
      (await fetch(studio.origin + "/api/panel/statistics?minutes=2")).status,
      400,
    );
    assert.ok(
      stats.byClient.some(
        (c: any) => c.value === "local-script" && c.calls === 4,
      ),
    );
    assert.equal(
      stats.buckets.reduce((n: number, b: any) => n + b.calls, 0),
      5,
    );
    const journal = await readFile(join(folder, "calls.json"), "utf8");
    for (const value of [
      "never-log-this-secret",
      "password-sentinel",
      "arguments",
      "Authorization",
      "Sipariş",
      "content",
      "secret-tool-sentinel",
    ])
      assert.ok(!journal.includes(value), value);
    assert.ok(
      JSON.parse(journal).every(
        (e: any) => e.id && e.runId && e.durationMs >= 0,
      ),
    );
    assert.equal(
      (
        await post("call", {
          tool: selections[0].name,
          args: [],
          client: "panel-demo",
        })
      ).status,
      400,
    );
    const slowName = ops.find((o: any) => o.path === "/simulate/slow").name;
    const pending = post("call", {
      tool: slowName,
      args: {},
      client: "panel-demo",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await post("stop")).data.phase, "stopped");
    assert.equal((await pending).status, 409);
    await assert.rejects(fetch(endpoint));
    assert.equal(
      (
        await post("call", {
          tool: selections[0].name,
          args: {},
          client: "panel-demo",
        })
      ).status,
      409,
    );
    // Allow the bounded in-flight upstream execution to finish recording before process shutdown.
    await studio.close();
    closed = true;
    studio = await startStudio(0, { panelDataDir: folder });
    closed = false;
    token = (await (await fetch(studio.origin + "/api/session")).json()).token;
    const reloaded = await (
      await fetch(studio.origin + "/api/panel/statistics?minutes=60")
    ).json();
    assert.equal(reloaded.calls, 6);
    assert.ok(reloaded.recent.some((e: any) => e.code === "CALL_CANCELLED"));
    const state = await (
      await fetch(studio.origin + "/api/panel/state")
    ).json();
    assert.equal(state.service.phase, "stopped");
    assert.equal(state.groups.length, 0);
    const invalid = await post("import", { source: "openapi: [secret-input]" });
    assert.equal(invalid.status, 400);
    assert.ok(!JSON.stringify(invalid.data).includes("secret-input"));
    const unknownTarget = await post("import", {
      source: JSON.stringify({
        openapi: "3.1.0",
        info: { title: "Synthetic import", version: "1" },
        servers: [{ url: "https://no-network.invalid" }],
        paths: {
          "/not-a-fixture": {
            get: { responses: { "200": { description: "test" } } },
          },
          "/summary": {
            get: { responses: { "200": { description: "test" } } },
          },
        },
      }),
    });
    assert.equal(unknownTarget.status, 200);
    assert.ok(
      unknownTarget.data.operations.find(
        (o: any) => o.path === "/not-a-fixture",
      ).issues.length,
    );
    assert.equal(
      unknownTarget.data.operations.find((o: any) => o.path === "/summary")
        .issues.length,
      0,
    );
    const badSelection = await post("configure", {
      groupId: unknownTarget.data.id,
      selections: unknownTarget.data.operations
        .filter((o: any) => o.issues.length)
        .map((o: any) => ({
          id: o.id,
          name: o.name,
          description: o.description,
        })),
    });
    assert.equal(badSelection.status, 400);
    for (const secret of [
      "never-log-this-secret",
      "password-sentinel",
      "secret-tool-sentinel",
      "secret-input",
    ])
      assert.ok(!JSON.stringify(captured).includes(secret));
  } finally {
    if (!closed) await studio.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("journal is single-writer, strict metadata-only, bounded and persists across reopen", async () => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-journal-test-"));
  try {
    const store = await LocalJournal.open(folder);
    await assert.rejects(LocalJournal.open(folder));
    const event: CallEvent = {
      id: randomUUID(),
      runId: randomUUID(),
      groupId: randomUUID(),
      at: new Date().toISOString(),
      tool: "demo",
      client: "qa-demo",
      outcome: "success",
      durationMs: 12,
      code: "OK",
    };
    assert.throws(() =>
      store.append({ ...event, headers: { token: "sensitive" } } as any),
    );
    await Promise.all([
      store.append(event),
      store.append({ ...event, id: randomUUID() }),
    ]);
    assert.equal((await store.read()).length, 2);
    await store.close();
    const reopened = await LocalJournal.open(folder);
    assert.equal((await reopened.read()).length, 2);
    await reopened.close();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("statistics use the requested window, dimensions and nearest-rank p95 without invented data", () => {
  const now = Date.now();
  const base: CallEvent = {
    id: randomUUID(),
    runId: randomUUID(),
    groupId: randomUUID(),
    at: new Date(now).toISOString(),
    tool: "one",
    client: "panel-demo",
    outcome: "success",
    durationMs: 100,
    code: "OK",
  };
  const events = [
    base,
    { ...base, tool: "two", durationMs: 300, outcome: "error" as const },
    { ...base, at: new Date(now - 61 * 60000).toISOString(), durationMs: 9000 },
  ];
  const result = statistics(events, { minutes: 60 }, now);
  assert.equal(result.calls, 2);
  assert.equal(result.errorRate, 0.5);
  assert.equal(result.averageMs, 200);
  assert.equal(result.p95Ms, 300);
  assert.equal(statistics(events, { minutes: 60, tool: "one" }, now).calls, 1);
  assert.equal(
    statistics(events, { minutes: 60, client: "local-script" }, now).calls,
    0,
  );
});

test("failed persistent recording returns a safe error instead of a successful unrecorded result", async () => {
  const demo = await startDemoApi();
  const spec = importSpec(
    await readFile(
      new URL("../examples/operations-demo.yaml", import.meta.url),
      "utf8",
    ),
  );
  const op = spec.operations.find((o) => o.path === "/summary")!;
  let attempts = 0;
  const service = new DemoMcpService(demo.target, {
    append: async () => {
      ++attempts;
      throw new Error("secret-stack-sentinel");
    },
  });
  service.configure(
    randomUUID(),
    selectTools(spec, [
      { id: op.id, name: op.name, description: op.description },
    ]),
  );
  const started = await service.start();
  const client = new Client({ name: "qa", version: "1" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(started.endpoint!)),
    );
    await assert.rejects(
      () => client.callTool({ name: op.name, arguments: {} }),
      (error) =>
        !String(error).includes("secret-stack-sentinel") &&
        String(error).includes("PANEL_INTERNAL"),
    );
    assert.equal(attempts, 1);
  } finally {
    await client.close();
    await service.stop();
    await demo.close();
  }
});

test("journal prunes expired records on disk and caps retained history at 5000", async () => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-retention-test-"));
  const base: CallEvent = {
    id: randomUUID(),
    runId: randomUUID(),
    groupId: randomUUID(),
    at: new Date().toISOString(),
    tool: "demo",
    client: "qa-demo",
    outcome: "success",
    durationMs: 1,
    code: "OK",
  };
  try {
    const seed = Array.from({ length: 5000 }, () => ({
      ...base,
      id: randomUUID(),
    }));
    seed[0].at = new Date(Date.now() - 8 * 24 * 60 * 60000).toISOString();
    await writeFile(join(folder, "calls.json"), JSON.stringify(seed));
    const store = await LocalJournal.open(folder);
    assert.equal(
      JSON.parse(await readFile(join(folder, "calls.json"), "utf8")).length,
      4999,
    );
    await store.append({ ...base, id: randomUUID() });
    await store.append({ ...base, id: randomUUID() });
    const records = await store.read();
    assert.equal(records.length, 5000);
    assert.ok(!records.some((e) => e.id === seed[0].id || e.id === seed[1].id));
    await store.close();
    assert.equal(
      JSON.parse(await readFile(join(folder, "calls.json"), "utf8")).length,
      5000,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("call view identity rejects late results after edits, resets, client or service changes", () => {
  const key = callViewKey(
    "run1",
    "rev1",
    "group1",
    "tool1",
    "{}",
    "panel-demo",
    1,
  );
  const stored = { key, result: "passed" };
  assert.equal(visibleCall(stored, key), "passed");
  for (const changed of [
    callViewKey("run2", "rev1", "group1", "tool1", "{}", "panel-demo", 1),
    callViewKey("run1", "rev2", "group1", "tool1", "{}", "panel-demo", 1),
    callViewKey("run1", "rev1", "group2", "tool1", "{}", "panel-demo", 1),
    callViewKey("run1", "rev1", "group1", "tool2", "{}", "panel-demo", 1),
    callViewKey("run1", "rev1", "group1", "tool1", "{ }", "panel-demo", 1),
    callViewKey("run1", "rev1", "group1", "tool1", "{}", "qa-demo", 1),
    callViewKey("run1", "rev1", "group1", "tool1", "{}", "panel-demo", 2),
  ])
    assert.equal(visibleCall(stored, changed), undefined);
});
