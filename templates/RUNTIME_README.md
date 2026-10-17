# Your Specwake MCP server

This standalone package needs Node.js 24+ and npm. It does not need Specwake, Specfold, an AI subscription, or their node_modules. Install dependencies from the public npm registry:

```sh
npm ci
npm run build
```

No target is enabled by default. Copy `target.example.json` to `target.json` and configure it explicitly. `baseUrl` supplies the fixed origin, port and optional API base path. `allowedAddresses` must contain every exact IPv4 address returned by DNS for that hostname. IPv6 targets and dual-stack DNS results are unsupported in this MVP. DNS results are checked and the connection is pinned to a validated address for every call. No wildcard, subnet, free URL input or redirect is supported. Private enterprise IPs can be explicitly listed. Metadata, link-local and special ranges are blocked even if listed. API mode requires HTTPS unless `allowInsecureHttp` is explicitly true. Review your selected GET endpoints; GET does not guarantee an operation is harmless.

For the **Specwake test fixture only**, start `npm run mock` in the Specwake source project and create this target configuration:

```json
{"mode":"mock","baseUrl":"http://127.0.0.1:4319/v1","allowedAddresses":["127.0.0.1"],"allowInsecureHttp":false}
```

The runtime itself remains standalone; any independent API/mock with these routes can supply responses. Mock mode permits only the single configured 127.0.0.1 port; no other loopback targets are available through tool inputs. The exported default example uses example.invalid and cannot connect until configured.

Launch from this package directory with `node dist/runtime/cli.js`, or let a trusted MCP client launch that command with this directory as its working directory. It speaks **stdio**, not HTTP. Connect performs MCP initialize, `tools/list` lists only your selections, and `tools/call` executes them. stdout is reserved for protocol messages. Use stderr for any added diagnostics. You can choose an operator-owned target file with `SPECWAKE_TARGET_FILE`; never expose that environment variable as a tool input.

For Bearer operations, set `SPECWAKE_BEARER_TOKEN`. For X-* header API-key operations, set `SPECWAKE_API_KEY`. Set variables in the launching MCP client's environment or your shell. `.env.example` is documentation, not automatically loaded. Missing required credentials fail closed. Do not put credentials in target.json, tools.json, source code or your MCP command arguments. OAuth is unsupported.

Timeout: 5 seconds; successful response limit: 256 KiB. Redirects and non-2xx responses fail without returning the raw error body or headers. Configured credential values are masked if echoed in a successful body. Returned successful API data is otherwise intentionally sent to your MCP client and may be forwarded to its AI provider. Local-first describes this authoring workflow, not a guarantee that a connected client keeps every response on your device. Treat API responses and tool descriptions as untrusted data. Only connect clients and APIs you trust.

The runtime validates the selected manifest at startup and validates arguments again before execution. Failures carry stable `SW_*` codes with fixed messages and recovery hints; see [ERROR_CODES.md](ERROR_CODES.md). Startup errors go only to stderr. Parameter keys are prefixed `path_` / `query_`. Only GET with scalar parameters and the documented serialization subset is supported. The runtime has no general-purpose HTTP tool. A local operator can edit this package; the manifest is not a protection against someone who can rewrite the runtime itself.

Generated with Specwake 0.1.0, under Apache-2.0. Dependency licenses are retained in installed packages. This package contains independently implemented Specwake runtime code; no Specfold code or assets.
