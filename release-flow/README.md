# release-flow — 发版文档全流程 skill 包

自包含：拷问问题库、模板、截图引擎都在本目录。**把它交给任何支持读文件的 agent 即可一步到位。**

## 安装（任选其一）

- **DSH**：整个文件夹拷到 `{项目}/.dsh/skills/release-flow/`（或 `~/.dsh/skills/`），说「发版文档」即触发
- **Claude Code**：拷到 `~/.claude/skills/release-flow/`
- **Cursor / 其他**：拷到 `.cursor/skills/`，或直接把本文件夹路径丢给它说「读 SKILL.md 按流程走」
- **任意 agent**：把整个文件夹给它 + 一句话：「读 release-flow/SKILL.md，按一步到位模式执行」

## 用法

1. 给需求文本（或功能点）+ 目标项目目录
2. 截图需要：站点地址 + 登录账号
3. 说「一步到位」= 全自动；说「每阶段确认」= 人工把关

## 目录

| 文件 | 作用 |
|------|------|
| SKILL.md | 全流程说明书（唯一入口） |
| question-bank.md | 拷问问题库（十域 + 默认值） |
| templates/ | 卡片契约 / 发版模板 / 五件套骨架 / 截图任务 schema |
| scripts/screenshot-runner.js | 截图引擎（单文件，免安装 playwright，复用项目里的） |

## 依赖

- 截图：目标项目 node_modules 里有 playwright 即可（没有就 `npm i playwright` 到本目录，或设 PLAYWRIGHT_NODE_MODULES）
- AI：跟随所在 agent 的模型，无额外配置
