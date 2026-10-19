import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { importSpec, selectTools } from "../src/core/import.js";
import { validateManifest, inputSchema } from "../src/core/contracts.js";
import { normalizeBodySchema } from "../src/core/body-schema.js";
import { DemoCatalog } from "../src/panel/catalog.js";
import { startDemoApi } from "../src/demo/server.js";
import { executeTool } from "../src/runtime/http.js";
import { ROOT } from "../src/studio/export.js";
import type { Selection } from "../src/core/model.js";
import { adaptResult } from "../src/runtime/result-adapter.js";
import { READ_POST_ADAPTER } from "../src/demo/read-post-profile.js";

const source = await readFile(
  new URL("../examples/read-post-synthetic.json", import.meta.url),
  "utf8",
);
const spec = importSpec(source);
function choice(path = "/realPersonSearch"): Selection {
  const op = spec.operations.find((o) => o.path === path)!;
  return {
    id: op.id,
    name: op.name,
    description: op.description,
    readOnlyConfirmed: true,
    bodyOverrideApproved: true,
    responseAdapterApproved: true,
    bodyOverride: {
      ...op.requestBody!.proposal!,
      required: Object.keys(op.requestBody!.proposal!.properties!),
    },
  };
}
const selected = () => selectTools(spec, [choice()]).tools[0];

test("configured nested result envelopes fail closed and redact recursively", () => {
  const adapter = { ...READ_POST_ADAPTER, resultField: "result" };
  const wrap = (value: unknown) =>
    adaptResult(
      JSON.stringify(value),
      adapter,
      selected(),
      "2026-10-19T00:00:00Z",
      ["DEMO-INPUT"],
    );
  assert.throws(
    () => wrap({ statusCode: 200, data: { result: [] } }),
    (error: any) => error.code === 'SW_RESPONSE_ENVELOPE',
  );
  assert.throws(
    () => wrap({ statusCode: 200, errors: [], data: {} }),
    (error: any) => error.code === 'SW_RESULT_MISSING',
  );
  const result = wrap({
    statusCode: 200,
    errors: [],
    data: { result: [{ nested: { IdNo: "FAKE", message: "DEMO-INPUT" } }] },
    numRows: 1,
  });
  assert.equal(result.status, "success");
  assert.equal(result.complete, false);
  assert.doesNotMatch(JSON.stringify(result), /FAKE|DEMO-INPUT/);
});

test("synthetic GET health operations use the separate upstream mock provider", async () => {
  const demo = await startDemoApi();
  try {
    for (const path of ["/health", "/health2"]) {
      const op = spec.operations.find((o) => o.path === path)!;
      const tool = selectTools(spec, [
        { id: op.id, name: op.name, description: op.description },
      ]).tools[0];
      const result = await executeTool(
        tool,
        {},
        demo.target,
        {},
        demo.executionContext,
      );
      assert.ok(!result.isError);
      assert.match(JSON.stringify(result), /healthy/);
      assert.equal(
        (await executeTool(tool, {}, demo.target, {}, {})).structuredContent
          ?.error?.code,
        "SW_CREDENTIAL_MISSING",
      );
    }
  } finally {
    await demo.close();
  }
});

test("synthetic 38-operation structural fixture keeps defaults closed and never invents required fields", async () => {
  assert.equal(spec.operations.length, 38);
  assert.equal(spec.operations.filter((o) => o.method === "POST").length, 36);
  assert.equal(
    spec.operations.filter((o) => o.requestBody?.declaredType === "string")
      .length,
    31,
  );
  assert.equal(
    spec.operations.filter(
      (o) => o.method === "POST" && o.responseWarnings?.length,
    ).length,
    36,
  );
  const op = spec.operations.find((o) => o.path === "/realPersonSearch")!;
  assert.equal(op.auth.kind, "bearer");
  assert.ok(op.requestBody!.warnings.length);
  assert.equal(op.requestBody!.schema, undefined);
  assert.equal(op.requestBody!.proposal!.required, undefined);
  assert.equal(op.requestBody!.proposal!.properties!.IdNo.type, "string");
  assert.doesNotMatch(JSON.stringify(op.requestBody!.proposal), /DEMO-ID/);
  assert.throws(() =>
    selectTools(spec, [
      { id: op.id, name: op.name, description: op.description },
    ]),
  );
  assert.throws(() =>
    selectTools(spec, [{ ...choice(), bodyOverrideApproved: false }]),
  );
  const catalog = await DemoCatalog.create(ROOT);
  const group = catalog.import(source);
  assert.equal(catalog.originalSource(group.id), source);
  for (const path of [
    "/acmFieldProductLockTarsimSet",
    "/findStockholder",
    "/FarmerSupportOut",
    "/FarmerSupportOutList",
  ]) {
    const blocked = group.operations.find((o) => o.path === path)!;
    assert.throws(() =>
      catalog.select(group.id, [
        { ...choice(), id: blocked.id, name: blocked.name },
      ]),
    );
  }
});

