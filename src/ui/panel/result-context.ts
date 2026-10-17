export function callViewKey(
  runId: string | undefined,
  revision: string | undefined,
  groupId: string,
  tool: string,
  args: string,
  client: string,
  generation: number,
) {
  return JSON.stringify([
    runId,
    revision,
    groupId,
    tool,
    args,
    client,
    generation,
  ]);
}
export function visibleCall<T>(
  stored: { key: string; result: T } | undefined,
  key: string,
) {
  return stored?.key === key ? stored.result : undefined;
}
