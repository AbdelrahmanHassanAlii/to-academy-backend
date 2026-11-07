import { expect } from 'vitest';
import { openapiDocument } from '../../src/config/openapi.js';
type Schema = {
  properties: Record<string, unknown>;
  required?: string[];
  example?: Record<string, unknown>;
};
export function expectOpenApiFields(value: Record<string, unknown>, name: string) {
  const spec = openapiDocument as { components: { schemas: Record<string, Schema> } };
  const schema = spec.components.schemas[name]!;
  expect(Object.keys(value).sort()).toEqual(Object.keys(schema.properties).sort());
  for (const key of schema.required ?? []) expect(value).toHaveProperty(key);
  if (schema.example) expect(Object.keys(schema.example).sort()).toEqual(Object.keys(value).sort());
}
