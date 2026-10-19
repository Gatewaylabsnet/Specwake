import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createTcpServer } from "node:net";
import { mkdtemp, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { startStudio } from "../src/studio/server.js";
import { validateTarget } from "../src/runtime/http.js";
import { WorkspaceStore } from "../src/panel/workspace-store.js";
import { Workspace } from "../src/panel/workspace.js";
import { DemoCatalog } from "../src/panel/catalog.js";
import { ROOT } from "../src/studio/export.js";
import { startDemoApi } from "../src/demo/server.js";

const credential = "PUBLIC-SYNTHETIC-QA-CREDENTIAL";
const adapter = {
  statusField: "statusCode",
  successValues: [200],
  errorsField: "errors",
  dataField: "data",
  rowCountField: "numRows",
  maskFields: ["token", "key"],
};
async function api() {
  let requests = 0;
  const bodies: any[] = [];
  const server = createServer(async (req, res) => {
    ++requests;
    res.setHeader("Content-Type", "application/json");
    if (req.headers.authorization !== `Bearer ${credential}`) {
      res.writeHead(401);
      res.end('{"sensitive":"omitted"}');
      return;
    }
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = chunks.length
      ? JSON.parse(Buffer.concat(chunks).toString())
      : {};
    bodies.push(body);
    if (body.key === "401" || body.key === "403") {
      res.writeHead(Number(body.key));
      res.end('{"sensitive":"omitted"}');
      return;
    }
    if (body.key === "slow") {
      const timer = setTimeout(() => res.end("{}"), 5500);
      res.once("close", () => clearTimeout(timer));
      return;
    }
    res.end(
      JSON.stringify({
        statusCode: 200,
        errors: [],
        data: [{ token: credential, key: body.key ?? "GET" }],
        numRows: 1,
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
    bodies,
    count: () => requests,
    close: () =>
      new Promise<void>((r) => {
        server.close(() => r());
        server.closeAllConnections();
      }),
  };
}
function source() {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "Synthetic independent upstream", version: "1" },
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
    },
    paths: {
      "/health": { get: { responses: { "200": { description: "ok" } } } },
      "/query": {
        post: {
          requestBody: {
            content: {
              "application/json": {
                schema: { type: "string" },
                example: { key: "RAW-EXAMPLE-NOT-TO-STORE" },
              },
            },
          },
          responses: { "200": { description: "ok" } },
        },
      },
      "/mutation": {
        post: { responses: { "200": { description: "disabled" } } },
      },
    },
  });
}
async function open(folder: string) {
  const studio = await startStudio(0, { panelDataDir: folder });
  const { token } = await (await fetch(studio.origin + "/api/session")).json();
  return {
    studio,
    get: async (action: string) =>
      await (await fetch(studio.origin + "/api/panel/" + action)).json(),
    post: async (action: string, data: unknown = {}) => {
      const r = await fetch(studio.origin + "/api/panel/" + action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Specwake-Token": token,
        },
        body: JSON.stringify(data),
      });
      return { status: r.status, data: await r.json() };
    },
  };
}
async function prepare(app: Awaited<ReturnType<typeof open>>, baseUrl: string) {
  const g = (await app.post("import", { source: source() })).data;
  const selections = g.operations
    .filter((o: any) => o.path !== "/mutation")
    .map((o: any) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      ...(o.method === "POST"
        ? {
            readOnlyConfirmed: true,
            responseAdapterApproved: true,
            bodyOverrideApproved: true,
            bodyOverride: {
              type: "object",
              properties: { key: { type: "string" } },
              required: ["key"],
              additionalProperties: false,
            },
          }
        : {}),
    }));
  const saved = (await app.post("configure", { groupId: g.id, selections }))
    .data;
  const target = {
    mode: "local-test",
    baseUrl,
    allowedAddresses: ["127.0.0.1"],
    allowInsecureHttp: false,
    allowedReadPosts: ["POST /query"],
    responseAdapter: adapter,
  };
  return { g, selections, saved, target };
}
test("real operator target, JSON body, errors and stable endpoint survive app reopen without storing credentials/examples", async () => {
  process.env.SPECWAKE_BEARER_TOKEN = credential;
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-upstream-"));
  let app = await open(folder);
  try {
    const { g, selections, saved, target } = await prepare(
      app,
      upstream.baseUrl,
    );
    assert.equal(upstream.count(), 0);
    assert.equal((await app.post("start")).status, 409);
    assert.equal(
      (
        await app.post("target", {
          groupId: g.id,
          revision: saved.deployment.revision,
          target,
          approveSelection: true,
        })
      ).status,
      200,
    );
    assert.equal(
      upstream.count(),
      0,
      "settings/import do not contact upstream",
    );
    const started = (await app.post("start")).data;
    assert.equal(
      upstream.count(),
      0,
      "MCP metadata health check does not call upstream",
    );
    const connection = (
      await app.post("connection-export", {
        name: "Synthetic local acceptance",
      })
    ).data;
    assert.equal(connection.endpoint, started.endpoint);
    assert.equal(connection.schemaVersion, 1);
    const client = new Client({
      name: "independent-upstream-sdk",
      version: "1",
    });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(connection.endpoint)),
    );
    try {
      const list = await client.listTools();
      assert.equal(list.tools.length, 2);
      const query = selections.find((s: any) => s.id === "POST /query");
      const result = await client.callTool({
        name: query.name,
        arguments: { body: { key: "NORMAL" } },
      });
      assert.ok(!result.isError);
      assert.doesNotMatch(JSON.stringify(result), new RegExp(credential));
      assert.deepEqual(upstream.bodies[0], { key: "NORMAL" });
      const count = upstream.count();
      assert.equal(
        (
          await client.callTool({
            name: query.name,
            arguments: { body: { key: 1 } },
          })
        ).isError,
        true,
      );
      assert.equal(upstream.count(), count);
      await assert.rejects(
        client.callTool({
          name: g.operations.find((o: any) => o.path === "/mutation").name,
          arguments: { body: {} },
        }),
      );
      for (const key of ["401", "403", "slow"]) {
        const result = await client.callTool({
          name: query.name,
          arguments: { body: { key } },
        });
        assert.equal(result.isError, true);
        assert.match(
          JSON.stringify(result),
          new RegExp(
            key === "slow"
              ? "SW_TIMEOUT"
              : key === "401"
                ? "SW_HTTP_UNAUTHORIZED"
                : "SW_HTTP_FORBIDDEN",
          ),
        );
        assert.doesNotMatch(JSON.stringify(result), /sensitive/);
      }
    } finally {
      await client.close();
    }
    await app.post("stop");
    const restarted = (await app.post("start")).data;
    assert.equal(restarted.endpoint, connection.endpoint);
    await app.post("stop");
    await app.studio.close();
    app = await open(folder);
    const restored = await app.get("state");
    assert.equal(restored.service.phase, "stopped");
    assert.equal(restored.service.deployment.targetMode, "api");
    assert.equal(restored.workspace.profiles[0].selections.length, 2);
    assert.equal((await app.post("start")).data.endpoint, connection.endpoint);
    await app.post("stop");
    const bytes = await readFile(join(folder, "workspace.json"), "utf8");
    const logs = await readFile(join(folder, "calls.json"), "utf8");
    assert.doesNotMatch(
      bytes + logs,
      /PUBLIC-SYNTHETIC-QA-CREDENTIAL|RAW-EXAMPLE-NOT-TO-STORE|NORMAL/,
    );
    const changed = structuredClone(selections);
    changed[0].description += " changed";
    await app.post("configure", { groupId: g.id, selections: changed });
    assert.equal((await app.post("start")).status, 409);
    await app.post("configure", { groupId: g.id, selections: [] });
    await app.studio.close();
    app = await open(folder);
    const revoked = await app.get("state");
    assert.equal(revoked.groups.length, 1);
    assert.equal(revoked.workspace.profiles.length, 0);
    assert.equal(revoked.service.deployment, undefined);
    assert.equal((await app.post("start")).status, 409);
  } finally {
    await app.studio.close();
    await upstream.close();
    delete process.env.SPECWAKE_BEARER_TOKEN;
  }
});

