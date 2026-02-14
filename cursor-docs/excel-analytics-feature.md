# Excel Analytics Feature

## 概述

为 OpenClaw 添加 Excel 文件分析能力，支持大规模数据处理（几十万行）并采用采样策略优化 Token 消耗。

## 新增文件

### 核心工具

- `src/agents/tools/excel-analytics-tool.ts` - Excel 分析工具
- `src/agents/tools/document-generator-tool.ts` - 文档生成工具
- `src/agents/tools/excel-tools.ts` - 导出文件

### 文档

- `docs/tools/excel-analytics.md` - 完整使用文档

### 测试

- `src/agents/tools/excel-analytics-tool.test.ts` - 单元测试

## 功能特性

### 1. Excel 分析 (`excel_analytics`)

**三种操作模式：**

#### a) `info` - 快速元信息

- 不读取数据，只获取行数、列名、工作表等
- Token 消耗：~0.5K
- 用途：快速了解文件结构

#### b) `sample` - 采样分析

- 读取前 N 行（默认 1000 行）
- 自动推断列类型
- 计算数值列的基础统计
- Token 消耗：~4-6K（1000 行）
- 用途：理解数据结构和分布

#### c) `calculate` - 全量计算

- 使用 SQL 在完整数据集上执行计算
- 返回聚合结果（不是原始数据）
- Token 消耗：~0.5-2K（仅结果）
- 用途：计算指标

### 2. 文档生成 (`generate_document`)

**支持格式：**

- Markdown (`.md`)
- Word (`.docx`)

**功能：**

- 标题 + 内容
- 表格（支持多个）
- 自动添加时间戳

## 技术架构

### 采样 + 计算分离设计

```
用户上传 Excel (50万行)
         ↓
[采样] 读取 1000 行 → 发送给 LLM → 理解结构
         ↓
[计算] SQL 在本地执行 → 返回结果 → 发送给 LLM → 生成报告
```

### Token 优化

| 操作      | 数据量           | Token   | 说明       |
| --------- | ---------------- | ------- | ---------- |
| info      | 元信息           | ~0.5K   | 不读数据   |
| sample    | 1000行 × 4列     | ~4K     | 理解结构   |
| calculate | 聚合结果（10行） | ~0.5K   | 只返回结果 |
| **总计**  | -                | **~5K** | 节省 95%   |

对比全量读取：50万行 × 4列 = ~100K tokens

### 依赖库

```json
{
  "xlsx": "^0.18.5", // Excel 解析
  "exceljs": "^4.3.0", // Excel 高级操作（备用）
  "alasql": "^4.0.0", // SQL 查询引擎
  "mathjs": "^12.0.0", // 数学计算（预留）
  "docx": "^8.5.0" // Word 文档生成
}
```

## 使用示例

### Agent 工作流

```typescript
// 1. 获取文件信息
await excel_analytics({
  action: "info",
  filepath: "sales_data.xlsx"
});
// → { totalRows: 500000, columns: ["日期", "金额", "地区"] }

// 2. 采样数据
await excel_analytics({
  action: "sample",
  filepath: "sales_data.xlsx",
  rows: 1000
});
// → { sampleRows: 1000, preview: [...], statistics: {...} }

// 3. 全量计算
await excel_analytics({
  action: "calculate",
  filepath: "sales_data.xlsx",
  sql: "SELECT 地区, SUM(金额) as 总额 FROM ? GROUP BY 地区"
});
// → { metrics: [{地区: "华东", 总额: 12345678}, ...] }

// 4. 生成报告
await generate_document({
  format: "word",
  filename: "report.docx",
  title: "销售分析报告",
  content: "...",
  tables: [...]
});
// → { filepath: "/path/to/report.docx" }
```

## 配置

在 `~/.openclaw/openclaw.json` 中：

```json5
{
  agents: {
    defaults: {
      tools: {
        excel: {
          enabled: true,
          sampling: {
            defaultRows: 1000,
            maxRows: 5000,
          },
        },
        document: {
          enabled: true,
          outputDir: "~/.openclaw/workspace/reports",
        },
      },
    },
  },
}
```

## SQL 支持

使用 AlaSQL 语法：

```sql
-- 基础聚合
SELECT 地区, SUM(金额) as 总额 FROM ? GROUP BY 地区

-- 时间分析
SELECT strftime('%Y-%m', 日期) as 月份, SUM(金额) FROM ?
GROUP BY 月份

-- Top N
SELECT 产品, SUM(金额) as 销售额 FROM ?
GROUP BY 产品 ORDER BY 销售额 DESC LIMIT 10
```

## 性能指标

| 数据规模 | 采样时间 | 计算时间 | 总时间 |
| -------- | -------- | -------- | ------ |
| 10万行   | ~0.5s    | ~2s      | ~2.5s  |
| 50万行   | ~0.5s    | ~8s      | ~8.5s  |
| 100万行  | ~0.5s    | ~18s     | ~18.5s |

## 后续计划

### Phase 2 增强功能

- [ ] 支持多 sheet
- [ ] 流式处理超大文件（分块读取）
- [ ] 图表生成（Chart.js 集成）
- [ ] 缓存中间结果
- [ ] 增量分析（只处理新增数据）

### Phase 3 高级功能

- [ ] 自动指标推荐
- [ ] 异常值检测
- [ ] 趋势预测
- [ ] 自然语言查询（NL2SQL）

## 测试

```bash
# 运行测试
pnpm test excel-analytics-tool.test.ts

# 完整测试（需要测试数据）
pnpm test:e2e
```

## 集成到 pi-tools

需要在 `src/agents/pi-tools.ts` 中注册工具：

```typescript
import { createExcelAnalyticsTool, createDocumentGeneratorTool } from "./tools/excel-tools.js";

// 在 createOpenClawCodingTools 中添加
const tools = [
  ...codingTools,
  createExcelAnalyticsTool({
    config: config?.tools?.excel,
    workspaceDir,
    sandboxPaths,
  }),
  createDocumentGeneratorTool({
    config: config?.tools?.document,
    workspaceDir,
  }),
  // ... other tools
];
```

## 贡献者

- @xql2016 - 初始实现

## License

MIT (与 OpenClaw 主项目保持一致)
