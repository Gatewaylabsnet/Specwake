import { z } from "zod";
import { normalizeBodySchema, bodyValidator } from "./body-schema.js";
import type { Manifest, Parameter, Tool } from "./model.js";

export const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const parameter = z
  .object({
    name: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,60}$/),
    inputName: z.string().regex(/^(path|query)_[A-Za-z][A-Za-z0-9_]{0,60}$/),
    location: z.enum(["path", "query"]),
    required: z.boolean(),
    type: z.enum(["string", "integer", "number", "boolean"]),
    enum: z
      .array(z.union([z.string(), z.number().finite(), z.boolean()]))
      .min(1)
      .max(100)
      .optional(),
    description: z.string().max(2000),
  })
  .strict();
export const manifestSchema = z
  .object({
    version: z.literal(1),
    tools: z
      .array(
        z
          .object({
            operationId: z.string().max(500),
            method: z.enum(["GET", "POST"]),
            path: z.string().max(500),
            name: z.string().regex(NAME),
            description: z.string().max(2000),
            parameters: z.array(parameter).max(50),
            bodySchema: z.unknown().optional(),
            readOnlyConfirmed: z.literal(true).optional(),
            responseAdapterApproved: z.literal(true).optional(),
            auth: z.discriminatedUnion("kind", [
              z.object({ kind: z.literal("none") }).strict(),
              z.object({ kind: z.literal("bearer") }).strict(),
              z
                .object({
                  kind: z.literal("apiKey"),
                  header: z.string().regex(/^X-[A-Za-z0-9-]{1,60}$/i),
                })
                .strict(),
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict();

export function validatePath(path: string, parameters: Parameter[]) {
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 500)
    throw new Error("Path must be an absolute API path.");
  const names: string[] = [];
  for (const segment of path.slice(1).split("/")) {
    const match = /^\{([A-Za-z][A-Za-z0-9_]{0,60})\}$/.exec(segment);
    if (match) names.push(match[1]);
    else if (
      !/^[A-Za-z0-9._~-]*$/.test(segment) ||
      segment === "." ||
      segment === ".."
    )
      throw new Error(
        "Unsupported path syntax; use literal segments or whole-segment {parameters}.",
      );
  }
  const declared = parameters.filter((p) => p.location === "path");
  if (
    new Set(names).size !== names.length ||
    names.length !== declared.length ||
    declared.some((p) => !p.required || !names.includes(p.name))
  )
    throw new Error(
      "Every path placeholder needs one required path parameter.",
    );
}

export function validateManifest(input: unknown): Manifest {
  const result = manifestSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      "Invalid tool manifest: check names, descriptions and parameter definitions.",
    );
  const manifest = result.data as Manifest;
  if (new Set(manifest.tools.map((t) => t.name)).size !== manifest.tools.length)
    throw new Error("Tool names must be unique.");
  if (
    new Set(manifest.tools.map((t) => t.operationId)).size !==
    manifest.tools.length
  )
    throw new Error("Select each operation only once.");
  for (const tool of manifest.tools) {
    validatePath(tool.path, tool.parameters);
    if (tool.method === "POST") {
      if (
        tool.operationId !== `POST ${tool.path}` ||
        tool.readOnlyConfirmed !== true ||
        tool.responseAdapterApproved !== true
      )
        throw new Error("Read-only POST approval required.");
      tool.bodySchema = normalizeBodySchema(tool.bodySchema);
      if (tool.bodySchema.type !== "object")
        throw new Error("Object body required.");
    } else if (tool.bodySchema || tool.responseAdapterApproved)
      throw new Error("Unexpected POST configuration.");
    if (
      new Set(tool.parameters.map((p) => p.inputName)).size !==
      tool.parameters.length
    )
      throw new Error("Duplicate input names.");
    for (const p of tool.parameters) {
      if (
        p.inputName !== `${p.location}_${p.name}` ||
        (p.enum && p.enum.some((v) => !matchesType(v, p.type)))
      )
        throw new Error("Invalid parameter definition.");
    }
  }
  return manifest;
}
function matchesType(value: unknown, type: Parameter["type"]) {
  return type === "integer"
    ? typeof value === "number" && Number.isSafeInteger(value)
    : typeof value === type;
}
export function toolSchema(tool: Tool) {
  const shape: Record<string, z.ZodType> = {};
  for (const p of tool.parameters) {
    let schema: z.ZodType =
      p.type === "string"
        ? z.string().max(2048)
        : p.type === "boolean"
          ? z.boolean()
          : p.type === "integer"
            ? z.number().int().safe()
            : z.number().finite();
    // JSON schema enum must be visible to the client as well as enforced at execution.
    if (p.enum) schema = z.literal(p.enum);
    schema = schema.describe(p.description);
    shape[p.inputName] = p.required ? schema : schema.optional();
  }
  if (tool.method === "POST") shape.body = bodyValidator(tool.bodySchema!);
  return z.object(shape).strict();
}
export function inputSchema(tool: Tool) {
  return z.toJSONSchema(toolSchema(tool));
}
