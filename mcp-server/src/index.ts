import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import $RefParser from "@apidevtools/json-schema-ref-parser";
import { fileURLToPath } from "url";
import { openApiSchemaToZod, parametersToZod } from "./schema.js";
import { executeRequest } from "./client.js";
import { SpecInspector } from "./lsp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const YC_DOCS_URL = "https://github.com/yandex-cloud/docs/tree/master/ru";

async function main() {
  const server = new McpServer({
    name: "eflow-api-server",
    version: "1.3.0", // Bump version
  });

  const specPath = path.resolve(__dirname, "../../HostApp/openapi_source.yaml");
  
  if (!fs.existsSync(specPath)) {
    console.error(`Spec file not found at ${specPath}`);
    process.exit(1);
  }

  try {
    const rawContent = fs.readFileSync(specPath, "utf8");
    const inspector = new SpecInspector(rawContent);
    const rawSpec = yaml.load(rawContent);
    const spec: any = await $RefParser.dereference(rawSpec as any);

    console.error(`OpenAPI spec parsed with Yandex Cloud & Mock support. [MOCK_MODE=${process.env.EFLOW_MOCK_MODE}]`);

    // --- REGISTER API TOOLS ---
    for (const [pathUrl, pathItem] of Object.entries(spec.paths as any)) {
      for (const [method, operation] of Object.entries(pathItem as any)) {
        if (typeof operation !== "object" || method === "parameters") continue;

        const op = operation as any;
        const toolName = op.operationId || `${method}_${pathUrl.replace(/\//g, "_").replace(/[{}]/g, "")}`;
        const location = inspector.findLocation(["paths", pathUrl, method]);
        
        // Extract success response schema for Mocking
        const successResponse = op.responses?.["200"] || op.responses?.["201"];
        const responseSchema = successResponse?.content?.["application/json"]?.schema;

        // --- YC EXTENSIONS PARSING ---
        let ycMeta = "";
        const ycIntegration = op["x-yc-apigateway-integration"];
        if (ycIntegration) {
          const type = ycIntegration.type || "unknown";
          const target = ycIntegration.function_id || ycIntegration.url || ycIntegration.container_id || "";
          ycMeta = `\n[YC Integration: ${type}${target ? ` | ID: ${target}` : ""}]`;
        }
        
        const security = op.security || spec.security || [];
        for (const secRequirement of security) {
          for (const schemeName of Object.keys(secRequirement)) {
            const scheme = spec.components?.securitySchemes?.[schemeName];
            if (scheme && scheme["x-yc-apigateway-authorizer"]) {
              const ycAuth = scheme["x-yc-apigateway-authorizer"];
              ycMeta += ` [YC Auth: ${ycAuth.type || scheme.type}]`;
            }
          }
        }

        const description = (op.summary || op.description || `Call ${method.toUpperCase()} ${pathUrl}`) + 
                            ycMeta +
                            (location ? `\n[Source: lines ${location.line}-${location.lineEnd}]` : "") +
                            (process.env.EFLOW_MOCK_MODE === "true" ? "\n[MOCK MODE ACTIVE]" : "") +
                            `\nDocs: ${YC_DOCS_URL}`;

        const parameters = [
          ...(spec.paths[pathUrl].parameters || []),
          ...(op.parameters || []),
        ];

        const inputShape: Record<string, z.ZodType<any>> = {};
        for (const param of parameters) {
          let paramSchema = openApiSchemaToZod(param.schema);
          if (!param.required) paramSchema = paramSchema.optional();
          inputShape[param.name] = paramSchema.describe(param.description || "");
        }

        if (op.requestBody) {
          const content = op.requestBody.content?.["application/json"];
          if (content?.schema) {
            inputShape["requestBody"] = openApiSchemaToZod(content.schema).describe("Request body");
          }
        }

        server.tool(
          toolName,
          description,
          inputShape,
          async (args) => {
            return await executeRequest(method, pathUrl, args, parameters, { 
              source: location,
              specPath: "HostApp/docs/openapi.yaml"
            }, responseSchema);
          }
        );
      }
    }

    // --- REGISTER LSP & YC DISCOVERY TOOLS ---
    server.tool(
      "spec_get_yc_architecture",
      "Returns a summary of all Yandex Cloud API Gateway architecture (integrations, authorizers, global settings).",
      {},
      async () => {
        const architecture: any = {
          integrations: [],
          authorizers: spec.components?.securitySchemes ? 
            Object.entries(spec.components.securitySchemes)
              .filter(([_, scheme]: [string, any]) => scheme["x-yc-apigateway-authorizer"])
              .map(([name, scheme]: [string, any]) => ({ name, ...scheme })) : [],
          global: spec["x-yc-apigateway"] || {}
        };

        for (const [pathUrl, pathItem] of Object.entries(spec.paths as any)) {
          for (const [method, operation] of Object.entries(pathItem as any)) {
            if (typeof operation !== "object" || method === "parameters") continue;
            const op = operation as any;
            if (op["x-yc-apigateway-integration"]) {
              architecture.integrations.push({
                path: pathUrl,
                method: method.toUpperCase(),
                integration: op["x-yc-apigateway-integration"]
              });
            }
          }
        }
        return {
          content: [
            { type: "text", text: JSON.stringify(architecture, null, 2) },
            { type: "text", text: `\n\nOfficial Yandex Cloud API Gateway Documentation: ${YC_DOCS_URL}` }
          ]
        };
      }
    );

    server.tool(
      "spec_find_definition",
      "LSP 'Go to definition'. Find the line location of a specific schema, parameter or path in the YAML spec.",
      {
        path: z.array(z.string()).describe("Path segments in the YAML, e.g. ['components', 'schemas', 'User']")
      },
      async ({ path }) => {
        const location = inspector.findLocation(path);
        if (!location) return { content: [{ type: "text", text: "Definition not found." }] };
        const fragment = inspector.getFragment(location.line, location.lineEnd);
        return {
          content: [{ type: "text", text: `Location: lines ${location.line}-${location.lineEnd}\n\n${fragment}` }],
          _meta: { location }
        };
      }
    );

    server.tool(
      "spec_get_hierarchy",
      "Returns a high-level overview of all paths and their tags from the spec.",
      {},
      async () => {
        const hierarchy = Object.entries(spec.paths).map(([p, item]: [string, any]) => ({
          path: p,
          methods: Object.keys(item).filter(m => m !== "parameters")
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(hierarchy, null, 2) }]
        };
      }
    );

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`EFlow MCP Server v1.2.0 running (Mock Mode: ${process.env.EFLOW_MOCK_MODE === "true"})`);

  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

main();
