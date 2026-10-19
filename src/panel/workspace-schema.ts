import { z } from "zod";
import { createHash } from "node:crypto";
import { manifestSchema, NAME, validateManifest } from "../core/contracts.js";
import { normalizeBodySchema } from "../core/body-schema.js";
import { targetSchema, validateTarget, type Target } from "../runtime/http.js";
import type { Manifest } from "../core/model.js";

const body = z.unknown().transform((value, ctx) => {
  try {
    return normalizeBodySchema(value);
  } catch {
    ctx.addIssue({ code: "custom", message: "Invalid body schema" });
    return z.NEVER;
  }
});
export const savedSelection = z
  .object({
    id: z.string().max(600),
    name: z.string().regex(NAME),
    description: z.string().max(2000),
    readOnlyConfirmed: z.boolean().optional(),
    bodyOverride: body.optional(),
    bodyOverrideApproved: z.boolean().optional(),
    responseAdapterApproved: z.boolean().optional(),
  })
  .strict();
const op = manifestSchema.shape.tools.element
  .omit({
    operationId: true,
    bodySchema: true,
    readOnlyConfirmed: true,
    responseAdapterApproved: true,
  })
  .extend({
    id: z.string().max(600),
    method: z.enum([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      "TRACE",
    ]),
    issues: z.array(z.string().max(2000)).max(80),
    requestBody: z
      .object({
        declaredType: z.string().max(100),
        schema: body.optional(),
        proposal: body.optional(),
        warnings: z.array(z.string().max(2000)).max(20),
      })
      .strict()
      .optional(),
    responseWarnings: z.array(z.string().max(2000)).max(20).optional(),
  })
  .strict();
export const savedGroup = z
  .object({
    id: z.uuid(),
    importedAt: z.iso.datetime(),
    title: z.string().max(120),
    version: z.string().regex(/^3\.[01]\.\d{1,3}$/),
    targetMode: z.enum(["synthetic", "unconfigured"]),
    operations: z.array(op).min(1).max(200),
  })
  .strict();
const operatorTarget = targetSchema
  .refine((t) => t.mode !== "mock" && !t.allowInsecureHttp)
  .transform((value) => validateTarget(value));
export { operatorTarget };
export const profileSchema = z
  .object({
    groupId: z.uuid(),
    selections: z.array(savedSelection).min(1).max(64),
    target: operatorTarget.optional(),
    approval: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export const workspaceSchema = z
  .object({
    version: z.literal(1),
    mcpPort: z.number().int().min(1).max(65535),
    groups: z.array(savedGroup).max(8),
    profiles: z.array(profileSchema).max(8),
    activeGroupId: z.uuid().optional(),
  })
  .strict();
export type WorkspaceData = z.infer<typeof workspaceSchema>;
export type Profile = z.infer<typeof profileSchema>;
export function approvalHash(
  group: unknown,
  manifest: Manifest,
  target: Target,
) {
  const canonical = (value: any): any =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical(value[k])]),
          )
        : value;
  return createHash("sha256")
    .update(
      JSON.stringify(
        canonical({ group, manifest: validateManifest(manifest), target }),
      ),
    )
    .digest("hex");
}
export function validateOperatorTarget(value: unknown, manifest: Manifest) {
  const target = operatorTarget.parse(value);
  const posts = manifest.tools
    .filter((t) => t.method === "POST")
    .map((t) => t.operationId);
  if (
    (posts.length && !target.responseAdapter) ||
    target.allowedReadPosts?.some((id) => !posts.includes(id)) ||
    posts.some((id) => !target.allowedReadPosts?.includes(id))
  )
    throw new Error("POST target approval mismatch");
  return target;
}
