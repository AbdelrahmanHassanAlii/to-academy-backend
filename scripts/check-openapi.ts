import SwaggerParser from '@apidevtools/swagger-parser';

const spec = await SwaggerParser.validate('docs/openapi.yaml');
console.log(
  `OpenAPI ${spec.info.version}: validated ${Object.keys(spec.paths ?? {}).length} implemented paths`,
);
