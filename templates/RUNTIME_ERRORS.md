# Safe runtime diagnostics

Tool failures return `isError: true` and an `error` object with stable `code`, fixed `message` and actionable `hint` in both text JSON and structured content. Parameter validation performed by the official MCP SDK uses a fixed `[SW_PARAMETER_INVALID]` marker in its protocol-wrapped error text; the studio normalizes this to the same error object. Malformed JSON-RPC and unknown tool names remain SDK protocol errors.

Startup diagnostics are one JSON record on **stderr**, followed by exit code 1. stdout is exclusively MCP protocol traffic. No error record includes a target URL/query, argument value, credential, header or failed API response body. Unknown native exceptions are mapped to a generic fixed diagnostic, never printed verbatim.

| Code | Operator action |
| --- | --- |
| SW_PARAMETER_INVALID | Correct required fields, scalar types, enum values or path boundary characters. |
| SW_TARGET_INVALID | Correct the fixed target URL / exact IPv4 configuration. |
| SW_TARGET_FORBIDDEN | Use an explicitly permitted target; do not bypass metadata, special-address or API loopback restrictions. |
| SW_DNS_RESOLUTION_FAILED | Check the configured hostname and DNS. |
| SW_DNS_MISMATCH | Verify DNS changes with the administrator; explicitly update exact permitted addresses only when appropriate. |
| SW_CREDENTIAL_MISSING | Supply the required runtime Bearer/API-key environment variable. |
| SW_CREDENTIAL_INVALID | Use a non-empty printable ASCII credential without control characters. |
| SW_HTTP_UNAUTHORIZED | Check credential expiry/scheme (401). |
| SW_HTTP_FORBIDDEN | Check endpoint permissions and account scope (403). |
| SW_HTTP_RATE_LIMITED | Wait and follow API rate policy (429); no automatic retry loop. |
| SW_HTTP_STATUS | Check endpoint availability; failed body is not exposed. |
| SW_REDIRECT_BLOCKED | Configure the intended fixed target explicitly; redirects remain disabled. |
| SW_TLS_FAILED | Correct certificate trust/chain, hostname or validity; verification remains enabled. |
| SW_NETWORK_FAILED | Check API availability, configured port, routing and firewall. |
| SW_TIMEOUT | Check DNS/API responsiveness; the total deadline remains 5 seconds. |
| SW_RESPONSE_TOO_LARGE | Reduce the response to at most 256 KiB using supported filters/endpoints. |
| SW_RESPONSE_FAILED | Check an interrupted API response and retry deliberately. |
| SW_MANIFEST_FILE / SW_MANIFEST_INVALID | Run in the package directory or export/build the selected tools again. |
| SW_TARGET_FILE | Create a valid readable operator-owned target configuration. |
| SW_MCP_CONNECTION_FAILED | Rebuild/reinstall Specwake and retry the local mock connection. |
| SW_MOCK_FIXTURE_MISSING | No local fixture covers this route; the real API/auth was not tested. Export remains unverified. |
| SW_STARTUP_FAILED | Check local resources, permissions and existing instances; rebuild/reinstall if needed. |

Successful response data is intentionally returned to the MCP client. Exact configured credential echoes are masked, but this is not comprehensive anonymization. A client may forward returned data to its AI provider. Error diagnosis does not weaken target policy or grant access to a new target.

## Reviewed POST diagnostics

| Code | Meaning |
| --- | --- |
| SW_OPERATION_FORBIDDEN | Missing manifest approval, exact runtime operation allowlist or adapter. |
| SW_REQUEST_TOO_LARGE | JSON body exceeds 16 KiB. |
| SW_CANCELLED | Invocation or token acquisition cancelled. |
| SW_APPLICATION_ERROR | Application errors inside the envelope; raw contents omitted. |
| SW_RESPONSE_ENVELOPE | Status/errors envelope does not match approved configuration. |
| SW_RESULT_MISSING | Configured data/result property absent. |

`SW_TIMEOUT` covers the shared token acquisition + DNS + HTTP deadline. SDK argument rejections may carry `SW_PARAMETER_INVALID` in a tool error without the adapted source envelope. Always handle both JSON-RPC errors and `isError` tool results.
