import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

// Works from source and compiled dist/config without relying on the launch directory.
export const openapiDocument: unknown = parse(
  readFileSync(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8'),
);
