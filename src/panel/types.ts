export const CLIENT_LABELS = [
  "panel-demo",
  "local-script",
  "qa-demo",
  "local-unverified",
] as const;
export type ClientLabel = (typeof CLIENT_LABELS)[number];
export interface CallEvent {
  id: string;
  at: string;
  runId: string;
  groupId: string;
  tool: string;
  client: ClientLabel;
  outcome: "success" | "error";
  durationMs: number;
  code: string;
}
/** Local metadata only. Future sinks implement this boundary, without request/response bodies. */
export interface EventSink {
  append(event: CallEvent): Promise<void>;
}
export interface StatFilter {
  minutes: number;
  groupId?: string;
  tool?: string;
  client?: string;
}
