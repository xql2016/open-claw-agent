# Excel Analytics Feature - TODO

## ✅ 已完成

- [x] 创建功能分支 `feature/excel-analytics`
- [x] 实现 `excel-analytics-tool.ts` 核心功能
- [x] 实现 `document-generator-tool.ts` 文档生成
- [x] 编写完整的使用文档
- [x] 创建测试框架
- [x] Git 提交并推送到 GitHub

## 📋 待完成任务

### 1. 安装依赖包 ⚠️ 重要

```bash
# 需要先安装 pnpm（如果没有）
npm install -g pnpm

# 然后安装项目依赖
cd /Users/xql/cursor/openclaw
pnpm install

# 安装 Excel 分析所需的依赖
pnpm add xlsx exceljs alasql mathjs docx

# 安装类型定义（可选）
pnpm add -D @types/node
```

### 2. 集成到工具链

编辑 `src/agents/pi-tools.ts`，在 `createOpenClawCodingTools` 函数中添加：

```typescript
import { createExcelAnalyticsTool, createDocumentGeneratorTool } from "./tools/excel-tools.js";

// 在工具数组中添加
const tools: AnyAgentTool[] = [
  ...codingTools,

  // Excel Analytics Tools
  createExcelAnalyticsTool({
    config: config?.tools?.excel,
    workspaceDir,
    sandboxPaths,
  }),
  createDocumentGeneratorTool({
    config: config?.tools?.document,
    workspaceDir,
  }),

  // ... 其他工具
];
```

### 3. 添加配置定义

编辑 `src/config/config.ts`，在配置 schema 中添加：

```typescript
export type OpenClawConfig = {
  // ... 其他配置

  tools?: {
    // ... 其他工具配置

    excel?: {
      enabled?: boolean;
      sampling?: {
        defaultRows?: number;
        maxRows?: number;
      };
      calculation?: {
        timeout?: number;
        chunkSize?: number;
      };
    };

    document?: {
      enabled?: boolean;
      outputDir?: string;
    };
  };
};
```

### 4. 创建示例配置文件

在 `docs/examples/` 创建 `excel-analytics-config.json5`:

```json5
{
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      model: {
        primary: "anthropic/claude-sonnet-4-5",
      },
      tools: {
        excel: {
          enabled: true,
          sampling: {
            defaultRows: 1000,
            maxRows: 5000,
          },
          calculation: {
            timeout: 300,
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

### 5. 编写集成测试

创建 `src/agents/tools/excel-analytics-tool.e2e.test.ts`:

- 使用真实 Excel 文件测试
- 测试 50 万行数据的性能
- 测试 Word/Markdown 生成
- 测试错误处理

### 6. 添加 Skill 提示

创建 `skills/excel-analysis/SKILL.md`:

```markdown
# Excel Analysis Skill

## When to use

- User uploads Excel files
- User mentions "数据分析", "指标计算", "Excel", "报告"

## Workflow

1. Use excel_analytics {action: "info"} first
2. Use excel_analytics {action: "sample"} to understand data
3. Confirm calculation logic with user
4. Use excel_analytics {action: "calculate"} for metrics
5. Use generate_document to create report

## Best practices

- Always sample before calculating
- Explain SQL queries to user
- Show preview before full report
```

### 7. 更新主 README

在项目根目录的 `README.md` 中添加 Excel Analytics 功能说明。

### 8. 性能测试

- 创建测试数据集（10万、50万、100万行）
- 测试内存使用
- 测试响应时间
- 优化性能瓶颈

### 9. 错误处理增强

- 添加更详细的错误信息
- 处理超大文件（>1GB）
- 处理损坏的 Excel 文件
- 添加进度回调

### 10. 文档完善

- [ ] 添加更多 SQL 查询示例
- [ ] 添加故障排查指南
- [ ] 录制使用演示视频
- [ ] 翻译文档为英文

## 🚀 快速开始指南（给用户）

### 安装和配置

```bash
# 1. 克隆项目
git clone https://github.com/xql2016/open-claw-agent.git
cd open-claw-agent

# 2. 切换到功能分支
git checkout feature/excel-analytics

# 3. 安装依赖
pnpm install

# 4. 配置模型（使用 Claude Sonnet）
openclaw onboard

# 5. 启动 gateway
openclaw gateway
```

### 使用示例

```bash
# 通过 CLI 分析 Excel
openclaw agent --message "帮我分析 sales_data.xlsx，计算各地区销售额" \
  --attach ~/Downloads/sales_data.xlsx

# 或者通过 Telegram/WhatsApp
# 直接发送 Excel 文件 + 说明文字
```

## 📊 预期效果

- **Token 节省**：90-95%（相比全量读取）
- **响应时间**：30-60秒（50万行数据）
- **成本**：单次分析 ¥0.15-0.35（使用 Sonnet）

## 🐛 已知问题

1. **pnpm 未安装**：需要先全局安装 pnpm
2. **依赖未安装**：完成任务 #1 后才能运行
3. **工具未注册**：完成任务 #2 后才能在对话中使用

## 📞 联系方式

有问题请提 Issue：https://github.com/xql2016/open-claw-agent/issues
