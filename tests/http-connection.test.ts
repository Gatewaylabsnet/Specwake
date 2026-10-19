import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  httpConnectionSchema,
  createHttpConnection,
  liveConnectionKey,
  type ConnectionServiceState,
} from "../src/core/http-connection.js";
import { loadCurrentConnection } from "../src/ui/panel/connection-download.js";
import { ConnectionGuide } from "../src/ui/panel/ConnectionGuide.js";
import { ServiceConsole } from "../src/ui/panel/ServiceConsole.js";
import { startStudio } from "../src/studio/server.js";

const example = JSON.parse(
  await readFile(
    new URL("../examples/http-connection-v1.json", import.meta.url),
    "utf8",
  ),
);
const schema = JSON.parse(
  await readFile(
    new URL("../schemas/http-connection-v1.schema.json", import.meta.url),
    "utf8",
  ),
);
const running: ConnectionServiceState = {
  phase: "running",
  listening: true,
  endpoint: example.endpoint,
  runId: "synthetic-run",
};

test("connection v1 matches the shared schema and rejects unsafe URLs, secrets, fields and transports", () => {
  assert.deepEqual(httpConnectionSchema.parse(example), example);
  const generated = z.toJSONSchema(httpConnectionSchema) as any;
  assert.deepEqual(new Set(generated.required), new Set(schema.required));
  assert.deepEqual(
    Object.keys(generated.properties).sort(),
    Object.keys(schema.properties).sort(),
  );
  assert.equal(generated.additionalProperties, false);
  assert.equal(schema.additionalProperties, false);
  for (const key of Object.keys(schema.properties))
    for (const check of ["const", "minLength", "maxLength", "pattern"]) {
      if (schema.properties[key][check] !== undefined)
        assert.equal(
          check === "pattern"
            ? new RegExp(generated.properties[key][check]).source
            : generated.properties[key][check],
          check === "pattern"
            ? new RegExp(schema.properties[key][check]).source
            : schema.properties[key][check],
          `${key}.${check}`,
        );
    }
  assert.equal(schema.properties.authentication.additionalProperties, false);
  assert.equal(generated.properties.authentication.additionalProperties, false);
  assert.deepEqual(schema.properties.authentication.required, ["type"]);
  assert.equal(
    generated.properties.authentication.properties.type.const,
    schema.properties.authentication.properties.type.const,
  );
  for (const port of [1, 80, 54321, 65535])
    assert.ok(
      httpConnectionSchema.safeParse({
        ...example,
        endpoint: `http://127.0.0.1:${port}/mcp`,
      }).success,
    );
  for (const endpoint of [
    "http://127.0.0.1:0/mcp",
    "http://127.0.0.1:65536/mcp",
    "http://127.0.0.1:04321/mcp",
    "http://127.0.0.1:1234/panel",
    "http://127.0.0.1:1234/a/../mcp",
    "http://127.0.0.1:1234/mcp?token=synthetic",
    "http://127.0.0.1:1234/mcp#x",
    "http://synthetic@127.0.0.1:1234/mcp",
    "https://127.0.0.1:1234/mcp",
    "http://localhost:1234/mcp",
    "http://2130706433:1234/mcp",
    "http://127.0.0.2:1234/mcp",
    "http://example.invalid:1234/mcp",
    "http://127.0.0.1:1234/mcp\n",
    "http://127.0.0.1:1234/mcp\r",
    "http://127.0.0.1:1234/mcp\u2028",
  ]) {
    assert.equal(
      httpConnectionSchema.safeParse({ ...example, endpoint }).success,
      false,
      endpoint,
    );
    assert.equal(
      new RegExp(schema.properties.endpoint.pattern).test(endpoint),
      false,
    );
  }
  for (const key of [
    "token",
    "password",
    "headers",
    "cookie",
    "apiKey",
    "command",
    "args",
    "tools",
    "inputSchema",
  ])
    assert.equal(
      httpConnectionSchema.safeParse({ ...example, [key]: "synthetic" })
        .success,
      false,
    );
  for (const patch of [
    { schemaVersion: 2 },
    { transport: "sse" },
    { transport: "stdio" },
    { scope: "remote" },
    { authentication: { type: "bearer" } },
    { authentication: { type: "none", token: "synthetic" } },
    { name: "" },
    { name: "x".repeat(81) },
    { name: "bad\nlabel" },
    { name: "bad\u007flabel" },
    { name: "demo\n" },
    { name: "demo\r" },
    { name: "demo\r\n" },
  ])
    assert.equal(
      httpConnectionSchema.safeParse({ ...example, ...patch }).success,
      false,
    );
  for (const key of schema.required) {
    const missing = { ...example };
    delete missing[key];
    assert.equal(httpConnectionSchema.safeParse(missing).success, false);
  }
});

test("connection factory uses only a current running endpoint and whitelisted data fields", () => {
  const value = createHttpConnection(
    {
      ...running,
      deployment: { tools: ["never-export"] },
      token: "never-export",
    } as ConnectionServiceState,
    "Yerel demo",
  );
  assert.deepEqual(value, { ...example, name: "Yerel demo" });
  assert.doesNotMatch(
    JSON.stringify(value),
    /never-export|deployment|tools|token/,
  );
  for (const state of [
    { ...running, listening: false },
    { ...running, endpoint: undefined },
    ...["starting", "stopping", "stopped", "error"].map((phase) => ({
      ...running,
      phase,
    })),
    { ...running, endpoint: "https://example.invalid/mcp" },
  ]) {
    assert.equal(liveConnectionKey(state), undefined);
    assert.throws(() => createHttpConnection(state, "demo"));
  }
  assert.notEqual(
    liveConnectionKey(running),
    liveConnectionKey({ ...running, runId: "new-run" }),
  );
});