test("fixed MCP port conflicts fail explicitly and controlled port changes are persisted", async () => {
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-port-"));
  const app = await open(folder);
  const occupied = createTcpServer();
  try {
    const { g, saved, target } = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: g.id,
      revision: saved.deployment.revision,
      target,
      approveSelection: true,
    });
    const port = (await app.get("state")).workspace.mcpPort;
    await new Promise<void>((r) => occupied.listen(port, "127.0.0.1", r));
    const failed = await app.post("start");
    assert.equal(failed.status, 503);
    assert.equal(failed.data.code, "MCP_PORT_IN_USE");
    assert.equal((await app.get("state")).workspace.mcpPort, port);
    await new Promise<void>((r) => occupied.close(() => r()));
    const reserved = createTcpServer();
    await new Promise<void>((r) => reserved.listen(0, "127.0.0.1", r));
    const next = (reserved.address() as any).port;
    await new Promise<void>((r) => reserved.close(() => r()));
    assert.equal(
      (await app.post("connection-settings", { mcpPort: next })).status,
      200,
    );
    assert.equal(
      (await app.post("start")).data.endpoint,
      `http://127.0.0.1:${next}/mcp`,
    );
  } finally {
    if (occupied.listening)
      await new Promise<void>((r) => occupied.close(() => r()));
    await app.studio.close();
    await upstream.close();
  }
});

test("workspace approval binding detects disk context changes and unknown/corrupt schemas preserve original files", async () => {
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-binding-"));
  let app = await open(folder);
  try {
    const { g, saved, target } = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: g.id,
      revision: saved.deployment.revision,
      target,
      approveSelection: true,
    });
    await app.studio.close();
    const file = join(folder, "workspace.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    data.groups[0].operations[0].description += " tampered";
    await writeFile(file, JSON.stringify(data));
    app = await open(folder);
    const s = await app.get("state");
    assert.equal(s.workspace.warning, "STORED_APPROVAL_CHANGED");
    assert.equal((await app.post("start")).status, 409);
    await app.studio.close();
    const bad = JSON.stringify({ ...data, version: 99 });
    await writeFile(file, bad);
    await assert.rejects(new WorkspaceStore(folder).load());
    assert.equal(await readFile(file, "utf8"), bad);
  } finally {
    await app.studio.close();
    await upstream.close();
  }
});

