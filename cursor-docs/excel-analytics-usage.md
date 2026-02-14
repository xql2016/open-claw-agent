# Excel Analytics Tool - 使用文档

## 概述

Excel Analytics Tool 提供了高效的 Excel 文件分析能力，采用**采样策略**最小化 Token 消耗：

- **采样分析**：只读取前 N 行（默认 1000 行）用于理解数据结构
- **全量计算**：使用 SQL 在完整数据集上执行计算
- **文档生成**：生成 Markdown 或 Word 格式的分析报告

## 工具列表

### 1. `excel_analytics`

Excel 文件分析工具，支持三种操作：

#### 操作：info

获取 Excel 文件元信息（不读取数据）

```json
{
  "action": "info",
  "filepath": "sales_data.xlsx"
}
```

返回：

```json
{
  "totalRows": 500000,
  "columns": ["日期", "金额", "地区", "产品"],
  "sheetNames": ["Sheet1"],
  "fileSize": 45678912
}
```

#### 操作：sample

采样读取前 N 行数据

```json
{
  "action": "sample",
  "filepath": "sales_data.xlsx",
  "rows": 1000,
  "method": "head"
}
```

返回：

```json
{
  "totalRows": 500000,
  "sampleRows": 1000,
  "columns": ["日期", "金额", "地区", "产品"],
  "columnTypes": {
    "日期": "date",
    "金额": "number",
    "地区": "string",
    "产品": "string"
  },
  "preview": [
    /* 前5行数据 */
  ],
  "statistics": {
    "金额": {
      "count": 1000,
      "min": 100,
      "max": 50000,
      "mean": 5432.1
    }
  }
}
```

#### 操作：calculate

使用 SQL 在全量数据上执行计算

```json
{
  "action": "calculate",
  "filepath": "sales_data.xlsx",
  "sql": "SELECT 地区, SUM(金额) as 总额 FROM ? GROUP BY 地区 ORDER BY 总额 DESC"
}
```

返回：

```json
{
  "metrics": [
    { "地区": "华东", "总额": 12345678 },
    { "地区": "华南", "总额": 9876543 }
  ],
  "rowsProcessed": 500000,
  "executionTime": 1234
}
```

### 2. `generate_document`

文档生成工具，支持 Markdown 和 Word 格式

```json
{
  "format": "word",
  "filename": "sales_report_2024.docx",
  "title": "2024年销售分析报告",
  "content": "本报告分析了2024年全年的销售数据...",
  "tables": [
    {
      "title": "各地区销售统计",
      "headers": ["地区", "销售额", "订单数"],
      "rows": [
        ["华东", "¥12,345,678", "15,234"],
        ["华南", "¥9,876,543", "12,456"]
      ]
    }
  ]
}
```

返回：

```json
{
  "success": true,
  "filepath": "/path/to/workspace/reports/sales_report_2024.docx",
  "size": 45678,
  "format": "word"
}
```

## 使用流程

### 典型场景：分析 50 万行销售数据

```
1. 用户上传 Excel 文件
   ↓
2. [Tool] excel_analytics { action: "info" }
   → 了解文件有 50万行，包含哪些列
   ↓
3. [Tool] excel_analytics { action: "sample", rows: 1000 }
   → 读取前1000行，了解数据类型和分布
   ↓
4. Agent 与用户确认计算方式
   "数据包含日期、金额、地区、产品四列，
    要计算各地区的月度销售额，对吗？"
   ↓
5. [Tool] excel_analytics {
     action: "calculate",
     sql: "SELECT 地区, strftime('%Y-%m', 日期) as 月份,
           SUM(金额) as 月销售额 FROM ?
           GROUP BY 地区, 月份"
   }
   → 在全量50万行上执行计算，返回聚合结果
   ↓
6. [Tool] generate_document {
     format: "word",
     title: "销售分析报告",
     tables: [ /* 计算结果 */ ]
   }
   → 生成 Word 报告
```

## Token 消耗优化

### 对比：全量读取 vs 采样策略

| 方案        | 读取行数 | Token 消耗 | 成本（Sonnet） |
| ----------- | -------- | ---------- | -------------- |
| ❌ 全量读取 | 500,000  | ~100K      | $0.30          |
| ✅ 采样策略 | 1,000    | ~6K        | $0.02          |

**节省 94% Token！**

### 为什么采样足够？

1. **理解数据结构**：1000 行足以了解列名、数据类型、数值范围
2. **全量计算**：指标计算在本地完成，不经过 LLM
3. **只传结果**：只把聚合后的结果发给 LLM（通常只有几十行）

## SQL 查询示例

### 基础聚合

```sql
-- 各地区总销售额
SELECT 地区, SUM(金额) as 总额, COUNT(*) as 订单数
FROM ?
GROUP BY 地区
ORDER BY 总额 DESC
```

### 时间维度分析

```sql
-- 月度销售趋势
SELECT
  strftime('%Y-%m', 日期) as 月份,
  SUM(金额) as 月销售额,
  AVG(金额) as 平均订单额
FROM ?
GROUP BY 月份
ORDER BY 月份
```

### 多维度分析

```sql
-- 地区 × 产品 销售矩阵
SELECT
  地区,
  产品,
  SUM(金额) as 销售额,
  COUNT(*) as 销量
FROM ?
GROUP BY 地区, 产品
ORDER BY 销售额 DESC
```

### Top N 查询

```sql
-- Top 10 畅销产品
SELECT 产品, SUM(金额) as 总额
FROM ?
GROUP BY 产品
ORDER BY 总额 DESC
LIMIT 10
```

## 配置

在 `openclaw.json` 中配置：

```json5
{
  agents: {
    defaults: {
      tools: {
        excel: {
          enabled: true,
          sampling: {
            defaultRows: 1000, // 默认采样行数
            maxRows: 5000, // 最大采样行数
          },
          calculation: {
            timeout: 300, // 计算超时（秒）
            chunkSize: 10000, // 分块处理大小
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

## 注意事项

### 性能考虑

- **大文件**：50万行以下流畅运行
- **超大文件**：百万级以上建议先在外部工具预处理
- **内存**：全量计算时数据加载到内存，注意内存限制

### SQL 语法

- 使用 **AlaSQL** 语法（类似标准 SQL）
- 表名用 `?` 表示（代表 Excel 数据）
- 支持大部分标准 SQL 函数

### 文档格式

- **Markdown**：适合纯文本报告，文件小，易于版本控制
- **Word**：适合正式报告，支持更丰富的格式

## 故障排查

### 问题：文件找不到

```
Error: Excel file not found: sales_data.xlsx
```

**解决**：使用相对于工作区的路径，或绝对路径

### 问题：列名不匹配

```
Error: Column "金额" not found
```

**解决**：先用 `sample` 查看实际列名（可能有空格或特殊字符）

### 问题：SQL 语法错误

```
Error: Syntax error in SQL query
```

**解决**：检查 SQL 语法，表名用 `?`，字符串用单引号

## 更多示例

查看 `src/agents/tools/excel-analytics-tool.test.ts` 获取完整的测试用例。
