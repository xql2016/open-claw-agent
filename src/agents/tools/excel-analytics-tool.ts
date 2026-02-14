import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import { resolveUserPath } from "../../utils.js";
import { assertSandboxPath } from "../sandbox-paths.js";
import { jsonResult, readNumberParam, readStringParam, type AnyAgentTool } from "./common.js";

/**
 * Excel Analytics Tool
 *
 * Provides Excel file analysis capabilities with sampling strategy to minimize token usage.
 * - Sample data (first N rows) for structure understanding
 * - Execute calculations on full dataset using SQL queries
 * - Generate statistics and metrics
 */

type ExcelAnalyticsConfig = {
  sampling?: {
    defaultRows?: number;
    maxRows?: number;
  };
  calculation?: {
    timeout?: number;
    chunkSize?: number;
  };
};

type ExcelSampleResult = {
  totalRows: number;
  sampleRows: number;
  columns: string[];
  columnTypes: Record<string, string>;
  preview: unknown[];
  statistics?: Record<string, unknown>;
};

type ExcelCalculationResult = {
  metrics: unknown[];
  rowsProcessed: number;
  executionTime: number;
};

/**
 * Parse Excel file and return sample data
 */
async function sampleExcelData(params: {
  filepath: string;
  rows?: number;
  method?: "head" | "random";
  workspaceDir: string;
}): Promise<ExcelSampleResult> {
  const { filepath, rows = 1000, method = "head", workspaceDir } = params;

  // Resolve and validate file path
  const fullPath = path.isAbsolute(filepath) ? filepath : path.resolve(workspaceDir, filepath);

  // Check file exists
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(`Excel file not found: ${filepath}`);
  }

  // Lazy load xlsx to avoid bundling it when not needed
  const XLSX = await import("xlsx");

  // Read Excel file
  const workbook = XLSX.readFile(fullPath);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file has no sheets");
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found`);
  }

  // Convert to JSON
  const fullData = XLSX.utils.sheet_to_json(worksheet);
  const totalRows = fullData.length;

  if (totalRows === 0) {
    throw new Error("Excel file is empty");
  }

  // Sample data
  let sampleData: unknown[];
  if (method === "random") {
    // Random sampling
    const indices = new Set<number>();
    const sampleSize = Math.min(rows, totalRows);
    while (indices.size < sampleSize) {
      indices.add(Math.floor(Math.random() * totalRows));
    }
    sampleData = Array.from(indices)
      .toSorted((a, b) => a - b)
      .map((i) => fullData[i]);
  } else {
    // Head sampling (default)
    sampleData = fullData.slice(0, rows);
  }

  // Infer column types from sample
  const columns = sampleData.length > 0 ? Object.keys(sampleData[0] as object) : [];
  const columnTypes: Record<string, string> = {};

  for (const col of columns) {
    const values = sampleData
      .map((row) => (row as Record<string, unknown>)[col])
      .filter((v) => v !== null && v !== undefined);

    if (values.length === 0) {
      columnTypes[col] = "unknown";
      continue;
    }

    const firstValue = values[0];
    if (typeof firstValue === "number") {
      columnTypes[col] = "number";
    } else if (firstValue instanceof Date) {
      columnTypes[col] = "date";
    } else if (typeof firstValue === "boolean") {
      columnTypes[col] = "boolean";
    } else {
      columnTypes[col] = "string";
    }
  }

  // Calculate basic statistics for numeric columns
  const statistics: Record<string, unknown> = {};
  for (const col of columns) {
    if (columnTypes[col] === "number") {
      const values = sampleData
        .map((row) => (row as Record<string, unknown>)[col] as number)
        .filter((v) => typeof v === "number" && !Number.isNaN(v));

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const mean = sum / values.length;
        const sorted = [...values].toSorted((a, b) => a - b);
        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        statistics[col] = {
          count: values.length,
          min,
          max,
          mean: Math.round(mean * 100) / 100,
        };
      }
    }
  }

  return {
    totalRows,
    sampleRows: sampleData.length,
    columns,
    columnTypes,
    preview: sampleData.slice(0, 5),
    statistics,
  };
}

/**
 * Execute SQL query on full Excel data
 */
async function calculateMetrics(params: {
  filepath: string;
  sql: string;
  workspaceDir: string;
}): Promise<ExcelCalculationResult> {
  const { filepath, sql, workspaceDir } = params;

  // Resolve file path
  const fullPath = path.isAbsolute(filepath) ? filepath : path.resolve(workspaceDir, filepath);

  // Check file exists
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(`Excel file not found: ${filepath}`);
  }

  const startTime = Date.now();

  // Lazy load libraries
  const XLSX = await import("xlsx");
  const alasql = (await import("alasql")).default;

  // Read full Excel data
  const workbook = XLSX.readFile(fullPath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  // Execute SQL query using alasql
  const result = alasql(sql, [data]);

  const executionTime = Date.now() - startTime;

  return {
    metrics: Array.isArray(result) ? result : [result],
    rowsProcessed: data.length,
    executionTime,
  };
}

/**
 * Get Excel file metadata without reading data
 */
async function getExcelInfo(params: { filepath: string; workspaceDir: string }): Promise<{
  totalRows: number;
  columns: string[];
  sheetNames: string[];
  fileSize: number;
}> {
  const { filepath, workspaceDir } = params;

  const fullPath = path.isAbsolute(filepath) ? filepath : path.resolve(workspaceDir, filepath);

  // Check file exists
  const stats = await fs.stat(fullPath);

  // Lazy load xlsx
  const XLSX = await import("xlsx");

  // Read only sheet names first
  const workbook = XLSX.readFile(fullPath, { sheetRows: 1 });
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error("Excel file has no sheets");
  }

  // Read first sheet to get structure
  const fullWorkbook = XLSX.readFile(fullPath);
  const worksheet = fullWorkbook.Sheets[sheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet);
  const columns = data.length > 0 ? Object.keys(data[0] as object) : [];

  return {
    totalRows: data.length,
    columns,
    sheetNames,
    fileSize: stats.size,
  };
}

/**
 * Create Excel analytics tool
 */
export function createExcelAnalyticsTool(options: {
  config?: ExcelAnalyticsConfig;
  workspaceDir: string;
  sandboxPaths?: string[];
}): AnyAgentTool {
  const { config, workspaceDir, sandboxPaths } = options;

  const defaultRows = config?.sampling?.defaultRows ?? 1000;
  const maxRows = config?.sampling?.maxRows ?? 5000;

  return {
    name: "excel_analytics",
    description: `Analyze Excel files with sampling strategy to minimize token usage.
    
