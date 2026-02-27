# Strategic Research Skill (OpenClaw-style package)

这是 Strategic Research Crew 的外置 skill 定义，遵循 OpenClaw 模版：

- `SKILL.md`：触发条件 / 执行流程 / 输出规范
- `execute.sh`：可选 CLI 执行入口（本仓库提供）

## Quick Start

```bash
bash skills/strategic-research/execute.sh \
  --text "AI芯片出口限制影响全球供应链" \
  --cadence weekly \
  --phase phase4
```

> 说明：`execute.sh` 会调用仓库内 Strategic orchestrator 生成结果 JSON。
