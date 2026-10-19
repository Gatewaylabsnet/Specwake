import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startStudio } from "../src/studio/server.js";
import { ApiCatalog } from "../src/ui/panel/ApiCatalog.js";
import { ConnectionGuide } from "../src/ui/panel/ConnectionGuide.js";
import { TargetNotice } from "../src/ui/panel/TargetNotice.js";
import { ServiceConsole } from "../src/ui/panel/ServiceConsole.js";
import Panel from "../src/ui/panel/Panel.js";

test("catalog offers OpenAPI upload without demo creation and labels the missing target honestly", () => {
  const html = renderToStaticMarkup(
    React.createElement(ApiCatalog, {
      groups: [],
      selections: [],
      locked: false,
      busy: false,
      hasDeployment: false,
      onGroup() {},
      onSelections() {},
      onImport() {},
      onSave() {},
      onExport() {},
    }),
  );
  assert.match(html, /OpenAPI yükle/);
  assert.match(html, /OpenAPI 3.0\/3.1/);
  assert.doesNotMatch(
    html,
    /Demo API ekle|POST demosu|Demo akışı|Operations Demo API/,
  );
  assert.match(html, /hedef yapılandırması ayrıca gerekir/);
  const initial = renderToStaticMarkup(React.createElement(Panel));
  assert.match(initial, /Bağlantı JSON’unu indir/);
  assert.doesNotMatch(
    initial,
    /href="\/developer"|Bağımsız sunucu oluşturucu|Demo API ekle|POST demosu|Demo akışını başlat/,
  );
  const notice = renderToStaticMarkup(React.createElement(TargetNotice, {}));
  assert.match(notice, /API hedefi yapılandırılmamış/);
  assert.match(notice, /HTTP hizmeti başlatılamaz/);
  const existing = renderToStaticMarkup(
    React.createElement(TargetNotice, { targetMode: "synthetic" }),
  );
  assert.match(existing, /Gerçek API çağrısı yapmaz/);
  assert.match(existing, /kayıtlar korunur/);
});

test("connection UI retains JSON export but no longer directs users through the synthetic exercise", () => {
  const service: any = {
    phase: "running",
    listening: true,
    endpoint: "http://127.0.0.1:54321/mcp",
    runId: "synthetic",
    protocol: "2025-11-25",
    inflight: 0,
  };
  const live = renderToStaticMarkup(
    React.createElement(ConnectionGuide, { service, toolName: "" }),
  );
  assert.match(live, /Bağlantı JSON’unu indir/);
  assert.match(live, /Geliştirici bağlantı örnekleri/);
  assert.doesNotMatch(
    live,
    /--exercise|Tam demo komutunu|Başarı, hata ve gecikme demosunu|\/simulate\/error/,
  );
  const inactive = {
    ...service,
    phase: "stopped",
    listening: false,
    endpoint: undefined,
    deployment: {
      groupId: "synthetic",
      revision: "synthetic",
      targetMode: "unconfigured",
      manifest: { version: 1, tools: [] },
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(ServiceConsole, {
      service: inactive,
      unavailable: false,
      canStart: true,
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
  assert.match(html, /API hedefi yapılandırılmamış/);
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*>▶ Hizmeti başlat<\/button>/,
  );
  assert.doesNotMatch(html, /Bağlantı JSON’unu indir/);
});

test("uploaded GET and approved POST can be authored but never execute against synthetic upstream; records and test profiles survive", async () => {
  const folder = await mkdtemp(join(tmpdir(), "specwake-workspace-"));
  const studio = await startStudio(0, { panelDataDir: folder });
  const { token } = await (await fetch(studio.origin + "/api/session")).json();
  const get = async (action: string) =>
    await (await fetch(studio.origin + "/api/panel/" + action)).json();
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
  try {
    // Explicit developer API continues to exercise the original fixture policy.
    const fixture = (await post("sample")).data;
    assert.equal(fixture.targetMode, "synthetic");
    const summary = fixture.operations.find((o: any) => o.path === "/summary");
    const selection = (o: any) => ({
      id: o.id,
      name: o.name,
      description: o.description,
    });
    await post("configure", {
      groupId: fixture.id,
      selections: [selection(summary)],
    });
    assert.equal((await post("start")).status, 200);
    assert.equal(
      (await post("call", { tool: summary.name, args: {}, client: "qa-demo" }))
        .status,
      200,
    );
    await post("stop");
    const before = await get("statistics?minutes=10080");
    assert.equal(before.calls, 1);
    const source = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Synthetic authoring regression", version: "1" },
      servers: [{ url: "https://never-connect.invalid" }],
      paths: {
        "/summary": {
          get: { responses: { "200": { description: "synthetic contract" } } },
        },
        "/not-a-fixture": {
          get: { responses: { "200": { description: "synthetic contract" } } },
        },
        "/catalogQuery": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { filter: { type: "string" } },
                    additionalProperties: false,
                  },
                },
              },
            },
            responses: { "200": { description: "synthetic contract" } },
          },
        },
      },
    });
    const uploaded = (await post("import", { source })).data;
    assert.equal(uploaded.targetMode, "unconfigured");
    const query = uploaded.operations.find((o: any) => o.method === "POST");
    assert.equal(
      (
        await post("configure", {
          groupId: uploaded.id,
          selections: [selection(query)],
        })
      ).status,
      400,
    );
    const selections = uploaded.operations.map((o: any) => ({
      ...selection(o),
      ...(o.method === "POST"
        ? {
            readOnlyConfirmed: true,
            responseAdapterApproved: true,
            bodyOverrideApproved: true,
            bodyOverride: { ...o.requestBody.schema, required: ["filter"] },
          }
        : {}),
    }));
    assert.equal(
      (
        await post("configure", {
          groupId: uploaded.id,
          selections,
          targetMode: "synthetic",
        })
      ).status,
      400,
    );
    const saved = await post("configure", { groupId: uploaded.id, selections });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.deployment.targetMode, "unconfigured");
    assert.equal(saved.data.deployment.manifest.tools.length, 3);
    const blocked = await post("start");
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.code, "TARGET_NOT_CONFIGURED");
    assert.equal(
      (await post("connection-export", { name: "not-live" })).status,
      409,
    );
    assert.equal(
      (await post("call", { tool: summary.name, args: {}, client: "qa-demo" }))
        .status,
      409,
    );
    const state = await get("state");
    assert.equal(state.groups.length, 2);
    assert.ok(state.groups.some((g: any) => g.id === fixture.id));
    assert.equal(state.service.listening, false);
    assert.equal(state.service.endpoint, undefined);
    const after = await get("statistics?minutes=10080");
    assert.equal(after.calls, before.calls);
    assert.deepEqual(after.recent, before.recent);
    const records = JSON.parse(
      await readFile(join(folder, "calls.json"), "utf8"),
    );
    assert.equal(records[0].id, before.recent[0].id);
    assert.equal((await fetch(studio.origin + "/developer")).status, 200);
    assert.equal((await fetch(studio.origin + "/")).status, 200);
    assert.equal((await fetch(studio.origin + "/panel")).status, 200);
  } finally {
    await studio.close();
  }
});
