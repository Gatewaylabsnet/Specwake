import type { EnvelopeAdapter } from "../runtime/result-adapter.js";
import type { Tool } from "../core/model.js";
/** Synthetic example configuration, deliberately outside the generic OpenAPI importer. */
export const READ_POST_FIELDS: Record<string, string[]> = {
  "/realPersonSearch": ["IdNo"],
  "/GetFieldProductPerson": ["ProductionYear", "IdTaxNo"],
  "/PetitionProductionYear": ["IdTaxNo"],
};
export const READ_POST_ALLOWLIST = Object.keys(READ_POST_FIELDS).map(
  (path) => `POST ${path}`,
);
export const MOCK_UPSTREAM_TOKEN = "public-synthetic-upstream-fixture-only";
export const READ_POST_ADAPTER: EnvelopeAdapter = {
  statusField: "statusCode",
  successValues: [200],
  errorsField: "errors",
  dataField: "data",
  rowCountField: "numRows",
  partialField: "partial",
  maskFields: [
    "IdNo",
    "IdTaxNo",
    "IBAN",
    "address",
    "fullName",
    "token",
    "password",
    "Authorization",
  ],
};
export function validateSyntheticReadBody(tool: Tool) {
  const fields = READ_POST_FIELDS[tool.path];
  if (
    !fields ||
    Object.keys(tool.bodySchema?.properties ?? {}).some(
      (key) => !fields.includes(key),
    ) ||
    fields.some((key) => tool.bodySchema?.properties?.[key]?.type !== "string")
  )
    throw new Error(
      "Synthetic profile requires the declared string query fields.",
    );
}
