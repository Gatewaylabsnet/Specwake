import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PUBLIC_QA_TOKEN } from "./qa-upstream.js";
import { httpConnectionSchema } from "../core/http-connection.js";
import { z } from "zod";

export async function upstreamSelfTest(
  origin: string,
  reportPath: string,
  contextPath: string,
  dataFolder: string,
) {
  const context = z
    .object({
      baseUrl: z.string().regex(/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/),
      stage: z.enum(["first", "reopen"]),
    })
    .strict()
    .parse(JSON.parse(await readFile(contextPath, "utf8")));
  // Only this disposable --self-test process gets a public fixture credential.
  process.env.SPECWAKE_BEARER_TOKEN = PUBLIC_QA_TOKEN;
  const { token } = await (await fetch(origin + "/api/session")).json();
  const get = async (action: string) =>
    (await fetch(origin + "/api/panel/" + action)).json();
  const post = async (action: string, data: unknown = {}, expected = 200) => {
    const r = await fetch(origin + "/api/panel/" + action, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Specwake-Token": token,
      },
      body: JSON.stringify(data),
    });
    const result = await r.json();
    assert.equal(r.status, expected, action);
    return result;
  };
  const before = await get("statistics?minutes=10080");
  let state = await get("state");
  assert.equal(state.service.phase, "stopped");
  if (context.stage === "first") {
    const source = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "Independent upstream package acceptance", version: "1" },
      security: [{ bearer: [] }],
      components: {
        securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      },
      paths: {
        "/health": {
          get: {
            operationId: "qa_health",
            responses: { "200": { description: "public fixture" } },
          },
        },
        "/query": {
          post: {
            operationId: "qa_query",
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "string" },
                  example: { requestTag: "QA_RAW_EXAMPLE_MUST_NOT_BE_SAVED" },
                },
              },
            },
            responses: { "200": { description: "public fixture" } },
          },
        },
        "/disabled-mutation": {
          post: {
            operationId: "qa_disabled_mutation",
            responses: { "200": { description: "must not be selected" } },
          },
        },
      },
    });
    const g = await post("import", { source });
    const selections = g.operations
      .filter((o: any) => o.path !== "/disabled-mutation")
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
                properties: { requestTag: { type: "string" } },
                required: ["requestTag"],
                additionalProperties: false,
              },
            }
          : {}),
      }));
    await post("configure", { groupId: g.id, selections });
    state = await get("state");
    await post("target", {
      groupId: g.id,
      revision: state.service.deployment.revision,
      approveSelection: true,
      target: {
        mode: "local-test",
        baseUrl: context.baseUrl,
        allowedAddresses: ["127.0.0.1"],
        allowInsecureHttp: false,
        allowedReadPosts: ["POST /query"],
        responseAdapter: {
          statusField: "statusCode",
          successValues: [200],
          errorsField: "errors",
          dataField: "data",
          rowCountField: "numRows",
          maskFields: ["requestTag", "token", "fullName"],
        },
      },
    });
  } else {
    assert.equal(state.service.deployment.targetMode, "api");
    assert.equal(state.workspace.profiles[0].selections.length, 2);
    const previous = JSON.parse(
      await readFile(join(dirname(reportPath), "first.json"), "utf8"),
    );
    assert.equal(before.calls, previous.retainedAfter);
    for (const id of previous.retainedIds)
      assert.ok(before.recent.some((r: any) => r.id === id));
  }
  const running = await post("start");
  const manifest = httpConnectionSchema.parse(
    await post("connection-export", { name: "Packaged upstream acceptance" }),
  );
  if (context.stage === "first")
    await writeFile(
      join(dirname(reportPath), "connection.json"),
      JSON.stringify(manifest),
    );
  const saved = httpConnectionSchema.parse(
    JSON.parse(
      await readFile(join(dirname(reportPath), "connection.json"), "utf8"),
    ),
  );
  assert.equal(manifest.endpoint, saved.endpoint);
  const tools = running.deployment.manifest.tools;
  const query = tools.find((t: any) => t.path === "/query");
  const health = tools.find((t: any) => t.path === "/health");
  const client = async (tool: string, args: unknown) => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    const child = await promisify(execFile)(
      process.execPath,
      [
        "--mcp-client",
        `--endpoint=${saved.endpoint}`,
        `--tool=${tool}`,
        `--args=${JSON.stringify(args)}`,
      ],
      { env, windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
    );
    assert.equal(child.stderr, "");
    const report = JSON.parse(child.stdout);
    assert.equal(report.initialized, true);
    assert.equal(report.tools.length, 2);
    return report.result;
  };
  const ok = await client(query.name, { body: { requestTag: "normal" } });
  assert.ok(!ok.isError);
  assert.equal(ok.structuredContent.status, "success");
  assert.doesNotMatch(
    JSON.stringify(ok),
    /SPECWAKE_PUBLIC_QA_TOKEN|SYNTHETIC-NOT-A-PERSON/,
  );
  assert.ok(!(await client(health.name, {})).isError);
  if (context.stage === "first") {
    for (const [requestTag, code] of [
      ["application-error", "SW_APPLICATION_ERROR"],
      ["401", "SW_HTTP_UNAUTHORIZED"],
      ["403", "SW_HTTP_FORBIDDEN"],
      ["slow", "SW_TIMEOUT"],
    ]) {
      const result = await client(query.name, { body: { requestTag } });
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result), new RegExp(code));
      assert.doesNotMatch(JSON.stringify(result), /do-not-return-qa-error/);
    }
    assert.equal(
      (await client(query.name, { body: { requestTag: 42 } })).isError,
      true,
    );
    await assert.rejects(client("never_selected_mutation", { body: {} }));
  } else {
    delete process.env.SPECWAKE_BEARER_TOKEN;
    assert.match(
      JSON.stringify(
        await client(query.name, { body: { requestTag: "normal" } }),
      ),
      /SW_CREDENTIAL_MISSING/,
    );
    process.env.SPECWAKE_BEARER_TOKEN = PUBLIC_QA_TOKEN;
  }
  await post("stop");
  await post("start");
  assert.ok(!(await client(health.name, {})).isError);
  await post("stop");
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(Number(new URL(saved.endpoint).port), "127.0.0.1", resolve);
  });
  try {
    assert.equal((await post("start", {}, 503)).code, "MCP_PORT_IN_USE");
    assert.equal(
      (await get("state")).workspace.mcpPort,
      Number(new URL(saved.endpoint).port),
    );
  } finally {
    await new Promise<void>((r) => blocker.close(() => r()));
  }
  await post("start");
  assert.ok(!(await client(health.name, {})).isError);
  await post("stop");
  const stats = await get("statistics?minutes=10080");
  const disk =
    (await readFile(join(dataFolder, "workspace.json"), "utf8")) +
    (await readFile(join(dataFolder, "calls.json"), "utf8"));
  assert.doesNotMatch(
    disk,
    /SPECWAKE_PUBLIC_QA_TOKEN|QA_RAW_EXAMPLE_MUST_NOT_BE_SAVED|SYNTHETIC-NOT-A-PERSON/,
  );
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        passed: true,
        packaged: true,
        managementPanel: true,
        stage: context.stage,
        endpoint: saved.endpoint,
        origin,
        retainedAfter: stats.calls,
        retainedIds: stats.recent.map((e: any) => e.id),
        checks: [
          "normal OpenAPI import, selected GET + approved POST object body",
          "operator local-test upstream target, no demo provider",
          "separate packaged official SDK initialize/list/call",
          "connection manifest v1 unchanged",
          "401/403/timeout/application error/wrong body/disabled mutation",
          "fixed port conflict fails without fallback",
          "old JSON reused after stop/start and app reopen",
          "credential and raw example not persisted",
        ],
        reopenVerified: context.stage === "reopen",
      },
      null,
      2,
    ),
  );
}
