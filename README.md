# Specwake

**OpenAPI → reviewed tools → a local HTTP MCP service with an explicit upstream target, or a standalone stdio server.** Part of the GatewayLabs family; an independent product with no dependency on Specfold, ConfigDiff or Signal.

The legacy developer builder at `/developer` has one five-step workflow: import a file, select operations, edit/review tool definitions, call the bundled mock through an actual MCP connection, then download and independently run the server package. No account, telemetry, LLM, cloud sync or paid AI service is involved.

![Specwake management demo](docs/screenshots/12-real-upstream.png)

## Windows desktop EXE

Specwake also runs in its own native application window. The Windows x64 portable EXE and per-user installer include Electron, Chromium and Node.js; end users do not need a browser, Node.js or npm to run the authoring application. The desktop UI uses the same verified core and runtime as the optional web mode. Generated MCP server ZIPs still require Node.js 24+ on the machine where they run.

Download **[Specwake v0.3.0 — local management demo](https://github.com/Gatewaylabsnet/Specwake/releases/tag/v0.3.0)**:

- [Portable EXE — no installation](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.3.0/Specwake-0.3.0-Portable-x64.exe)
- [Windows setup EXE](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.3.0/Specwake-0.3.0-Setup-x64.exe)
- [SHA-256 checksums](https://github.com/Gatewaylabsnet/Specwake/releases/download/v0.3.0/SHA256SUMS-0.3.0.txt)

Local build outputs:

- `release/Specwake-0.3.0-Portable-x64.exe`: current local demo; opens the management panel.
- `release/Specwake-0.3.0-Setup-x64.exe`: current per-user installer and shortcuts.
- `release/SHA256SUMS-0.3.0.txt`: current package hashes; binaries are distributed through the release assets above.

The Windows demo includes an independent SDK client mode in the EXE. Copy its PowerShell command from the MCP service screen; Node.js/npm and the source checkout are unnecessary for that client. The exported standalone stdio ZIP still needs Node.js 24+. See the [Windows quick start](docs/WINDOWS_QUICK_START.md) and [delivery verification](docs/WINDOWS_DELIVERY_VERIFICATION.md). The previous v0.2.0, v0.1.0 and v0.1.1 releases remain available as historical builds.

Build from source:

```sh
npm ci
npm run desktop:pack
npm run desktop:checksums
npm run test:desktop
```

`npm run desktop` runs the desktop application from source. The app owns an ephemeral loopback-only management port and shuts it down on exit. Its renderer is sandboxed, has no Node integration or privileged preload bridge, rejects external navigation/new windows and denies permission requests. Resources and dependencies are bundled; runtime probes use the included executable in Node mode and a writable temporary directory, including when installed under a read-only application directory. No updater or release publishing is enabled.

These MVP EXEs are **unsigned**; Windows may display an unknown-publisher/SmartScreen prompt. Binaries are distributed through GitHub Releases; local build outputs remain ignored by Git. This repository contains the source and repeatable packaging commands. See [desktop packaging and verification](docs/DESKTOP.md).

## Run locally

For the current Turkish panel, run `npm ci` then `npm run panel` and open **http://127.0.0.1:4319/panel**. Upload OpenAPI, select/review operations, save an explicit HTTPS target and exact IPv4 addresses (or explicit loopback test API), start the MCP service and download the connection JSON. Groups, approvals, target and MCP port persist; the service starts stopped on app reopen. No credentials or raw examples are persisted. See the [current guide and verification](docs/REAL_UPSTREAM.md), [Windows first use](docs/WINDOWS_QUICK_START.md), and [Linux/Docker guide](docs/LINUX_DEMO.md). Linux runtime verification for 0.3.0 remains unperformed. Windows release candidates are tested on a disposable GitHub-hosted runner before publishing the exact tested binaries.

Requirements: **Node.js 24+**, npm, and access to the public npm registry for the initial install. Versions and both application/export lockfiles are pinned.

```powershell
cd C:\Projects\Specwake
npm ci
npm run dev
```

Open **http://127.0.0.1:4318**. `dev` builds and starts the UI, studio API and an ephemeral project-owned mock. It has no hot reload: rerun after source changes. Alternatively use `npm run build` then `npm start`. It never binds the studio to an external interface. Port 4318 must be free.

For the legacy fixture builder, manually open `/developer`. Select **Try the Pet Catalog**, check `GET /pets` and/or `GET /pets/{id}`, review or rename the tools, then **Run mock test**. The default arguments select available pets, returning Miso. `POST /pets` and the unsupported advanced query remain visible with explanations. You can also use the native file chooser with `examples/pet-catalog.yaml` or `examples/health.json`.

The mock panel performs MCP initialize, `tools/list`, and `tools/call` against a separately spawned runtime. It sends requests only to the ephemeral mock's exact loopback port. Unknown routes return a failed fixture call. A successful mock call does not verify a real API or credentials. Export remains available for specifications without fixture coverage and explicitly reports that no successful mock call was recorded.

## Export and run independently

Download and extract `specwake-server.zip` into a new directory. It includes runtime TypeScript, `tools.json`, its own `package.json`/lockfile, README, license, target example and a fake-value `.env.example`.

```sh
npm ci
npm run build
```

No target is enabled automatically. Copy `target.example.json` to `target.json` and set a deliberate base URL plus **exact IPv4 addresses**. Private enterprise targets are possible through this narrow allowlist; wildcard/subnet access is unavailable. No uploaded server URL becomes runtime configuration.

To reproduce the demo, start `npm run mock` in this project; it listens only on `127.0.0.1:4319`. In the extracted package, use:

```json
{
  "mode": "mock",
  "baseUrl": "http://127.0.0.1:4319/v1",
  "allowedAddresses": ["127.0.0.1"],
  "allowInsecureHttp": false
}
```

From the extracted package directory, have an MCP client launch:

```sh
node dist/runtime/cli.js
```

The client must use that directory as its working directory. Call the node command directly; npm's ordinary script banners must not be added to the protocol channel. stdout contains MCP messages only; startup diagnostics use stderr. The exported runtime needs neither this project nor its `node_modules`; an independent mock/API can supply its responses.

For a real target in the standalone runtime, use `mode: "api"`. HTTPS is required unless the operator explicitly sets `allowInsecureHttp: true`. Every DNS address must be in the configured IPv4 list; each connection is pinned to a checked address. Dual-stack/IPv6 targets are unsupported in this MVP. Loopback, unspecified, link-local, multicast, metadata and unconfigured addresses are rejected in API mode. Redirects are disabled. Mock mode only allows the single explicitly configured `http://127.0.0.1:port` target.

Bearer authentication uses `SPECWAKE_BEARER_TOKEN`; X-* header API keys use `SPECWAKE_API_KEY`. Values are read only from the launching process environment. Missing required credentials fail closed. `.env.example` is illustrative and is not loaded. OAuth, security alternatives and multiple combined schemes are unsupported. Do not place secrets in specifications, tool descriptions, target files, arguments or source code. `SPECWAKE_TARGET_FILE` optionally selects an operator-owned target configuration; it is never a tool input.

## Supported OpenAPI subset

| Area | MVP behavior |
| --- | --- |
| Versions | OpenAPI 3.0.x and 3.1.x; reject Swagger 2.0 / OpenAPI 3.2+ |
| Files | Local JSON or YAML; safe core YAML schema, duplicate keys/tags/aliases rejected |
| References | Document-local `#/...` JSON pointers; external references, cycles, siblings and unresolved refs fail explicitly |
| Operations | GET plus explicitly reviewed read-only JSON POST; unsupported methods listed with reasons |
| Parameters | Scalar string, integer, number, boolean; required fields; matching scalar enums |
| Serialization | Query `form`, explode=true; path `simple`, explode=false; each path parameter occupies a whole segment |
| Input schema | Namespaced `path_` / `query_` properties, no unknown properties, required/type/enum validation |
| Schema keywords | `type`, `enum`, `description`, `title`; other parameter-schema keywords block that operation |
| Auth | None declared, one HTTP Bearer, or one X-* header API key; inherited requirements respected |
| Responses | Successful body returned as MCP text; no response-schema transformation/validation |
| Server URLs | Imported as untrusted document data; never visited or automatically used |

Parameter arrays, objects, composition, formats, constraints, nullable types, header/cookie parameters, content-based parameters, alternate serialization, request bodies, OAuth and unsupported security combinations are explicitly blocked at operation level. Response schemas are not used to generate requests; local refs anywhere in the document still undergo the document safety checks. Webhooks, callbacks and links are not exposed as tools. Descriptions are plain text, never HTML, commands or generated executable code.

Bounds: **1 MiB source; depth 40; 30,000 source nodes; 60,000 expanded nodes; 2,000 ref expansions; 200 operations; 64 selected tools; 50 parameters/tool; 2,000-character descriptions**. Import sessions live in memory, expire after 30 minutes, and are limited to 10 per studio process. Reloading the page starts the UI flow again; restarting the studio clears all imports.

## Security and privacy boundaries

- Nothing is selected implicitly. The backend reconstructs manifests from its imported operations; client-submitted URLs or forged operations do not enter a package. Runtime dispatch exposes only the selected manifest.
- Only the fixed configured origin, port and base path are available. Path segments are encoded; traversal, slashes, backslashes, percent escapes, query/fragment/control characters in path values are blocked. Query values use `URLSearchParams`.
- DNS is checked per call and pinned; requests have a total 5-second deadline and a 256 KiB successful response limit. Redirects and non-2xx responses fail without returning raw error bodies, URLs or headers.
- The studio validates exact Host, Origin, Fetch Metadata and a transient session token on mutations. It has no CORS access and serves only built UI assets. It does not create a persistent credential or expose a development websocket/file server.
- Package archive paths come from a fixed allowlist. User names/descriptions are serialized in JSON, never interpolated into executable source or filenames. Export does not read process credentials.
- Runtime credentials are never logged; exact configured secret values echoed in a successful response are masked. This is not comprehensive anonymization. Successful API data is intentionally returned to the MCP client.
- **GET does not guarantee safety or lack of side effects. Local-first does not guarantee all connected-client data stays on the device.** A client may transmit API responses and tool definitions to its AI provider. Review its behavior and endpoint semantics before connecting sensitive systems.
- A local operator who can edit runtime source or tools.json can change its behavior. This MVP provides neither a sandbox against that operator nor a signed package/manifest.

## Verify

```sh
npm test
npm run test:export
npm audit --omit=dev --audit-level=high
```

`npm test` builds first, then runs parser, schema, runtime, MCP and management HTTP tests. `test:export` creates a ZIP, extracts it into a new operating-system temporary directory **outside the source checkout**, runs `npm ci` from that package's lockfile, checks dependencies resolve inside that package, compiles its source and uses the official MCP client against its stdio executable. It verifies initialize/list/call, selected-tool isolation, a mock response and stable parameter diagnostics. No actual external API is called; npm installation uses the public registry. Disposable probe folders are removed; standalone verification folders remain in OS temp for inspection and their path is recorded in the ignored verification report.

To verify the actual ZIP downloaded through the UI, move it into this project's `artifacts/` and run:

```sh
npm run test:export -- artifacts/ui-export.zip
```

The verifier expects the sample's `GET /pets` tool. Results and the portable demo package are written to ignored `artifacts/export-verification.json` and `artifacts/specwake-server.zip`. See [the verified delivery report](docs/MVP_VERIFICATION.md) for actual results and browser evidence.

## Next working-tree improvements (unreleased)

The second development round adds [stable runtime diagnostics](templates/RUNTIME_ERRORS.md), isolated HTTPS/auth/DNS policy tests, and mock receipts tied to the exact document/manifest/tool/argument set. Returning, editing, resetting arguments or changing selections invalidates an old result; a route without fixture coverage is reported explicitly. Mock results still do not verify real API authentication.

The [Windows / Node 24 workflow](.github/workflows/windows-ci.yml) installs a clean checkout, builds/tests, verifies the ZIP outside the repository, packages the desktop without running an installer and independently verifies its generated ZIP. `npm run desktop:pack:dir` builds only the unpacked desktop for this smoke check. **The workflow has not been run remotely in this round.** See [second-round evidence and acceptance gates](docs/ROUND2_VERIFICATION.md) and the [CLI/Linux/web design for the next round](docs/NEXT_ROUND.md). These local changes are not part of the previously published v0.1.0 binaries until separately released.

## Layout and next scope

`src/core` owns OpenAPI import and tool contracts; `src/runtime` owns MCP/HTTP execution; `src/studio` owns the loopback management API, probing and export; `src/ui` owns React; `src/mock` and `examples` are deterministic fixtures. The export copies only the small runtime and contracts. All source is within this repository; no common package or cross-project link was introduced.

Next work: broaden schema/serialization support with explicit tests, add operator target configuration UX, more fixture coverage, signed desktop distribution and manifest integrity checks. This MVP intentionally excludes SaaS, accounts, billing, team features, cloud sync, remote HTTP MCP transport, LLM integration and production-system validation.

SDK usage follows the official [server](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server) and [client](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-client) documentation, checked on 2026-10-16. Official TypeScript MCP server/client **2.3.1** use `McpServer.registerTool`, `serveStdio`, `Client` and `StdioClientTransport`. The package registry and installed declarations were also checked. Specfold was inspected read-only for product context and its Apache-2.0 license; no code or assets were copied. Specwake retains this repository's Apache-2.0 license.

## Yerel web yönetim prototipi (yayınlanmamış çalışma)

`npm run panel` ile başlayın: http://127.0.0.1:4319/panel. Demo OpenAPI → açık GET seçimi → gerçek Streamable HTTP MCP hizmeti → çağrı/istatistik/kayıt akışı yerelde çalışır. Kurum sistemlerine bağlanmaz; API/proxy ve istemci etiketleri demo kapsamındadır. Mevcut stdio/ZIP oluşturucu `/` altında devam eder.

[Başlatma ve yönetici demo adımları](docs/WEB_PROTOTYPE.md) · [Test, görsel kanıt ve güvenlik incelemesi](docs/WEB_PROTOTYPE_VERIFICATION.md). Dockerfile hazırlığı vardır; bu Windows makinesinde Docker Linux motoru çalışmadığı için Docker/Linux smoke testi yapılmadı. Bu çalışma yayımlanmış v0.1.0 EXE'lerine dahil değildir.

## Explicitly reviewed JSON POST demo

Version 0.2.0 adds default-closed read-only POST review, bounded JSON object bodies, an exact runtime operation allowlist, and redacted source-attributed envelope results. The local panel only calls synthetic fixtures. Approvals are operator assertions, not proof of upstream side effects or institutional access rights. See [read-POST verification](docs/READ_POST_DEMO.md) and the [DeepSeek client prompt](docs/DEEPSEEK_CLIENT_PROMPT.md).
