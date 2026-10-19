import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

// Deliberately uses only a fresh project/volume. It never starts Docker or changes OS settings.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const project = `specwake-verify-${suffix}`;
const volume = `${project}-metadata`;
const image = `specwake:verify-${suffix}`;
const origin = "http://127.0.0.1:4319";
const report = { project, volume, image, startedAt: new Date().toISOString(), status: "failed", checks: [] };
const env = { ...process.env, SPECWAKE_IMAGE: image, SPECWAKE_DATA_VOLUME: volume };
let started = false;
let failure;
function run(command, args, { quiet = false, optional = false, combined = false, timeout = 300000 } = {}) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) {
    if (optional) return undefined;
    // Do not echo raw Docker/application logs or subprocess output to the report.
    throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed (exit ${result.status ?? "unavailable"}). Inspect locally; raw output was withheld.`);
  }
  if (!quiet && result.stdout?.trim()) console.log(result.stdout.trim());
  return (combined ? result.stdout + result.stderr : result.stdout).trim();
}
function compose(args, options) {
  return run("docker", ["compose", "--project-name", project, "--file", resolve(root, "compose.yaml"), ...args], options);
}
function passed(check) { report.checks.push(check); console.log(`PASS ${check}`); }
async function get(path) {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, path);
  return response.json();
}
async function healthy() {
  for (let attempt = 0; attempt < 60; ++attempt) {
    try { if ((await get("/api/panel/health")).ready === true) return; } catch {}
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error("Health did not become ready within 60 seconds.");
}
const metadataInspection = String.raw`
const fs=require('node:fs'),assert=require('node:assert/strict');
assert.notEqual(process.getuid(),0);
const folder='/app/.local-data';
const file=folder+'/calls.json',stat=fs.statSync(file),raw=fs.readFileSync(file,'utf8'),events=JSON.parse(raw);
assert.ok(stat.size<=3*1024*1024);assert.ok(events.length>0&&events.length<=5000);
const allowed=['at','client','code','durationMs','groupId','id','outcome','runId','tool'].sort();
for(const e of events){assert.deepEqual(Object.keys(e).sort(),allowed);assert.ok(Date.parse(e.at)>=Date.now()-7*24*60*60*1000);assert.ok(Number.isInteger(e.durationMs)&&e.durationMs>=0);}
for(const value of ['never-log-this-secret','password-sentinel','Authorization','secret-tool-sentinel'])assert.ok(!raw.includes(value));
console.log(JSON.stringify({events:events.length,bytes:stat.size,uid:process.getuid(),metadataOnly:true}));
`;
try {
  // Context inspection reads local CLI configuration; reject remote endpoints before engine contact.
  const endpoint = process.env.DOCKER_HOST || run("docker", ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], { optional: true, quiet: true, timeout: 15000 });
  if (!endpoint) throw new Error('Local Docker endpoint could not be verified. No engine connection attempted.');
  if (endpoint && !/^(unix:\/\/\/|npipe:\/\/)/.test(endpoint))
    throw new Error("Remote Docker endpoints are outside this verification scope. Select an already available local engine; no remote connection attempted.");
  const engine = run("docker", ["info", "--format", "{{.OSType}}"], { optional: true, quiet: true, timeout: 15000 });
  if (!engine) {
    report.status = "not-run-engine-unavailable";
    throw new Error("Linux Docker engine unavailable. Build/container/Linux checks NOT RUN. No engine or OS settings changed.");
  }
  assert.equal(engine, "linux", "A Linux Docker engine is required.");
  run("docker", ["compose", "version"], { quiet: true });
  passed("Linux engine and Compose available");
  compose(["config", "--quiet"]);
  compose(["build", "--no-cache"], { quiet: true, timeout: 1200000 });
  passed("clean image npm ci/typecheck/build");
  // If either fixed host port is occupied, Docker fails. No existing listener is stopped.
  started = true;
  compose(["up", "--detach", "--no-build"], { quiet: true });
  await healthy();
  const container = compose(["ps", "--quiet", "specwake"], { quiet: true });
  assert.ok(container && !container.includes("\n"));
  const inspection = JSON.parse(run("docker", ["inspect", container], { quiet: true }))[0];
  assert.equal(inspection.Config.User, "1000:1000");
  assert.equal(inspection.HostConfig.ReadonlyRootfs, true);
  assert.equal(inspection.HostConfig.LogConfig.Type, "json-file");
  assert.equal(inspection.HostConfig.LogConfig.Config["max-size"], "5m");
  assert.equal(inspection.HostConfig.LogConfig.Config["max-file"], "3");
  for (const port of ["4319/tcp", "4320/tcp"]) {
    const bindings = inspection.HostConfig.PortBindings[port];
    assert.equal(bindings.length, 1); assert.equal(bindings[0].HostIp, "127.0.0.1");
  }
  assert.ok(inspection.Mounts.some((mount) => mount.Name === volume && mount.Destination === "/app/.local-data" && mount.RW));
  compose(["exec", "-T", "specwake", "node", "-e", "const fs=require('node:fs'),assert=require('node:assert/strict');assert.notEqual(process.getuid(),0);for(const p of ['/app/.local-data/verify-write','/app/.tmp/verify-write']){fs.writeFileSync(p,'test',{mode:0o600});fs.unlinkSync(p)}"], { quiet: true });
  passed("health/nonroot/data+temp writable/readonly root/loopback publications/bounded Docker logs");

  const npmCandidates = [process.env.npm_execpath, resolve(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")].filter(Boolean);
  const npmCli = npmCandidates.find((file) => existsSync(file));
  env.SPECWAKE_VERIFY_ORIGIN = origin;
  if (npmCli) run(process.execPath, [npmCli, "run", "test:http"], { timeout: 120000, quiet: true });
  else if (process.platform !== "win32") run("npm", ["run", "test:http"], { timeout: 120000, quiet: true });
  else throw new Error("npm CLI not found. Run through npm run test:linux so npm_execpath is supplied.");
  passed("independent official SDK HTTP initialize/list/call success/error/delay/stop");
  const before = await get("/api/panel/statistics?minutes=10080");
  assert.ok(before.calls >= 3 && before.errors >= 1);
  const beforeIds = before.recent.map((event) => event.id).sort();
  report.persistedCalls = before.calls;
  const metadata = JSON.parse(compose(["exec", "-T", "specwake", "node", "-e", metadataInspection], { quiet: true }));
  report.metadata = metadata;
  passed("strict metadata fields/seven-day+5000 count bounds/secret sentinels absent");

  compose(["stop", "--timeout", "20"], { quiet: true });
  const stopped = JSON.parse(run("docker", ["inspect", container], { quiet: true }))[0];
  assert.equal(stopped.State.ExitCode, 0, "SIGTERM must finish without SIGKILL");
  await assert.rejects(fetch(origin + "/api/panel/health", { signal: AbortSignal.timeout(3000) }));
  run("docker", ["run", "--rm", "--network", "none", "--read-only", "--user", "1000:1000", "--mount", `type=volume,src=${volume},dst=/data,readonly`, image, "node", "-e", "const fs=require('node:fs'),assert=require('node:assert/strict');assert.equal(fs.existsSync('/data/writer.lock'),false);assert.ok(fs.existsSync('/data/calls.json'));"], { quiet: true });
  passed("graceful SIGTERM exit0/closed panel/no stale journal lock");
  compose(["start"], { quiet: true });
  await healthy();
  const after = await get("/api/panel/statistics?minutes=10080");
  assert.equal(after.calls, before.calls); assert.equal(after.errors, before.errors);
  assert.deepEqual(after.recent.map((event) => event.id).sort(), beforeIds);
  const state = await get("/api/panel/state");
  assert.equal(state.service.phase, "stopped"); assert.equal(state.groups.length, 0);
  await assert.rejects(fetch("http://127.0.0.1:4320/mcp", { signal: AbortSignal.timeout(3000) }));
  passed("restart keeps recorded statistics and IDs; groups reset, MCP stays stopped");
  const logs = compose(["logs", "--no-color", "--tail", "200"], { quiet: true, combined: true });
  for (const value of ["never-log-this-secret", "password-sentinel", "secret-tool-sentinel"]) assert.ok(!logs.includes(value));
  passed("application logs contain no exercised secret sentinels");
  report.status = "passed";
} catch (error) {
  failure = error instanceof Error ? error.message : "Verification failed";
  report.error = failure;
  console.error(failure);
  process.exitCode = 1;
} finally {
  if (started) {
    try {
      // This fresh verification project only. Never use --volumes or docker volume rm.
      compose(["down", "--timeout", "20"], { quiet: true });
      report.teardown = "verification containers/network removed; volume and image retained";
    } catch {
      report.teardown = "failed; inspect only the named verification project";
      report.status = "failed"; process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  await mkdir(resolve(root, "artifacts"), { recursive: true });
  await writeFile(resolve(root, "artifacts/linux-verification.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Report: artifacts/linux-verification.json; planned verification volume: ${volume} (created only when Compose up runs)`);
}
