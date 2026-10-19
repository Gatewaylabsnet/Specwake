export const diagnostics = {
  SW_OPERATION_FORBIDDEN: ['The operation is not permitted by the runtime read-only POST policy.', 'Review both the selected manifest and the operator-owned exact operation allowlist.'],
  SW_REQUEST_TOO_LARGE: ['The JSON body exceeds 16 KiB.', 'Reduce the selected query body.'],
  SW_CANCELLED: ['The invocation was cancelled.', 'Retry only after checking the current service state.'],
  SW_APPLICATION_ERROR: ['The API reported an application error inside its response.', 'The raw error content is intentionally omitted.'],
  SW_RESPONSE_ENVELOPE: ['The response does not match the approved envelope adapter.', 'Do not treat HTTP 200 or a row count as verified success.'],
  SW_RESULT_MISSING: ['The configured result field is missing.', 'The response is not a complete query result.'],
  SW_PARAMETER_INVALID: ['The tool arguments are invalid.', 'Check required fields, scalar types, enums and path boundary characters; then retry.'],
  SW_TARGET_INVALID: ['The target configuration is invalid.', 'Set a fixed HTTP(S) base URL without credentials, query or fragment and an exact IPv4 allowlist.'],
  SW_TARGET_FORBIDDEN: ['The target is blocked by the network policy.', 'Use an explicitly permitted API address. Metadata, loopback and special addresses remain blocked in API mode.'],
  SW_DNS_RESOLUTION_FAILED: ['The configured API hostname could not be resolved.', 'Check the operator-configured hostname and local DNS; do not broaden the allowlist.'],
  SW_DNS_MISMATCH: ['DNS returned an address outside the configured allowlist.', 'Verify every current DNS address with your administrator and explicitly update the exact allowlist if appropriate.'],
  SW_CREDENTIAL_MISSING: ['This operation requires a runtime credential.', 'Set SPECWAKE_BEARER_TOKEN or SPECWAKE_API_KEY in the launching process environment. Never put the value in tool arguments or files.'],
  SW_CREDENTIAL_INVALID: ['The configured runtime credential is invalid.', 'Supply a non-empty credential without control characters in the required environment variable.'],
  SW_HTTP_UNAUTHORIZED: ['The API rejected authentication (HTTP 401).', 'Check the runtime credential, expiry and authentication scheme with the API operator.'],
  SW_HTTP_FORBIDDEN: ['The API refused this operation (HTTP 403).', 'Check endpoint permissions and account scope with the API operator.'],
  SW_HTTP_RATE_LIMITED: ['The API rate limit was reached (HTTP 429).', 'Wait before retrying and check the API rate-limit policy.'],
  SW_HTTP_STATUS: ['The API returned a non-success response.', 'Check API availability and the selected endpoint with the API operator. The error body is intentionally omitted.'],
  SW_REDIRECT_BLOCKED: ['The API returned a redirect, which is disabled.', 'Configure the intended fixed API target explicitly; automatic redirect following is not permitted.'],
  SW_TLS_FAILED: ['TLS certificate verification or negotiation failed.', 'Check the hostname, certificate chain and validity with the API operator. Do not disable TLS verification.'],
  SW_NETWORK_FAILED: ['The configured API connection failed.', 'Check API availability, the configured port, routing and firewall policy.'],
  SW_TIMEOUT: ['The request exceeded its 5-second deadline.', 'Check DNS and API responsiveness, then retry.'],
  SW_RESPONSE_TOO_LARGE: ['The API response exceeds 256 KiB.', 'Use a narrower endpoint or supported filters to reduce the response.'],
  SW_RESPONSE_FAILED: ['The API response ended before it could be read.', 'Check API availability and retry the selected operation.'],
  SW_MANIFEST_FILE: ['The tool manifest could not be read.', 'Run from the generated package directory and check that tools.json is present and readable.'],
  SW_MANIFEST_INVALID: ['The selected tool manifest is invalid.', 'Export the selected tools again and rebuild the generated package.'],
  SW_TARGET_FILE: ['The target file could not be read or parsed.', 'Create a valid operator-owned target.json or set SPECWAKE_TARGET_FILE to a readable configuration file.'],
  SW_MCP_CONNECTION_FAILED: ['The local MCP runtime could not connect.', 'Build or reinstall Specwake and retry the local test.'],
  SW_MOCK_FIXTURE_MISSING: ['No bundled mock fixture matches this operation.', 'Use GET /pets, GET /pets/{id} or GET /health from the sample. This does not indicate a failure of your real API.'],
  SW_STARTUP_FAILED: ['Specwake could not start.', 'Close other instances, check local resources and permissions, then rebuild or reinstall and retry.']
} as const;
export type ErrorCode = keyof typeof diagnostics;
export type ExecutionResult = {
  isError?: boolean;
  content: {type:'text';text:string}[];
  structuredContent?: { error?: {code:ErrorCode;message:string;hint:string}; [key: string]: unknown };
};
export class RuntimeFault extends Error {
  constructor(readonly code: ErrorCode) { super(diagnostics[code][0]); this.name = 'RuntimeFault'; }
}
export function safeDiagnostic(error: unknown, fallback: ErrorCode = 'SW_NETWORK_FAILED') {
  const code = error instanceof RuntimeFault ? error.code : fallback;
  const [message, hint] = diagnostics[code];
  return {code, message, hint};
}
export function errorResult(error: unknown, fallback: ErrorCode = 'SW_NETWORK_FAILED') {
  const diagnostic = safeDiagnostic(error, fallback);
  return {isError:true, content:[{type:'text' as const,text:JSON.stringify({error:diagnostic})}], structuredContent:{error:diagnostic}};
}
export function connectionFault(error: unknown) {
  const code = (error as {code?:string})?.code ?? '';
  const tls = /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT)/.test(code);
  return new RuntimeFault(tls ? 'SW_TLS_FAILED' : 'SW_NETWORK_FAILED');
}
