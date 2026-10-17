import { useCallback, useEffect, useRef, useState } from "react";
import type { Selection } from "../../core/model.js";
import {
  makeProbeReceipt,
  sameProbeReceipt,
} from "../../core/probe-context.js";
import {
  panelJson,
  defaults,
  type PanelState,
  type Stats,
  type CallReply,
} from "./api.js";
import type { Filters } from "./StatisticsView.js";
import { callViewKey, visibleCall } from "./result-context.js";

export function usePanelController() {
  const [state, setState] = useState<PanelState>();
  const [stats, setStats] = useState<Stats>();
  const [filters, setFilters] = useState<Filters>({
    minutes: "60",
    groupId: "",
    tool: "",
    client: "",
  });
  const [groupId, setGroupId] = useState("");
  const [selections, setSelections] = useState<Selection[]>([]);
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [client, setClient] = useState("panel-demo");
  const [busy, setBusy] = useState("");
  const [callBusy, setCallBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [stored, setStored] = useState<{ key: string; result: CallReply }>();
  const generation = useRef(0);
  const fetchGeneration = useRef(0);
  const refreshAbort = useRef<AbortController | undefined>(undefined);
  const group = state?.groups.find((g) => g.id === groupId);
  const service = state?.service;
  const locked = !!service && !["stopped", "error"].includes(service.phase);
  const draftSaved =
    !!service?.deployment &&
    service.deployment.groupId === groupId &&
    JSON.stringify(
      service.deployment.manifest.tools.map((t) => ({
        id: t.operationId,
        name: t.name,
        description: t.description,
      })),
    ) === JSON.stringify(selections);
  const key = callViewKey(
    service?.runId,
    service?.deployment?.revision,
    groupId,
    tool,
    args,
    client,
    epoch,
  );
  const result = visibleCall(stored, key);
  const invalidate = useCallback(() => {
    ++generation.current;
    setEpoch((n) => n + 1);
    setStored(undefined);
  }, []);
  const refresh = useCallback(async () => {
    const current = ++fetchGeneration.current;
    refreshAbort.current?.abort();
    const controller = new AbortController();
    refreshAbort.current = controller;
    const query = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v),
    );
    try {
      const [next, nextStats] = await Promise.all([
        panelJson<PanelState>("state", undefined, controller.signal),
        panelJson<Stats>("statistics?" + query, undefined, controller.signal),
      ]);
      if (current !== fetchGeneration.current) return;
      setState(next);
      setStats(nextStats);
      setUnavailable(false);
    } catch {
      if (!controller.signal.aborted && current === fetchGeneration.current)
        setUnavailable(true);
    }
  }, [filters]);
  useEffect(() => {
    setStats(undefined);
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      clearInterval(timer);
      refreshAbort.current?.abort();
    };
  }, [refresh]);
  useEffect(
    () => () => {
      ++generation.current;
    },
    [],
  );
  useEffect(() => {
    invalidate();
  }, [
    service?.runId,
    service?.deployment?.revision,
    service?.phase,
    invalidate,
  ]);
  useEffect(() => {
    if (!groupId && state?.groups[0]) setGroupId(state.groups[0].id);
  }, [state?.groups, groupId]);
  async function action(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    setNotice("");
    invalidate();
    try {
      await fn();
    } catch (error) {
      setError(error instanceof Error ? error.message : "İşlem tamamlanamadı.");
    } finally {
      await refresh();
      setBusy("");
    }
  }
  const chooseTool = (name: string) => {
    invalidate();
    setTool(name);
    setArgs(
      defaults(
        service?.deployment?.manifest.tools.find((t) => t.name === name)
          ?.parameters ?? [],
      ),
    );
  };
  async function runCall() {
    if (!service?.deployment || !service.runId) return;
    setError("");
    setNotice("");
    setStored(undefined);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error();
    } catch {
      setError("Argümanlar geçerli bir JSON nesnesi olmalıdır.");
      return;
    }
    const current = generation.current;
    setCallBusy(true);
    try {
      const receipt = await makeProbeReceipt(
        service.deployment.revision,
        service.deployment.manifest,
        tool,
        parsed,
      );
      const response = await panelJson<CallReply>("call", {
        tool,
        args: parsed,
        client,
      });
      if (current !== generation.current) return;
      if (
        response.receipt.runId !== service.runId ||
        !sameProbeReceipt(receipt, response.receipt)
      )
        throw new Error("Hizmet sürümü değişti; çağrıyı yeniden çalıştırın.");
      setStored({ key, result: response });
    } catch (error) {
      if (current === generation.current)
        setError(
          error instanceof Error ? error.message : "Çağrı tamamlanamadı.",
        );
    } finally {
      setCallBusy(false);
      await refresh();
    }
  }
  const online =
    !unavailable && service?.phase === "running" && service.listening;
  return {
    state,
    stats,
    filters,
    setFilters,
    groupId,
    setGroupId,
    selections,
    setSelections,
    tool,
    args,
    setArgs,
    client,
    setClient,
    busy,
    callBusy,
    error,
    setError,
    notice,
    setNotice,
    unavailable,
    group,
    service,
    locked,
    draftSaved,
    result,
    invalidate,
    refresh,
    action,
    chooseTool,
    runCall,
    online,
    setTool,
  };
}
