import { z } from "zod";

export function openApiSchemaToZod(schema: any): z.ZodType<any> {
  if (!schema) return z.any();

  // Handle $ref (simplified, assuming they are already resolved or minimal)
  if (schema.$ref) {
    return z.any().describe(`Ref: ${schema.$ref}`);
  }

  const description = schema.description || "";

  switch (schema.type) {
    case "string":
      let stringSchema = z.string();
      if (schema.enum) {
        stringSchema = z.enum(schema.enum as [string, ...string[]]) as any;
      }
      return stringSchema.describe(description);

    case "number":
    case "integer":
      return z.number().describe(description);

    case "boolean":
      return z.boolean().describe(description);

    case "array":
      return z.array(openApiSchemaToZod(schema.items)).describe(description);

    case "object":
      const shape: Record<string, z.ZodType<any>> = {};
      const properties = schema.properties || {};
      const required = schema.required || [];

      for (const [key, prop] of Object.entries(properties)) {
        let propSchema = openApiSchemaToZod(prop);
        if (!required.includes(key)) {
          propSchema = propSchema.optional();
        }
        shape[key] = propSchema;
      }
      return z.object(shape).describe(description);

    default:
      if (schema.properties) {
        return openApiSchemaToZod({ ...schema, type: "object" });
      }
      return z.any().describe(description);
  }
}

export function parametersToZod(parameters: any[] = []): z.ZodObject<any> {
  const shape: Record<string, z.ZodType<any>> = {};

  for (const param of parameters) {
    let paramSchema = openApiSchemaToZod(param.schema);
    if (!param.required) {
      paramSchema = paramSchema.optional();
    }
    shape[param.name] = paramSchema.describe(param.description || "");
  }

  return z.object(shape);
}
