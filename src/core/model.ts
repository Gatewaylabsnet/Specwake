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
export interface Operation {
  id: string;
  method: string;
  path: string;
  name: string;
  description: string;
  parameters: Parameter[];
  auth: Auth;
  issues: string[];
}
export interface ImportedSpec { title: string; version: string; operations: Operation[] }
export interface Tool extends Omit<Operation, 'issues' | 'id'> { operationId: string }
export interface Manifest { version: 1; tools: Tool[] }
export interface Selection { id: string; name: string; description: string }