Available actions:
- info: Get file metadata (rows, columns, sheets) without reading data
- sample: Read first N rows to understand data structure (default: ${defaultRows} rows)
- calculate: Execute SQL queries on full dataset and return aggregated metrics

Best practices:
1. Start with 'info' to understand file structure
2. Use 'sample' to preview data and design calculations
3. Use 'calculate' with SQL to compute metrics on full dataset
4. Sample data is for understanding structure, calculations run on full data`,

    schema: Type.Object({
      action: Type.Union(
        [Type.Literal("info"), Type.Literal("sample"), Type.Literal("calculate")],
        {
          description: "Action to perform",
        },
      ),
      filepath: Type.String({
        description: "Path to Excel file (relative to workspace or absolute)",
      }),
      rows: Type.Optional(
        Type.Number({
          description: `Number of rows to sample (default: ${defaultRows}, max: ${maxRows})`,
          minimum: 1,
          maximum: maxRows,
        }),
      ),
      method: Type.Optional(
        Type.Union([Type.Literal("head"), Type.Literal("random")], {
          description: "Sampling method: 'head' (first N rows) or 'random'",
        }),
      ),
      sql: Type.Optional(
        Type.String({
          description: "SQL query to execute on full dataset (for 'calculate' action)",
        }),
      ),
    }),

    async execute(params): Promise<AgentToolResult<unknown>> {
      const action = readStringParam(params, "action", { required: true });
      const filepath = readStringParam(params, "filepath", { required: true });

      // Validate sandbox paths if configured
      if (sandboxPaths && sandboxPaths.length > 0) {
        const fullPath = path.isAbsolute(filepath)
          ? filepath
          : path.resolve(workspaceDir, filepath);
        assertSandboxPath(fullPath, sandboxPaths);
      }

      try {
        if (action === "info") {
          const info = await getExcelInfo({ filepath, workspaceDir });
          return jsonResult({
            success: true,
            action: "info",
            data: info,
          });
        }

        if (action === "sample") {
          const rows = readNumberParam(params, "rows", { integer: true }) ?? defaultRows;
          const method = (readStringParam(params, "method") ?? "head") as "head" | "random";

          // Enforce max rows
          const limitedRows = Math.min(rows, maxRows);

          const sample = await sampleExcelData({
            filepath,
            rows: limitedRows,
            method,
            workspaceDir,
          });

          return jsonResult({
            success: true,
            action: "sample",
            data: sample,
          });
        }

        if (action === "calculate") {
          const sql = readStringParam(params, "sql", { required: true });

          const result = await calculateMetrics({
            filepath,
            sql,
            workspaceDir,
          });

          return jsonResult({
            success: true,
            action: "calculate",
            data: result,
          });
        }

        throw new Error(`Unknown action: ${action}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return jsonResult({
          success: false,
          error: message,
        });
      }
    },
  };
}
