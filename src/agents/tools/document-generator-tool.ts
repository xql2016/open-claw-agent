import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import { jsonResult, readStringParam, type AnyAgentTool } from "./common.js";

/**
 * Document Generator Tool
 *
 * Generate Markdown and Word documents from structured data.
 */

type DocumentConfig = {
  outputDir?: string;
};

/**
 * Generate Markdown document
 */
async function generateMarkdown(params: {
  title: string;
  content: string;
  tables?: Array<{
    title: string;
    headers: string[];
    rows: string[][];
  }>;
  outputPath: string;
}): Promise<{ filepath: string; size: number }> {
  const { title, content, tables = [], outputPath } = params;

  let markdown = `# ${title}\n\n`;
  markdown += `${content}\n\n`;

  // Add tables
  for (const table of tables) {
    markdown += `## ${table.title}\n\n`;

    // Table headers
    markdown += `| ${table.headers.join(" | ")} |\n`;
    markdown += `| ${table.headers.map(() => "---").join(" | ")} |\n`;

    // Table rows
    for (const row of table.rows) {
      markdown += `| ${row.join(" | ")} |\n`;
    }
    markdown += "\n";
  }

  // Add timestamp
  markdown += `\n---\n\n*Generated: ${new Date().toISOString()}*\n`;

  // Write file
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown, "utf-8");

  const stats = await fs.stat(outputPath);

  return {
    filepath: outputPath,
    size: stats.size,
  };
}

/**
 * Generate Word document
 */
async function generateWord(params: {
  title: string;
  content: string;
  tables?: Array<{
    title: string;
    headers: string[];
    rows: string[][];
  }>;
  outputPath: string;
}): Promise<{ filepath: string; size: number }> {
  const { title, content, tables = [], outputPath } = params;

  // Lazy load docx library
  const { Document, Paragraph, Table, TableRow, TableCell, AlignmentType } = await import("docx");

  const children: unknown[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: "Heading1",
      alignment: AlignmentType.CENTER,
    }),
  );

  // Content (split by paragraphs)
  const paragraphs = content.split("\n\n");
  for (const para of paragraphs) {
    if (para.trim()) {
      children.push(
        new Paragraph({
          text: para.trim(),
          spacing: { after: 200 },
        }),
      );
    }
  }

  // Tables
  for (const tableData of tables) {
    // Table title
    children.push(
      new Paragraph({
        text: tableData.title,
        heading: "Heading2",
        spacing: { before: 400, after: 200 },
      }),
    );

    // Table
    const tableRows = [
      // Header row
      new TableRow({
        children: tableData.headers.map(
          (header) =>
            new TableCell({
              children: [new Paragraph({ text: header, bold: true })],
            }),
        ),
      }),
      // Data rows
      ...tableData.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ text: cell })],
                }),
            ),
          }),
      ),
    ];

    children.push(
      new Table({
        rows: tableRows,
      }),
    );
  }

  // Footer with timestamp
  children.push(
    new Paragraph({
      text: `Generated: ${new Date().toLocaleString()}`,
      spacing: { before: 400 },
      alignment: AlignmentType.RIGHT,
    }),
  );

  // Create document
  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  });

  // Write file
  const { Packer } = await import("docx");
  const buffer = await Packer.toBuffer(doc);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, buffer);

  const stats = await fs.stat(outputPath);

  return {
    filepath: outputPath,
    size: stats.size,
  };
}

/**
 * Create document generator tool
 */
export function createDocumentGeneratorTool(options: {
  config?: DocumentConfig;
  workspaceDir: string;
}): AnyAgentTool {
  const { config, workspaceDir } = options;

  const defaultOutputDir = config?.outputDir ?? path.join(workspaceDir, "reports");

  return {
    name: "generate_document",
    description: `Generate Markdown or Word documents from structured data.
    
Supports:
- Markdown (.md) format
- Word (.docx) format
- Tables with headers and data rows
- Automatic timestamps

Output directory: ${defaultOutputDir}`,

    schema: Type.Object({
      format: Type.Union([Type.Literal("markdown"), Type.Literal("word")], {
        description: "Document format: 'markdown' or 'word'",
      }),
      filename: Type.String({
        description: "Output filename (without path, e.g., 'sales_report.md')",
      }),
      title: Type.String({
        description: "Document title",
      }),
      content: Type.String({
        description: "Main document content (paragraphs separated by double newlines)",
      }),
      tables: Type.Optional(
        Type.Array(
          Type.Object({
            title: Type.String({ description: "Table title" }),
            headers: Type.Array(Type.String(), { description: "Column headers" }),
            rows: Type.Array(Type.Array(Type.String()), { description: "Data rows" }),
          }),
          {
            description: "Tables to include in the document",
          },
        ),
      ),
    }),

    async execute(params): Promise<AgentToolResult<unknown>> {
      const format = readStringParam(params, "format", { required: true });
      const filename = readStringParam(params, "filename", { required: true });
      const title = readStringParam(params, "title", { required: true });
      const content = readStringParam(params, "content", { required: true });

      // Parse tables if provided
      const tablesRaw = params.tables;
      const tables = Array.isArray(tablesRaw)
        ? tablesRaw.map((t: unknown) => {
            const table = t as Record<string, unknown>;
            const titleValue = table.title;
            return {
              title: typeof titleValue === "string" ? titleValue : String(titleValue ?? "Table"),
              headers: Array.isArray(table.headers) ? table.headers.map(String) : [],
              rows: Array.isArray(table.rows)
                ? table.rows.map((row: unknown) => (Array.isArray(row) ? row.map(String) : []))
                : [],
            };
          })
        : [];

      const outputPath = path.resolve(defaultOutputDir, filename);

      try {
        let result: { filepath: string; size: number };

        if (format === "markdown") {
          result = await generateMarkdown({
            title,
            content,
            tables,
            outputPath,
          });
        } else if (format === "word") {
          result = await generateWord({
            title,
            content,
            tables,
            outputPath,
          });
        } else {
          throw new Error(`Unsupported format: ${format}`);
        }

        return jsonResult({
          success: true,
          message: `Document generated successfully`,
          filepath: result.filepath,
          size: result.size,
          format,
        });
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
