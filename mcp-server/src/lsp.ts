import * as YAML from "yaml-ast-parser";
import spectralCore from "@stoplight/spectral-core";
const { Spectral, Document } = spectralCore;
import spectralRulesets from "@stoplight/spectral-rulesets";
const { oas } = spectralRulesets;
import spectralParsers from "@stoplight/spectral-parsers";
const { Yaml } = spectralParsers as any;
import { truthy, enumeration } from "@stoplight/spectral-functions";

export interface SymbolLocation {
  line: number;
  column: number;
  lineEnd: number;
}

export class SpecInspector {
  private ast: any;
  private content: string;
  private spectral: any;

  constructor(content: string) {
    this.content = content;
    this.ast = YAML.safeLoad(content);
    this.spectral = new (Spectral as any)();
    
    // Load OAS ruleset and add Yandex Cloud specific rules
    this.spectral.setRuleset({
      extends: [oas],
      rules: {
        "yc-integration-type-required": {
          description: "x-yc-apigateway-integration must contain a 'type' property. Docs: https://github.com/yandex-cloud/docs/tree/master/ru",
          severity: "error",
          given: "$..['x-yc-apigateway-integration']",
          then: {
            field: "type",
            function: truthy,
          },
        },
        "yc-integration-valid-type": {
          description: "x-yc-apigateway-integration 'type' must be one of the supported Yandex Cloud types. Docs: https://github.com/yandex-cloud/docs/tree/master/ru",
          severity: "error",
          given: "$..['x-yc-apigateway-integration']",
          then: {
            field: "type",
            function: enumeration,
            functionOptions: {
              values: [
                "cloud_functions",
                "http",
                "dummy",
                "object_storage",
                "serverless_containers",
                "cloud_ymq",
                "cloud_ydb",
                "cloud_datastreams",
              ],
            },
          },
        },
        "yc-authorizer-type-required": {
          description: "x-yc-apigateway-authorizer must contain a 'type' property. Docs: https://github.com/yandex-cloud/docs/tree/master/ru",
          severity: "error",
          given: "$..['x-yc-apigateway-authorizer']",
          then: {
            field: "type",
            function: truthy,
          },
        },
      },
    });
  }

  public findLocation(path: string[]): SymbolLocation | null {
    let current = this.ast;
    for (const segment of path) {
      if (!current || !current.mappings) return null;
      const mapping = current.mappings.find((m: any) => m.key.value === segment);
      if (!mapping) return null;
      current = mapping.value;
    }

    if (!current) return null;

    const start = this.getLineColumn(current.startPosition);
    const end = this.getLineColumn(current.endPosition);

    return {
      line: start.line,
      column: start.column,
      lineEnd: end.line
    };
  }

  private getLineColumn(pos: number) {
    const lines = this.content.substring(0, pos).split("\n");
    return {
      line: lines.length,
      column: lines[lines.length - 1].length
    };
  }

  public async lint(customContent?: string) {
    const contentToLint = customContent || this.content;
    const myDocument = new (Document as any)(contentToLint, Yaml as any);
    
    const results = await this.spectral.run(myDocument);
    return results.map((r: any) => ({
      code: r.code,
      message: r.message,
      severity: r.severity,
      range: r.range
    }));
  }

  public getFragment(startLine: number, endLine: number): string {
    const lines = this.content.split("\n");
    return lines.slice(startLine - 1, endLine).join("\n");
  }
}
