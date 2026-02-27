# Strategic Research Crew Skill

## 触发条件（When to Trigger）
当输入满足任一条件时启用本 skill：

1. 用户明确输入以下命令形式：
   - `战略研究: <cadence> <phase> <text>`
   - `战略: <cadence> <phase> <text>`
   - `strategy: <cadence> <phase> <text>`
2. 用户目标是：
   - 基于信号做结构化战略判断
   - 产出 Base/Alt 情景、不确定性与监控信号
   - 需要 cadence（daily/weekly/monthly）节奏化输出

默认参数：
- cadence = `weekly`
- phase = `phase4`

---

## 执行流程（Execution Flow）
按以下步骤执行，不跳步：

1. **解析输入**
   - 提取 `cadence`、`phase`、`signal text`
   - 对混杂文本进行清洗和去重

2. **Orchestrator 运行**
   - Signal Intake → Lens Selection → Parallel Analysis → Dialectic → Synthesis → Editorial
   - 所有中间输出遵循结构化 schema

3. **Memory 落盘（MVP）**
   - 更新 `MEMORY.md`
   - 写入 `memory/projects.md`
   - 写入 `memory/infra.md`
   - 写入 `memory/lessons.md`
   - 写入 `memory/YYYY-MM-DD.md`

4. **风格应用（Persona）**
   - 从 workspace 读取 `SOUL.md` / `IDENTITY.md` / `USER.md`
   - 根据规则调整语气、摘要长度、是否输出观点段

5. **返回结果**
   - TG 短消息：给出结论摘要
   - 报告：结构化完整内容（可发布至 GitHub）

---

## 输出规范（Output Spec）
结果必须包含以下核心块（按 phase 裁剪）：

1. **结论摘要（TL;DR）**
   - 3–7 条要点
2. **Base Case**
3. **Alternative Case**
4. **Confidence（0–1）**
5. **Key Uncertainties**
6. **Monitoring Signals（Watchlist）**
7. **Narrative Summary**

若触发 “Insufficient Signal” 分支，则必须输出：
- `type=insufficient_signal`
- `confidence`
- `reason`
- `key_uncertainties`
- `monitoring_signals`

格式要求：
- 优先列表与小标题
- 结论必须可追溯到信号与假设
- 不允许仅给观点不给验证路径