test("explicit local-test mode accepts only literal fixed loopback and never arbitrary remote HTTP", () => {
  const base = {
    mode: "local-test",
    baseUrl: "http://127.0.0.1:54321",
    allowedAddresses: ["127.0.0.1"],
    allowInsecureHttp: false,
  };
  assert.ok(validateTarget(base));
  for (const url of [
    "http://localhost:54321",
    "http://2130706433:54321",
    "http://example.invalid:54321",
    "http://169.254.169.254:54321",
    "http://127.0.0.2:54321",
    "http://127.0.0.1",
    "http://127.0.0.1:054321",
  ])
    assert.throws(() => validateTarget({ ...base, baseUrl: url }));
});

test("legacy journal migration preserves event identities and new settings do not overwrite the journal", async () => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-legacy-"));
  let app = await open(folder);
  try {
    const g = (await app.post("sample")).data;
    const op = g.operations.find((o: any) => o.path === "/summary");
    await app.post("configure", {
      groupId: g.id,
      selections: [{ id: op.id, name: op.name, description: op.description }],
    });
    await app.post("start");
    await app.post("call", { tool: op.name, args: {}, client: "qa-demo" });
    await app.post("stop");
    await app.studio.close();
    const previous = await readFile(join(folder, "calls.json"), "utf8");
    await unlink(join(folder, "workspace.json"));
    app = await open(folder);
    const s = await app.get("state");
    assert.equal(s.groups.length, 0);
    assert.ok(s.workspace.mcpPort > 0);
    assert.equal(await readFile(join(folder, "calls.json"), "utf8"), previous);
    assert.equal((await app.get("statistics?minutes=10080")).calls, 1);
  } finally {
    await app.studio.close();
  }
});

test("revoking one persisted profile never resurrects its approval or removes unrelated profiles", async () => {
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-revoke-"));
  let app = await open(folder);
  try {
    const first = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: first.g.id,
      revision: first.saved.deployment.revision,
      target: first.target,
      approveSelection: true,
    });
    const second = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: second.g.id,
      revision: second.saved.deployment.revision,
      target: second.target,
      approveSelection: true,
    });
    await app.post("configure", { groupId: first.g.id, selections: [] });
    assert.equal(
      (await app.get("state")).service.deployment.groupId,
      second.g.id,
    );
    await app.studio.close();
    app = await open(folder);
    const s = await app.get("state");
    assert.equal(s.groups.length, 2);
    assert.equal(s.workspace.profiles.length, 1);
    assert.equal(s.workspace.profiles[0].groupId, second.g.id);
    await app.post("configure", {
      groupId: first.g.id,
      selections: first.selections,
    });
    assert.equal((await app.post("start")).status, 409);
  } finally {
    await app.studio.close();
    await upstream.close();
  }
});

test("restoring an approved real target with an external listener is denied before opening MCP and preserves disk", async () => {
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-bind-"));
  const app = await open(folder);
  const demo = await startDemoApi();
  try {
    const p = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: p.g.id,
      revision: p.saved.deployment.revision,
      target: p.target,
      approveSelection: true,
    });
    const state = await app.get("state");
    await app.studio.close();
    const bytes = await readFile(join(folder, "workspace.json"), "utf8");
    const catalog = await DemoCatalog.create(ROOT);
    await assert.rejects(
      Workspace.open(
        catalog,
        folder,
        demo,
        { append: async () => {} },
        { bindAddress: "0.0.0.0", mcpPort: state.workspace.mcpPort },
      ),
      (e: any) => e.code === "LOOPBACK_REQUIRED",
    );
    assert.equal(await readFile(join(folder, "workspace.json"), "utf8"), bytes);
  } finally {
    await app.studio.close();
    await demo.close();
    await upstream.close();
  }
});

test("failed settings writes leave current port, active selection and approved target unchanged", async () => {
  const upstream = await api();
  const folder = await mkdtemp(join(tmpdir(), "specwake-write-"));
  const app = await open(folder);
  try {
    const p = await prepare(app, upstream.baseUrl);
    await app.post("target", {
      groupId: p.g.id,
      revision: p.saved.deployment.revision,
      target: p.target,
      approveSelection: true,
    });
    const s = await app.get("state");
    const bytes = await readFile(join(folder, "workspace.json"), "utf8");
    await mkdir(join(folder, "workspace.pending"));
    const other = s.workspace.mcpPort === 65432 ? 65431 : 65432;
    assert.equal(
      (await app.post("connection-settings", { mcpPort: other })).status,
      500,
    );
    assert.equal(
      (await app.get("state")).workspace.mcpPort,
      s.workspace.mcpPort,
    );
    assert.equal(await readFile(join(folder, "workspace.json"), "utf8"), bytes);
    assert.equal((await app.post("start")).status, 200);
  } finally {
    await app.studio.close();
    await upstream.close();
  }
});
