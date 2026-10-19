export interface Parameter {
  name: string;
  inputName: string;
  location: 'path' | 'query';
  required: boolean;
  type: 'string' | 'integer' | 'number' | 'boolean';
  enum?: (string | number | boolean)[];
  description: string;
}
export type Auth = { kind: 'none' } | { kind: 'bearer' } | { kind: 'apiKey'; header: string };
export interface JsonBodySchema {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  properties?: Record<string, JsonBodySchema>;
  required?: string[];
  additionalProperties?: false;
  items?: JsonBodySchema;
  enum?: (string | number | boolean)[];
  description?: string;
}
export interface BodyReview {
  declaredType: string;
  schema?: JsonBodySchema;
  proposal?: JsonBodySchema;
  warnings: string[];
}
export interface Operation {
  id: string;
  method: string;
  path: string;
  name: string;
  description: string;
  parameters: Parameter[];
  auth: Auth;
  issues: string[];
  requestBody?: BodyReview;
  responseWarnings?: string[];
}
export interface ImportedSpec { title: string; version: string; operations: Operation[] }
export interface Tool extends Omit<Operation, 'issues' | 'id' | 'requestBody' | 'responseWarnings'> {
  operationId: string;
  bodySchema?: JsonBodySchema;
  readOnlyConfirmed?: true;
  responseAdapterApproved?: true;
}
export interface Manifest { version: 1; tools: Tool[] }
export interface Selection {
  id: string; name: string; description: string;
  readOnlyConfirmed?: boolean;
  bodyOverride?: JsonBodySchema;
  bodyOverrideApproved?: boolean;
  responseAdapterApproved?: boolean;
}
