# 发版文档工具（最终形态：单个 skill 包）

## 交付物

- `release-flow/` — **自包含 skill 包**（唯一真源）：
  - SKILL.md 全流程说明书：一坨需求 → 拷问 → 五件套 + 功能点卡片 → 发版说明（用处+操作+截图）
  - question-bank.md 拷问问题库、templates/ 全套模板、scripts/screenshot-runner.js 截图引擎
  - 支持「一步到位」全自动模式
- `release-flow.zip` — 打包件，**扔给任何 agent 即用**（见包内 README 的安装说明）
- `.dsh/skills/release-flow/` — 本会话注册副本（说「发版文档」或「release-flow」触发）
- `_legacy/` — 归档的旧物（Web 界面 app/、启动 bat、旧四 skill、config 等），不再维护，随时可删

## 怎么扔给别的 agent

1. 解压 release-flow.zip 到对方的 skills 目录（DSH: .dsh/skills/；Claude: ~/.claude/skills/；Cursor: .cursor/skills/）
2. 或直接把整个文件夹丢给它，说：「读 release-flow/SKILL.md，按一步到位执行」

## 一步到位的输入

需求文本（或功能点）+ 目标项目目录 +（截图时）站点地址与登录账号。其余全自动，结束后审假设清单和失败项即可。

---

## 许可证

[MIT](LICENSE) © 2026 old884888