import Ajv2020Module from "ajv/dist/2020.js";
import fs from "node:fs";
import path from "node:path";
import { packagePath } from "./package-root.ts";
import type { JsonObject } from "./types.ts";

const SCHEMA_DIR = packagePath("schemas");
const SCHEMA_FILES = {
  "evidence-payload": "evidence-payload.schema.json",
  manifest: "manifest.schema.json",
  "architecture-baseline": "architecture-baseline.schema.json",
  "build-vs-buy": "build-vs-buy.schema.json"
} as const;

type SchemaName = keyof typeof SCHEMA_FILES;
export type SchemaValidationError = {
  path: string;
  message: string;
  keyword?: string;
};
export type SchemaValidationResult = {
  valid: boolean;
  errors: SchemaValidationError[];
};

const Ajv2020 = Ajv2020Module as unknown as new (options: JsonObject) => any;
const ajv = new Ajv2020({ allErrors: true });
const validators = new Map<SchemaName, any>();

function readSchema(name: SchemaName): JsonObject {
  const fileName = SCHEMA_FILES[name];
  if (!fileName) throw new Error(`Unknown OpenNori schema: ${name}`);
  return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, fileName), "utf8"));
}

export function schemaPath(name: SchemaName): string {
  const fileName = SCHEMA_FILES[name];
  if (!fileName) throw new Error(`Unknown OpenNori schema: ${name}`);
  return path.join(SCHEMA_DIR, fileName);
}

export function validateSchema(name: SchemaName, payload: unknown): SchemaValidationResult {
  if (!validators.has(name)) {
    validators.set(name, ajv.compile(readSchema(name)));
  }
  const validate = validators.get(name);
  const valid = validate(payload);
  return {
    valid,
    errors: valid
      ? []
      : (validate.errors || []).map((error: any) => ({
        path: error.instancePath || "/",
        message: error.message || "Schema validation failed",
        keyword: error.keyword
      }))
  };
}

export function schemaErrorSummary(result: SchemaValidationResult): string {
  if (result.valid) return "Schema validation passed.";
  return result.errors
    .slice(0, 3)
    .map((error: SchemaValidationError) => `${error.path} ${error.message}`)
    .join("; ");
}
