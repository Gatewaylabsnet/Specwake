import {
  READ_POST_ALLOWLIST,
  validateSyntheticReadBody,
} from "../demo/read-post-profile.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { importSpec, selectTools } from "../core/import.js";
import type { ImportedSpec, Selection } from "../core/model.js";
import { PanelFault } from "./http.js";

export type ApiGroup = ImportedSpec & {
  id: string;
  importedAt: string;
  targetMode: "synthetic" | "unconfigured";
};
export class DemoCatalog {
  private readonly originalSources = new Map<string, string>();
  originalSource(id: string) {
    return this.originalSources.get(id);
  }
  forgetUncommitted(id: string) {
    this.groups.delete(id);
    this.originalSources.delete(id);
  }
  readonly groups = new Map<string, ApiGroup>();
  private constructor(
    readonly sample: string,
    readonly readPostSample: string,
    private readonly reference: ImportedSpec,
  ) {}
  static async create(root: string) {
    const sample = await readFile(
      join(root, "examples/operations-demo.yaml"),
      "utf8",
    );
    const readPostSample = await readFile(
      join(root, "examples/read-post-synthetic.json"),
      "utf8",
    );
    return new DemoCatalog(sample, readPostSample, {
      ...importSpec(sample),
      operations: [
        ...importSpec(sample).operations,
        ...importSpec(readPostSample).operations,
      ],
    });
  }
  import(source: string, targetMode: ApiGroup["targetMode"] = "synthetic") {
    if (this.groups.size >= 8)
      throw new PanelFault(
        409,
        "GROUP_LIMIT",
        "Bu oturumda en çok 8 API grubu açabilirsiniz. Mevcut gruplar korunur.",
      );
    let spec: ImportedSpec;
    try {
      spec = importSpec(source);
    } catch {
      throw new PanelFault(
        400,
        "SPEC_INVALID",
        "OpenAPI 3.0/3.1 JSON veya YAML dosyasını kontrol edin. Dış referanslar desteklenmez; sınır 1 MiB.",
      );
    }
    // Only explicit developer fixtures can use the synthetic execution policy.
    // Uploaded definitions are authoring-only until a real target is implemented.
    for (const operation of targetMode === "synthetic" ? spec.operations : []) {
      if (
        operation.method === "POST" &&
        !READ_POST_ALLOWLIST.includes(operation.id)
      )
        operation.issues.push(
          "Bu POST işlemi demo salt-okuma izin listesinde yok.",
        );
      const fixture = this.reference.operations.find(
        (op) => op.id === operation.id,
      );
      if (
        !fixture ||
        operation.auth.kind !== fixture?.auth.kind ||
        JSON.stringify(
          operation.parameters.map(({ description, ...p }) => p),
        ) !==
          JSON.stringify(fixture.parameters.map(({ description, ...p }) => p))
      ) {
        operation.issues.push(
          "Bu endpoint/parametre/auth tanımı izole demo fixture kapsamında değil.",
        );
      }
    }
    const group = {
      ...spec,
      id: randomUUID(),
      importedAt: new Date().toISOString(),
      targetMode,
    };
    this.groups.set(group.id, group);
    this.originalSources.set(group.id, source);
    return group;
  }
  select(id: string, selections: Selection[]) {
    const group = this.groups.get(id);
    if (!group)
      throw new PanelFault(
        404,
        "GROUP_MISSING",
        "API grubunu yeniden içe aktarın.",
      );
    return this.selectSnapshot(group, selections);
  }
  selectSnapshot(group: ApiGroup, selections: Selection[]) {
    try {
      const manifest = selectTools(group, selections);
      if (group.targetMode === "synthetic")
        for (const tool of manifest.tools) {
          const ref = this.reference.operations.find(
            (op) => op.id === tool.operationId,
          );
          if (
            !ref ||
            tool.method !== ref.method ||
            tool.path !== ref.path ||
            JSON.stringify(tool.auth) !== JSON.stringify(ref.auth) ||
            JSON.stringify(
              tool.parameters.map(({ description, ...p }) => p),
            ) !==
              JSON.stringify(ref.parameters.map(({ description, ...p }) => p))
          )
            throw new Error("Fixture contract mismatch");
        }
      for (const tool of group.targetMode === "synthetic" ? manifest.tools : [])
        if (tool.method === "POST") validateSyntheticReadBody(tool);
      return { group, manifest };
    } catch {
      throw new PanelFault(
        400,
        "SELECTION_INVALID",
        "İzin verilen GET veya açıkça onaylı POST işlemleri ve benzersiz, geçerli araç adları seçin.",
      );
    }
  }
}
