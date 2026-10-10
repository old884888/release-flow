---
name: release-flow
description: 发版文档全流程。一坨需求 → 拷问（内嵌 grill-me 问题库）→ 设计五件套 + 功能点卡片 → 发版说明（用处+操作+截图）。自包含：问题库、模板、截图脚本都在本 skill 目录。支持「一步到位」全自动。
---

# release-flow — 发版文档全流程 skill

## 一句话

把需求变成设计文档，再变成带截图的发版说明书。**一个 skill 走完全程**，可全自动。

## 最终产出（都落在目标项目仓库里）

```
{root}/docs/spec/            五件套：01-业务理解 / 02-功能清单 / 03-拷问记录 / 04-设计文档 / 05-假设清单
{root}/.release-docs/features.yaml   功能点卡片（两阶段的共享契约）
{root}/docs/releases/{date}/README.md + screenshots/   发版说明（含截图）
```

## 本 skill 目录（全部自包含，用相对路径引用）

- `question-bank.md` — 拷问问题库（十域，带默认值）
- `templates/features.yaml` — 功能点卡片契约
- `templates/release-note.md` — 发版模板（用处+操作）
- `templates/spec/` — 五件套骨架
- `templates/screenshot-task.schema.json` — 截图任务契约
- `scripts/screenshot-runner.js` — 截图引擎（单文件，自动解析 playwright）

## 输入（一次问清，缺什么问什么）

| 项 | 必填 | 说明 |
|------|------|------|
| 需求文本 | 是 | 粘贴或给文件路径 |
| 目标项目根目录 | 推荐 | 设计要对齐真实代码 |
| 站点地址 + 登录账号 | 截图时 | 如 http://localhost:5174 + 手机号/密码 |
| 模式 | 否 | 「一步到位」全自动（默认）/「每阶段确认」 |
| 功能点 | 与需求二选一 | 跳过需求转译，直接写发版说明（可给 git 范围代猜） |

## 流程

### 阶段一 · 需求转译（含拷问，即 grill-me）

1. **通读**：抽功能点清单（标题+一句话）+ 词汇表 → 01-业务理解
2. **拷问**：按 question-bank.md 分域出问题清单，每条带推荐默认值；每批 ≤12 问，超了按域优先级裁剪：权限 > 状态机 > 数据 > 异常 > 其他。用环境的提问机制（ask_user_question 或普通提问）。**一步到位模式：全部按默认**，逐条进假设清单
3. **设计**：04-设计文档（路由/菜单、数据模型、接口、状态机、权限矩阵、边界与异常），必须引用拷问结果
4. **产出**：五件套 → docs/spec/；卡片 → .release-docs/features.yaml。卡片字段来源：acceptance ← 拷问「验收标准」域；role ← 「角色与权限」域；entry/steps ← 代码定位；screenshot_targets ← 功能入口 + 边界异常

### 阶段二 · 发版说明（消费卡片）

1. **功能点确认**：一步到位模式自动全选；人工模式让用户勾选（git 候选要标注低价值项）
2. **用处+操作**：卡片有 entry/steps 直接采用；没有就 grep 路由/菜单/文案定位。**找不到就标「需人工补充」，绝不编造**
3. **截图**：screenshot_targets 转任务 JSON（见 templates/screenshot-task.schema.json），执行：
   `node {skill目录}/scripts/screenshot-runner.js --config 任务.json --report 报告.json`
   站点不在线先拉起 dev 等就绪。输出 screenshots/01-{id}.png
4. **合成**：套 templates/release-note.md；截图失败项标「截图失败：原因」，单独列在文末
5. **回写卡片**：status: released、released_in: 日期

## 一步到位模式（默认）

用户没特别说 → 全自动：拷问全按默认、清单全选、一次跑完。全程只有两道人工闸门：开始前确认输入；结束后报告假设清单 + 失败项。任何一步失败不中断整体，单独列出。

## 规则（不可违反）

1. 操作路径以当前仓库代码/卡片为准，不许凭训练数据编
2. 拷问不替用户编事实性答案，默认值全部显式进假设清单
3. 截图失败 ≠ 成功；缺图必须在文档标明
4. git 原文不是发版稿
5. 单条功能失败不阻塞其余
6. 选择器优先可见文案、data-testid

## 模型建议（不强求，跟随所在环境）

- 拷问/设计文档：最强推理档，temperature 0.2
- 用处+操作写作：temperature 0.3
- git 归纳：便宜模型，temperature 0.1
