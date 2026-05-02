import { faker } from "@faker-js/faker";

export async function generateMockResponse(schema: any): Promise<any> {
  if (!schema) {
    return { message: "No response schema provided for mocking." };
  }

  return fakeData(schema);
}

function fakeData(schema: any): any {
  if (schema.$ref) {
    // In our case refs are already dereferenced by $RefParser
    return {};
  }

  // Support for 'allOf', 'anyOf', 'oneOf' - take the first one
  if (schema.oneOf || schema.anyOf || schema.allOf) {
    const list = schema.oneOf || schema.anyOf || schema.allOf;
    return fakeData(list[0]);
  }

  const type = schema.type;

  switch (type) {
    case "string":
      if (schema.enum) return faker.helpers.arrayElement(schema.enum);
      if (schema.format === "uuid") return faker.string.uuid();
      if (schema.format === "date-time") return faker.date.recent().toISOString();
      if (schema.format === "email") return faker.internet.email();
      return faker.lorem.words(3);

    case "number":
    case "integer":
      return faker.number.int({ min: 1, max: 100 });

    case "boolean":
      return faker.datatype.boolean();

    case "array":
      const count = faker.number.int({ min: 1, max: 3 });
      const items = [];
      for (let i = 0; i < count; i++) {
        items.push(fakeData(schema.items));
      }
      return items;

    case "object":
      const obj: any = {};
      const props = schema.properties || {};
      for (const [key, prop] of Object.entries(props)) {
        obj[key] = fakeData(prop);
      }
      return obj;

    default:
      if (schema.properties) return fakeData({ ...schema, type: "object" });
      return null;
  }
}