test("read-POST manifest and JSON input schema require explicit approval and object body", () => {
  const tool = selected();
  const schema = inputSchema(tool) as any;
  assert.equal(schema.properties.body.type, "object");
  assert.deepEqual(schema.properties.body.required, ["IdNo"]);
  assert.equal(schema.properties.body.properties.IdNo.type, "string");
  assert.equal(schema.properties.body.additionalProperties, false);
  assert.throws(() =>
    validateManifest({ version: 1, tools: [{ ...tool, path: "/mutation" }] }),
  );
  assert.throws(() =>
    validateManifest({
      version: 1,
      tools: [{ ...tool, readOnlyConfirmed: undefined }],
    }),
  );
  for (const body of [
    { type: "object", properties: { a: { type: "string", format: "uri" } } },
    { type: "object", properties: { constructor: { type: "string" } } },
    { type: "object", properties: {}, required: ["invented"] },
  ])
    assert.throws(() => normalizeBodySchema(body));
});

test("approved POST sends a single JSON object and wraps redacted source-attributed untrusted data", async () => {
  const demo = await startDemoApi();
  try {
    const result = await executeTool(
      selected(),
      { body: { IdNo: "DEMO-LEADING-0001" } },
      demo.target,
      {},
      demo.executionContext,
    );
    assert.ok(!result.isError, JSON.stringify(result));
    const payload = result.structuredContent!;
    assert.equal(payload.status, "success");
    assert.equal(payload.complete, false);
    assert.equal(payload.untrustedData, true);
    assert.equal((payload.source as any).operation, "POST /realPersonSearch");
    assert.ok(!Number.isNaN(Date.parse((payload.source as any).queriedAt)));
    assert.doesNotMatch(
      JSON.stringify(result),
      /DEMO-LEADING-0001|SYNTHETIC PERSON|SYNTHETIC ADDRESS|DEMO-NOT-AN-ACCOUNT|public-synthetic-upstream/,
    );
    assert.match(JSON.stringify(result), /REDACTED/);
  } finally {
    await demo.close();
  }
});

test("runtime blocks unapproved targets, mutation aliases, invalid body, missing and rejected upstream credentials", async () => {
  const demo = await startDemoApi();
  const code = async (
    tool: any,
    args: any,
    target: any = demo.target,
    context: any = demo.executionContext,
  ) =>
    (await executeTool(tool, args, target, {}, context)).structuredContent
      ?.error?.code;
  try {
    const tool = selected();
    const args = { body: { IdNo: "DEMO-ID" } };
    assert.equal(
      await code(tool, args, { ...demo.target, allowedReadPosts: [] }),
      "SW_OPERATION_FORBIDDEN",
    );
    assert.equal(
      await code({ ...tool, path: "/acmFieldProductLockTarsimSet" }, args),
      "SW_OPERATION_FORBIDDEN",
    );
    for (const body of [
      '{"IdNo":"DEMO-ID"}',
      { IdNo: 123 },
      { IdNo: "DEMO-ID", url: "http://evil.invalid" },
      {},
    ])
      assert.equal(await code(tool, { body }), "SW_PARAMETER_INVALID");
    assert.equal(
      await code(tool, args, demo.target, {}),
      "SW_CREDENTIAL_MISSING",
    );
    assert.equal(
      await code(tool, args, demo.target, {
        tokenProvider: { bearerToken: async () => "wrong-public-fixture" },
      }),
      "SW_HTTP_UNAUTHORIZED",
    );
    assert.equal(
      await code(tool, { body: { IdNo: "demo-403" } }),
      "SW_HTTP_FORBIDDEN",
    );
    assert.equal(
      await code(tool, { body: { IdNo: "demo-401" } }),
      "SW_HTTP_UNAUTHORIZED",
    );
  } finally {
    await demo.close();
  }
});

