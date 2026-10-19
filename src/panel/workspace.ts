import { WorkspaceStore, firstLocalPort } from "./workspace-store.js";
import {
  workspaceSchema,
  savedGroup,
  approvalHash,
  validateOperatorTarget,
  type WorkspaceData,
} from "./workspace-schema.js";
import { selectTools } from "../core/import.js";
import { DemoCatalog, type ApiGroup } from "./catalog.js";
import { DemoMcpService } from "./mcp-service.js";
import { PanelFault } from "./http.js";
import type { Selection } from "../core/model.js";
import type { DemoListeners } from "./config.js";
import type { startDemoApi } from "../demo/server.js";
import type { EventSink } from "./types.js";

export class Workspace {
  readonly service: DemoMcpService;
  private queue = Promise.resolve();
  warning?: string;
  private constructor(
    readonly catalog: DemoCatalog,
    private readonly store: WorkspaceStore,
    private data: WorkspaceData,
    private readonly demo: Awaited<ReturnType<typeof startDemoApi>>,
    sink: EventSink,
    private readonly listeners?: DemoListeners,
  ) {
    this.service = new DemoMcpService(
      demo.target,
      sink,
      {
        ...listeners,
        bindAddress: listeners?.bindAddress ?? "127.0.0.1",
        mcpPort: data.mcpPort,
      },
      demo.executionContext,
    );
    this.install();
  }
  static async open(
    catalog: DemoCatalog,
    folder: string,
    demo: Awaited<ReturnType<typeof startDemoApi>>,
    sink: EventSink,
    listeners?: DemoListeners,
  ) {
    const store = new WorkspaceStore(folder);
    const saved = await store.load();
    if (saved && listeners?.mcpPort && listeners.mcpPort !== saved.mcpPort)
      throw new Error("Saved MCP port differs from operator setting");
    const data = saved ?? {
      version: 1 as const,
      mcpPort: listeners?.mcpPort || (await firstLocalPort()),
      groups: [],
      profiles: [],
    };
    if (!saved) await store.save(data);
    return new Workspace(catalog, store, data, demo, sink, listeners);
  }
  serial<T>(work: () => Promise<T> | T): Promise<T> {
    const pending = this.queue.then(work);
    this.queue = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
  publicState() {
    return {
      mcpPort: this.data.mcpPort,
      profiles: this.data.profiles,
      warning: this.warning,
    };
  }
  private selected(data: WorkspaceData) {
    if (
      new Set(data.groups.map((g) => g.id)).size !== data.groups.length ||
      new Set(data.profiles.map((p) => p.groupId)).size !== data.profiles.length
    )
      throw new Error("Duplicate stored identity");
    for (const p of data.profiles) {
      const group = data.groups.find((g) => g.id === p.groupId);
      if (!group) throw new Error("Missing stored group");
      const manifest = this.catalog.selectSnapshot(
        group as ApiGroup,
        p.selections,
      ).manifest;
      if (p.target && p.approval === approvalHash(group, manifest, p.target))
        validateOperatorTarget(p.target, manifest);
    }
    if (
      data.activeGroupId &&
      !data.profiles.some((p) => p.groupId === data.activeGroupId)
    )
      throw new Error("Missing active profile");
  }
  private install() {
    this.warning = undefined;
    this.selected(this.data);
    this.catalog.groups.clear();
    for (const g of this.data.groups)
      this.catalog.groups.set(g.id, g as ApiGroup);
    const p = this.data.profiles.find(
      (p) => p.groupId === this.data.activeGroupId,
    );
    if (!p) {
      this.service.setExecution(
        this.demo.target,
        this.demo.executionContext,
        this.data.mcpPort,
      );
      this.service.clear();
      return;
    }
    const group = this.catalog.groups.get(p.groupId)!;
    const manifest = this.catalog.select(p.groupId, p.selections).manifest;
    const approved =
      p.target && p.approval === approvalHash(group, manifest, p.target);
    if (approved && this.listeners?.bindAddress === "0.0.0.0")
      throw new PanelFault(
        409,
        "LOOPBACK_REQUIRED",
        "Kayıtlı gerçek hedef yalnız loopback listener ile açılabilir; veri değiştirilmedi.",
      );
    if (p.approval && !approved) this.warning = "STORED_APPROVAL_CHANGED";
    this.service.setExecution(
      approved ? p.target! : this.demo.target,
      approved ? {} : this.demo.executionContext,
      this.data.mcpPort,
    );
    this.service.configure(
      group.id,
      manifest,
      group.targetMode === "synthetic"
        ? "synthetic"
        : approved
          ? "api"
          : "unconfigured",
    );
  }
  private stopped() {
    if (!["stopped", "error"].includes(this.service.state().phase))
      throw new PanelFault(
        409,
        "SERVICE_ACTIVE",
        "Önce MCP hizmetini durdurun.",
      );
  }
  private async commit(data: WorkspaceData, install = true) {
    const next = workspaceSchema.parse(data);
    this.selected(next);
    await this.store.save(next);
    this.data = next;
    if (install) this.install();
  }
  async import(source: string, mode: ApiGroup["targetMode"]) {
    const group = this.catalog.import(source, mode);
    try {
      await this.commit(
        {
          ...this.data,
          groups: [...this.data.groups, savedGroup.parse(group)],
        },
        false,
      );
      return group;
    } catch (error) {
      this.catalog.forgetUncommitted(group.id);
      throw error;
    }
  }
  async configure(groupId: string, selections: Selection[]) {
    this.stopped();
    if (!this.catalog.groups.has(groupId))
      throw new PanelFault(404, "GROUP_MISSING", "API grubunu seçin.");
    if (!selections.length) {
      await this.commit({
        ...this.data,
        activeGroupId:
          this.data.activeGroupId === groupId
            ? undefined
            : this.data.activeGroupId,
        profiles: this.data.profiles.filter((p) => p.groupId !== groupId),
      });
      return this.service.state();
    }
    const existing = this.data.profiles.find((p) => p.groupId === groupId);
    const next = { ...existing, groupId, selections };
    const group = this.catalog.groups.get(groupId)!;
    const manifest = this.catalog.select(groupId, selections).manifest;
    if (
      next.target &&
      next.approval !== approvalHash(group, manifest, next.target)
    )
      delete next.approval;
    await this.commit({
      ...this.data,
      activeGroupId: groupId,
      profiles: [
        ...this.data.profiles.filter((p) => p.groupId !== groupId),
        next,
      ],
    });
    return this.service.state();
  }
  async target(groupId: string, revision: string, value: unknown) {
    this.stopped();
    const deployment = this.service.state().deployment;
    if (
      !deployment ||
      deployment.groupId !== groupId ||
      deployment.revision !== revision
    )
      throw new PanelFault(
        409,
        "SELECTION_CHANGED",
        "Seçim değişti; güncel araçları tekrar inceleyin.",
      );
    if (this.listeners?.bindAddress === "0.0.0.0")
      throw new PanelFault(
        409,
        "LOOPBACK_REQUIRED",
        "Gerçek hedef yapılandırması yalnız loopback çalışma alanında kullanılabilir.",
      );
    const group = this.catalog.groups.get(groupId)!;
    if (group.targetMode === "synthetic")
      throw new PanelFault(
        409,
        "TEST_PROFILE",
        "Gerçek hedef için kendi OpenAPI dosyanızı yükleyin.",
      );
    let target;
    try {
      target = validateOperatorTarget(value, deployment.manifest);
    } catch {
      throw new PanelFault(
        400,
        "TARGET_INVALID",
        "Sabit HTTPS hedefi veya açık yerel test hedefi, tam IPv4 izinleri ve POST adaptörünü kontrol edin.",
      );
    }
    const profiles = this.data.profiles.map((p) =>
      p.groupId !== groupId
        ? p
        : {
            ...p,
            target,
            approval: approvalHash(group, deployment.manifest, target),
          },
    );
    await this.commit({ ...this.data, profiles });
    this.warning = undefined;
    return this.service.state();
  }
  async port(port: number) {
    this.stopped();
    if (this.listeners?.mcpPort && port !== this.listeners.mcpPort)
      throw new PanelFault(
        409,
        "OPERATOR_PORT_FIXED",
        "Port operatör yapılandırmasıyla sabitlenmiş; ortam ayarıyla aynı kalmalıdır.",
      );
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new PanelFault(
        400,
        "PORT_INVALID",
        "1–65535 aralığında sabit yerel port seçin.",
      );
    await this.commit({ ...this.data, mcpPort: port });
    return this.service.state();
  }
}
