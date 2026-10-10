# scripts/

截图引擎已实现于 `app/screenshot-runner.js`（单一真源，Web 应用与 skill 共用）。

## 接口

```
node app/screenshot-runner.js --config 任务.json --report 报告.json
```

- 任务 JSON 契约：见 `templates/screenshot-task.schema.json`
- 报告 JSON：`{ loginOk, loginError, results: [{ featureId, file, ok, error }] }`
- playwright 解析顺序：环境变量 PLAYWRIGHT_NODE_MODULES → Aworld node_modules → 目标项目 node_modules → 工具自身
- 浏览器：优先系统 msedge，其次 chrome（免下载驱动）
- 单任务失败不中断；失败原因写入报告