test("HTTP 200 application errors, empty, partial and missing results are distinct and never imply completeness", async () => {
  const demo = await startDemoApi();
  try {
    for (const [id, status, code] of [
      ["demo-app-error", "error", "SW_APPLICATION_ERROR"],
      ["demo-empty", "empty", undefined],
      ["demo-missing", "error", "SW_RESULT_MISSING"],
      ["demo-partial", "partial", undefined],
    ] as const) {
      const result = await executeTool(
        selected(),
        { body: { IdNo: id } },
        demo.target,
        {},
        demo.executionContext,
      );
      assert.equal(result.structuredContent!.status, status);
      assert.equal(result.structuredContent!.complete, false);
      assert.equal(result.structuredContent!.error?.code, code);
      assert.doesNotMatch(
        JSON.stringify(result),
        /synthetic-sensitive-error-omitted/,
      );
    }
  } finally {
    await demo.close();
  }
});

test("read-POST deadline, cancellation and response/request limits fail with safe codes", async () => {
  const demo = await startDemoApi();
  try {
    const tool = selected();
    let result = await executeTool(
      tool,
      { body: { IdNo: "demo-slow" } },
      demo.target,
      {},
      demo.executionContext,
    );
    assert.equal(result.structuredContent!.error?.code, "SW_TIMEOUT");
    const abort = new AbortController();
    const pending = executeTool(
      tool,
      { body: { IdNo: "demo-slow" } },
      demo.target,
      {},
      { ...demo.executionContext, signal: abort.signal },
    );
    const timer = setTimeout(() => abort.abort(), 50);
    result = await pending;
    clearTimeout(timer);
    assert.equal(result.structuredContent!.error?.code, "SW_CANCELLED");
    result = await executeTool(
      tool,
      { body: { IdNo: "demo-large" } },
      demo.target,
      {},
      demo.executionContext,
    );
    assert.equal(
      result.structuredContent!.error?.code,
      "SW_RESPONSE_TOO_LARGE",
    );
    const properties = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [
        "f" + i,
        { type: "string" as const },
      ]),
    );
    const largeTool = {
      ...tool,
      bodySchema: { type: "object" as const, properties },
    };
    result = await executeTool(
      largeTool,
      {
        body: Object.fromEntries(
          Object.keys(properties).map((key) => [key, "x".repeat(1000)]),
        ),
      },
      demo.target,
      {},
      demo.executionContext,
    );
    assert.equal(result.structuredContent!.error?.code, "SW_REQUEST_TOO_LARGE");
  } finally {
    await demo.close();
  }
});

test("pending upstream token providers share the invocation deadline and receive cancellation", async () => {
  const demo = await startDemoApi();
  try {
    let providerAborted = false;
    const context = {
      tokenProvider: {
        bearerToken: async (signal?: AbortSignal) =>
          new Promise<string>(() => {
            signal?.addEventListener(
              "abort",
              () => {
                providerAborted = true;
              },
              { once: true },
            );
          }),
      },
    };
    const started = Date.now();
    const timeout = await executeTool(
      selected(),
      { body: { IdNo: "DEMO-ID" } },
      demo.target,
      {},
      context,
    );
    assert.equal(timeout.structuredContent?.error?.code, "SW_TIMEOUT");
    assert.ok(Date.now() - started < 6500);
    assert.equal(providerAborted, true);
    const abort = new AbortController();
    const pending = executeTool(
      selected(),
      { body: { IdNo: "DEMO-ID" } },
      demo.target,
      {},
      { ...context, signal: abort.signal },
    );
    const timer = setTimeout(() => abort.abort(), 25);
    const cancelled = await pending;
    clearTimeout(timer);
    assert.equal(cancelled.structuredContent?.error?.code, "SW_CANCELLED");
  } finally {
    await demo.close();
  }
});
