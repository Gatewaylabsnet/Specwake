import type { Tool } from "../../core/model.js";
import { defaults, toolDefaults } from "./api.js";
export function connectionExample(
  endpoint: string,
  tool: Tool | undefined,
  protocol: string,
  desktopExecutable?: string,
) {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    !url.port ||
    url.pathname !== "/mcp" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Invalid local demo endpoint");
  const args = JSON.parse(tool ? toolDefaults(tool) : '{}');
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const prefix = desktopExecutable
    ? `& ${quote(desktopExecutable)} --mcp-client --endpoint ${quote(url.href)}`
    : `node --import tsx scripts/mcp-demo-client.ts --endpoint ${JSON.stringify(url.href)}`;
  const command = desktopExecutable ? `${prefix} | Out-Host` : prefix;
  const exerciseCommand = desktopExecutable ? `${prefix} --exercise | Out-Host` : `${prefix} --exercise`;
  const sdk = `import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const client = new Client(
  { name: 'local-demo', version: '1.0.0' },
  { supportedProtocolVersions: [${JSON.stringify(protocol)}] }
);
try {
  await client.connect(new StreamableHTTPClientTransport(
    new URL(${JSON.stringify(url.href)}),
    { requestInit: { headers: { 'X-Specwake-Client': 'local-script' } } }
  ));
  console.log(await client.listTools());${
    tool
      ? `
  console.log(await client.callTool({
    name: ${JSON.stringify(tool.name)}, arguments: ${JSON.stringify(args)}
  }));`
      : ""
  }
} finally {
  await client.close();
}`;
  return { command, exerciseCommand, sdk };
}
