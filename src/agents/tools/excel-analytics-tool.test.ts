import { describe, expect, it } from "vitest";
import { createExcelAnalyticsTool } from "./excel-analytics-tool.js";
import { createDocumentGeneratorTool } from "./document-generator-tool.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("Excel Analytics Tool", () => {
  const workspaceDir = path.join(os.tmpdir(), "openclaw-test-excel");
  
  it("should create excel analytics tool", () => {
    const tool = createExcelAnalyticsTool({
      workspaceDir,
    });
    
    expect(tool.name).toBe("excel_analytics");
    expect(tool.description).toContain("Analyze Excel files");
    expect(tool.execute).toBeDefined();
  });
  
  it("should have correct schema", () => {
    const tool = createExcelAnalyticsTool({
      workspaceDir,
    });
    
    expect(tool.schema).toBeDefined();
  });
  
  // Note: Full integration tests would require actual Excel files
  // These should be added once the dependencies are installed
});

describe("Document Generator Tool", () => {
  const workspaceDir = path.join(os.tmpdir(), "openclaw-test-docs");
  
  it("should create document generator tool", () => {
    const tool = createDocumentGeneratorTool({
      workspaceDir,
    });
    
    expect(tool.name).toBe("generate_document");
    expect(tool.description).toContain("Generate Markdown or Word");
    expect(tool.execute).toBeDefined();
  });
  
  it("should have correct schema", () => {
    const tool = createDocumentGeneratorTool({
      workspaceDir,
    });
    
    expect(tool.schema).toBeDefined();
  });
  
  // Integration tests for actual document generation
  // to be added after dependencies are installed
});
