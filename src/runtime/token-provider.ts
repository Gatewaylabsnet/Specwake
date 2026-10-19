/** Upstream credential boundary. It never authenticates an MCP caller. */
export interface TokenProvider {
  bearerToken(signal?: AbortSignal): Promise<string | undefined>;
}
export class EnvironmentTokenProvider implements TokenProvider {
  constructor(
    private readonly environment: Record<string, string | undefined>,
  ) {}
  async bearerToken() {
    return this.environment.SPECWAKE_BEARER_TOKEN;
  }
}
export interface ExecutionContext {
  signal?: AbortSignal;
  tokenProvider?: TokenProvider;
}