test("connection export HTTP is CSRF protected, server-owned, live-only and supports fresh SDK discovery", async () => {
  const studio = await startStudio(0, {
    panelDataDir: await mkdtemp(join(tmpdir(), "specwake-connection-")),
  });
  const { token } = await (await fetch(studio.origin + "/api/session")).json();
  const post = (action: string, data: unknown = {}, csrf = token) =>
    fetch(studio.origin + "/api/panel/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Specwake-Token": csrf },
      body: JSON.stringify(data),
    });
  try {
    assert.equal(
      (await post("connection-export", { name: "demo" }, "wrong")).status,
      403,
    );
    assert.equal(
      (await post("connection-export", { name: "demo" })).status,
      409,
    );
    assert.equal(
      (await fetch(studio.origin + "/api/panel/connection-export")).status,
      404,
    );
    const group = await (await post("sample")).json();
    const op = group.operations.find((o: any) => o.id === "GET /summary");
    assert.equal(
      (
        await post("configure", {
          groupId: group.id,
          selections: [
            { id: op.id, name: op.name, description: op.description },
          ],
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("connection-export", { name: "demo" })).status,
      409,
    );
    const started = await (await post("start")).json();
    for (const data of [
      { name: "" },
      { name: "x\n" },
      { name: "x".repeat(81) },
      { name: "demo", endpoint: example.endpoint },
      { name: "demo", headers: { Authorization: "synthetic" } },
      { name: "demo", tools: [] },
    ])
      assert.equal((await post("connection-export", data)).status, 400);
    const response = await post("connection-export", {
      name: "Sentetik bağlantı",
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-disposition")!,
      /attachment; filename="specwake-http-connection-v1.json"/,
    );
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const manifest = httpConnectionSchema.parse(await response.json());
    assert.equal(manifest.endpoint, started.endpoint);
    assert.equal(manifest.name, "Sentetik bağlantı");
    const client = new Client({
      name: "connection-import-test",
      version: "1.0.0",
    });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(manifest.endpoint)),
      );
      const list = await client.listTools();
      assert.deepEqual(
        list.tools.map((t) => t.name),
        [op.name],
      );
      assert.ok(
        !(await client.callTool({ name: op.name, arguments: {} })).isError,
      );
    } finally {
      await client.close();
    }
    await post("stop");
    assert.equal(
      (await post("connection-export", { name: "demo" })).status,
      409,
    );
    const restarted = await (await post("start")).json();
    const current = httpConnectionSchema.parse(
      await (await post("connection-export", { name: "demo" })).json(),
    );
    assert.equal(current.endpoint, restarted.endpoint);
    assert.notEqual(restarted.runId, started.runId);
    // The server may legitimately reuse a port; neither file proves the run identity/liveness.
    assert.deepEqual(Object.keys(current).sort(), Object.keys(example).sort());
  } finally {
    await studio.close();
  }
});

test("UI download rejects late results after stop, restart, disconnect and endpoint changes", async () => {
  for (const next of [
    undefined,
    { ...running, phase: "stopped" },
    { ...running, listening: false },
    { ...running, runId: "new-run" },
    { ...running, endpoint: "http://127.0.0.1:54322/mcp" },
  ]) {
    let now: ConnectionServiceState | undefined = running;
    let release!: (v: unknown) => void;
    const pending = loadCurrentConnection(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      () => now,
    );
    now = next;
    release(example);
    assert.equal(await pending, undefined);
  }
  let loads = 0;
  assert.equal(
    await loadCurrentConnection(
      async () => {
        ++loads;
        return example;
      },
      () => undefined,
    ),
    undefined,
  );
  assert.equal(loads, 0);
  assert.deepEqual(
    await loadCurrentConnection(
      async () => example,
      () => running,
    ),
    example,
  );
  await assert.rejects(
    loadCurrentConnection(
      async () => ({ ...example, token: "synthetic" }),
      () => running,
    ),
  );
  await assert.rejects(
    loadCurrentConnection(
      async () => ({ ...example, endpoint: "http://127.0.0.1:54322/mcp" }),
      () => running,
    ),
  );
});

test("connection UI only offers live export, blocks transitions and explains same-machine/auth/discovery limits", () => {
  const service = { ...running, protocol: "2025-11-25", inflight: 0 };
  const render = (state: any, busy = false) =>
    renderToStaticMarkup(
      React.createElement(ConnectionGuide, {
        service: state,
        toolName: "",
        busy,
      }),
    );
  const active = render(service);
  assert.match(active, /Bağlantı JSON’unu indir/);
  assert.match(active, /aynı|Aynı bilgisayar/);
  assert.match(active, /tools\/list/);
  assert.match(active, /başka bilgisayara/);
  assert.match(active, /auth: yok/);
  for (const state of [
    { ...service, phase: "stopped" },
    { ...service, phase: "starting" },
    { ...service, phase: "stopping" },
    { ...service, listening: false },
  ])
    assert.doesNotMatch(render(state), /Bağlantı JSON’unu indir/);
  assert.match(
    render(service, true),
    /<button[^>]*disabled=""[^>]*>Bağlantı JSON’unu indir<\/button>/,
  );
  const unavailable = renderToStaticMarkup(
    React.createElement(ServiceConsole, {
      service: service as any,
      unavailable: true,
      canStart: false,
      busy: "",
      callBusy: false,
      tool: "",
      args: "{}",
      client: "panel-demo",
      onStart() {},
      onStop() {},
      onTool() {},
      onArgs() {},
      onClient() {},
      onReset() {},
      onCall() {},
      onReview() {},
    }),
  );
  assert.doesNotMatch(unavailable, /Bağlantı JSON’unu indir/);
});
