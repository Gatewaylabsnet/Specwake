import { z } from "zod";
import type { BodyReview, JsonBodySchema } from "./model.js";
export const POST_REVIEW = "POST requires explicit read-only approval.";
export const BODY_REVIEW =
  "JSON body requires an approved object schema override.";
export const MAX_BODY_BYTES = 16 * 1024;
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Bounded schema subset; never execute patterns, URLs or arbitrary schema extensions. */
export function normalizeBodySchema(value: unknown, depth = 0): JsonBodySchema {
  if (
    !record(value) ||
    depth > 4 ||
    !["object", "array", "string", "integer", "number", "boolean"].includes(
      value.type,
    )
  )
    throw new Error("Unsupported body schema");
  const allowed = [
    "type",
    "description",
    "title",
    ...(value.type === "object"
      ? ["properties", "required", "additionalProperties"]
      : value.type === "array"
        ? ["items"]
        : ["enum"]),
  ];
  if (Object.keys(value).some((k) => !allowed.includes(k)))
    throw new Error("Unsupported body schema keyword");
  const schema: JsonBodySchema = { type: value.type };
  if (value.description !== undefined) {
    if (
      typeof value.description !== "string" ||
      value.description.length > 2000
    )
      throw new Error("Invalid schema description");
    schema.description = value.description;
  }
  if (value.type === "object") {
    if (
      !record(value.properties) ||
      Object.keys(value.properties).length > 32 ||
      (value.additionalProperties !== undefined &&
        value.additionalProperties !== false)
    )
      throw new Error("Object properties required");
    if (
      Object.keys(value.properties).some(
        (k) =>
          !/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(k) ||
          ["constructor", "prototype", "__proto__"].includes(k),
      )
    )
      throw new Error("Invalid property");
    schema.properties = Object.fromEntries(
      Object.entries(value.properties).map(([key, child]) => [
        key,
        normalizeBodySchema(child, depth + 1),
      ]),
    );
    schema.additionalProperties = false;
    if (value.required !== undefined) {
      if (
        !Array.isArray(value.required) ||
        new Set(value.required).size !== value.required.length ||
        value.required.some(
          (key: unknown) =>
            typeof key !== "string" || !Object.hasOwn(schema.properties!, key),
        )
      )
        throw new Error("Invalid required list");
      schema.required = [...value.required];
    }
  } else if (value.type === "array")
    schema.items = normalizeBodySchema(value.items, depth + 1);
  else if (value.enum !== undefined) {
    if (
      !Array.isArray(value.enum) ||
      !value.enum.length ||
      value.enum.length > 100 ||
      value.enum.some((item: unknown) =>
        value.type === "integer"
          ? !Number.isSafeInteger(item)
          : typeof item !== value.type ||
            (typeof item === "number" && !Number.isFinite(item)) ||
            (typeof item === "string" && item.length > 2048),
      )
    )
      throw new Error("Invalid body enum");
    schema.enum = [...value.enum];
  }
  return schema;
}
export function bodyValidator(schema: JsonBodySchema): z.ZodType {
  let result: z.ZodType;
  if (schema.type === "object")
    result = z
      .object(
        Object.fromEntries(
          Object.entries(schema.properties ?? {}).map(([key, child]) => [
            key,
            schema.required?.includes(key)
              ? bodyValidator(child)
              : bodyValidator(child).optional(),
          ]),
        ),
      )
      .strict();
  else if (schema.type === "array")
    result = z.array(bodyValidator(schema.items!)).max(50);
  else if (schema.enum) result = z.literal(schema.enum);
  else
    result =
      schema.type === "string"
        ? z.string().max(2048)
        : schema.type === "boolean"
          ? z.boolean()
          : schema.type === "integer"
            ? z.number().int().safe()
            : z.number().finite();
  return schema.description ? result.describe(schema.description) : result;
}
function draft(example: unknown, depth = 0): JsonBodySchema | undefined {
  if (depth > 4 || example === null) return;
  if (record(example)) {
    const entries = Object.entries(example);
    if (entries.length > 32) return;
    const properties: Record<string, JsonBodySchema> = {};
    for (const [key, value] of entries) {
      if (
        !/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(key) ||
        ["constructor", "prototype", "__proto__"].includes(key)
      )
        return;
      const child = draft(value, depth + 1);
      if (!child) return;
      properties[key] = child;
    }
    // Examples cannot prove required fields. No example values are retained.
    return { type: "object", properties, additionalProperties: false };
  }
  if (["string", "boolean", "number"].includes(typeof example))
    return { type: typeof example as "string" | "boolean" | "number" };
}
export function reviewBody(request: any): BodyReview {
  const media = request?.content?.["application/json"];
  const schema = media?.schema;
  const example =
    media?.example ??
    Object.values(media?.examples ?? {})
      .map((e: any) => e?.value)
      .find((v) => v !== undefined) ??
    schema?.example;
  const review: BodyReview = {
    declaredType: typeof schema?.type === "string" ? schema.type : "missing",
    warnings: [],
  };
  try {
    review.schema = normalizeBodySchema(schema);
    if (review.schema.type !== "object") throw new Error();
  } catch {
    delete review.schema;
    review.warnings.push(
      "Bildirilen body şeması desteklenen JSON object sözleşmesi değil; açık override gerekir.",
    );
  }
  if (example !== undefined && record(example) && schema?.type !== "object")
    review.warnings.push(
      "Şema ile örnek tutarsız: şema object değil, örnek object. Örnek güvenilir sözleşme sayılmaz.",
    );
  review.proposal = draft(example);
  if (review.warnings.length) delete review.schema;
  return review;
}
export function responseWarnings(responses: any): string[] {
  const media = Object.entries(responses ?? {})
    .filter(([status]) => /^2\d\d$/.test(status))
    .map(([, r]: any) => r?.content?.["application/json"]);
  if (!media.length || media.some((m) => !m?.schema))
    return [
      "Yanıt şeması eksik; sonuç adaptörü ve tamlık ayrıca değerlendirilmelidir.",
    ];
  return media.some(
    (m) => m.schema.type === "string" && record(m.example ?? m.schema.example),
  )
    ? [
        "Yanıt şeması string, örnek object. Yanıt şemasına güvenilmez; açık adaptör onayı gerekir.",
      ]
    : [];
}
