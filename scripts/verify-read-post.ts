import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { startStudio } from "../src/studio/server.js";
import { ROOT, exportPackage } from "../src/studio/export.js";
import { importSpec, selectTools } from "../src/core/import.js";
import { inputSchema } from "../src/core/contracts.js";
import { startDemoApi } from "../src/demo/server.js";
import { MOCK_UPSTREAM_TOKEN } from "../src/demo/read-post-profile.js";
import type { Selection } from "../src/core/model.js";
const exec = promisify(execFile);
let stage = "startup";
async function main() {
  const dataDir = await mkdtemp(join(tmpdir(), "specwake-read-post-"));
  let studio = await startStudio(0, { panelDataDir: dataDir });
  let token = (await (await fetch(studio.origin + "/api/session")).json())
    .token;
  const get = async (action: string) =>
    await (await fetch(studio.origin + "/api/panel/" + action)).json();
  const post = async (action: string, value: unknown = {}, status = 200) => {
    const response = await fetch(studio.origin + "/api/panel/" + action, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Specwake-Token": token,
      },
      body: JSON.stringify(value),
    });
    assert.equal(response.status, status);
    return response.json();
  };
  try {
    const source = await readFile(
      resolve(ROOT, "examples/read-post-synthetic.json"),
      "utf8",
    );
    const spec = importSpec(source);
    stage = "import";
    const group = await post("read-post-sample");
    const selections: Selection[] = spec.operations
      .filter((o) =>
        ["/realPersonSearch", "/GetFieldProductPerson"].includes(o.path),
      )
      .map((o) => ({
        id: o.id,
        name: o.name,
        description: o.description,
        readOnlyConfirmed: true,
        bodyOverrideApproved: true,
        responseAdapterApproved: true,
        bodyOverride: {
          ...o.requestBody!.proposal!,
          required: Object.keys(o.requestBody!.proposal!.properties!),
        },
      }));
    await post(
      "configure",
      {
        groupId: group.id,
        selections: selections.map(({ readOnlyConfirmed, ...s }) => s),
      },
      400,
    );
    stage = "configure";
    await post("configure", { groupId: group.id, selections });
    stage = "start";
    const running = await post("start");
    const invoke = async (name: string, args: unknown) => {
      const { stdout } = await exec(
        process.execPath,
        [
          "--import",
          "tsx",
          resolve(ROOT, "scripts/mcp-demo-client.ts"),
          "--endpoint",
          running.endpoint,
          "--tool",
          name,
          "--args",
          JSON.stringify(args),
        ],
        {
          cwd: ROOT,
          windowsHide: true,
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        },
      );
      return JSON.parse(stdout);
    };
    stage = "person call";
    const person = await invoke(selections[0].name, {
      body: { IdNo: "DEMO-HTTP-0001" },
    });
    stage = "product call";
    const product = await invoke(selections[1].name, {
      body: { ProductionYear: "DEMO-2099", IdTaxNo: "DEMO-TAX-0001" },
    });
    for (const report of [person, product]) {
      assert.equal(report.initialized, true);
      assert.equal(report.tools.length, 2);
      assert.ok(!report.result.isError);
      assert.equal(report.result.structuredContent.status, "success");
      assert.equal(report.result.structuredContent.complete, false);
      assert.doesNotMatch(
        JSON.stringify(report.result),
        /DEMO-HTTP-0001|DEMO-TAX-0001|SYNTHETIC PERSON|public-synthetic-upstream/,
      );
    }
    stage = "application error";
    const failed = await invoke(selections[0].name, {
      body: { IdNo: "demo-app-error" },
    });
    assert.equal(failed.result.isError, true);
    assert.equal(
      failed.result.structuredContent.error.code,
      "SW_APPLICATION_ERROR",
    );
    const invalid = await invoke(selections[0].name, { body: { IdNo: 123 } });
    assert.equal(invalid.result.isError, true);
    assert.match(JSON.stringify(invalid.result), /SW_PARAMETER_INVALID/);
    await assert.rejects(invoke("never_selected_mutation", { body: {} }));
    await post("configure", { groupId: group.id, selections: [] }, 409);
    stage = "statistics";
    const stats = await get(`statistics?minutes=10080&groupId=${group.id}`);
    assert.equal(stats.calls, 5);
    assert.equal(stats.errors, 3);
    await post("stop");
    await post("configure", { groupId: group.id, selections: [] });
    await post("start", {}, 409);
    await assert.rejects(
      fetch(running.endpoint, { signal: AbortSignal.timeout(1000) }),
    );
    stage = "restart";
    await studio.close();
    studio = await startStudio(0, { panelDataDir: dataDir });
    token = (await (await fetch(studio.origin + "/api/session")).json()).token;
    const restarted = await get("state");
    const persisted = await get("statistics?minutes=10080");
    assert.equal(restarted.groups.length, 0);
    assert.equal(restarted.service.phase, "stopped");
    assert.equal(restarted.service.deployment, undefined);
    assert.equal(persisted.calls, 5);
    assert.deepEqual(
      new Set(persisted.recent.map((e: any) => e.id)),
      new Set(stats.recent.map((e: any) => e.id)),
    );
    const raw = await readFile(join(dataDir, "calls.json"), "utf8");
    assert.doesNotMatch(
      raw,
      /IdNo|IdTaxNo|DEMO-HTTP|DEMO-TAX|public-synthetic-upstream|Authorization/,
    );

    const manifest = selectTools(spec, selections);
    stage = "export";
    const archive = await exportPackage(manifest);
    const standalone = await mkdtemp(
      join(tmpdir(), "specwake-read-post-export-"),
    );
    assert.ok(!standalone.startsWith(ROOT));
    for (const [name, bytes] of Object.entries(unzipSync(archive))) {
      const file = resolve(standalone, name);
      const part = relative(standalone, file);
      assert.ok(part && !part.startsWith("..") && !isAbsolute(part));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
    }
    const npmCli =
      process.env.npm_execpath ??
      resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
    const clean = { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" };
    stage = "clean install";
    await exec(process.execPath, [npmCli, "ci", "--no-audit", "--no-fund"], {
      cwd: standalone,
      env: clean,
      windowsHide: true,
      timeout: 120000,
    });
    stage = "clean build";
    await exec(process.execPath, [npmCli, "run", "build"], {
      cwd: standalone,
      env: clean,
      windowsHide: true,
      timeout: 60000,
    });
    const upstream = await startDemoApi();
    const client = new Client({
      name: "separate-read-post-stdio",
      version: "1",
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(standalone, "dist/runtime/cli.js")],
      cwd: standalone,
      stderr: "pipe",
      env: {
        NODE_OPTIONS: "",
        NODE_PATH: "",
        SPECWAKE_BEARER_TOKEN: MOCK_UPSTREAM_TOKEN,
      },
    });
    let stderr = "";
    transport.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    try {
      await writeFile(
        join(standalone, "target.json"),
        JSON.stringify(upstream.target),
      );
      stage = "stdio";
      await client.connect(transport);
      const tools = await client.listTools();
      assert.equal(tools.tools.length, 2);
      const result = await client.callTool({
        name: manifest.tools[0].name,
        arguments: { body: { IdNo: "DEMO-STDIO-0001" } },
      });
      assert.ok(!result.isError);
      assert.equal(
        (result.structuredContent as { status?: string } | undefined)?.status,
        "success",
      );
      assert.doesNotMatch(
        JSON.stringify(result),
        /DEMO-STDIO-0001|public-synthetic-upstream/,
      );
      await assert.rejects(() =>
        client.callTool({ name: "never_selected_mutation", arguments: {} }),
      );
      assert.equal(stderr, "");
    } finally {
      await client.close();
      await transport.close();
      await upstream.close();
    }
    const report = {
      passed: true,
      at: new Date().toISOString(),
      protocol: running.protocol,
      transport: "stateless Streamable HTTP / JSON",
      endpointDuringVerification: running.endpoint,
      endpointStoppedAfterVerification: true,
      tools: manifest.tools.map((t) => ({
        name: t.name,
        operation: t.operationId,
        inputSchema: inputSchema(t),
      })),
      http: {
        separateOfficialSdkProcesses: true,
        calls: stats.calls,
        errors: stats.errors,
      },
      stdio: {
        cleanExportOutsideRepository: true,
        folder: standalone,
        passed: true,
      },
      persistence: {
        metadataRetained: true,
        groupsRetained: false,
        manifestRetained: false,
        approvalsRetained: false,
      },
      approvalRevocationVerified: true,
      metadataOnly: true,
    };
    await mkdir(resolve(ROOT, "artifacts"), { recursive: true });
    await writeFile(
      resolve(ROOT, "artifacts/read-post-verification.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await studio.close();
  }
}
main().catch((error) => {
  console.error(
    `Read-POST synthetic verification failed at ${stage}: ${error?.code ?? "verification"}.`,
  );
  process.exitCode = 1;
});
