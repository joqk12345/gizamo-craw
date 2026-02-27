## 2026-02-27T14:11:52.411Z | technology
- lessons:
  - uncertainty: Signal continuity uncertain
  - uncertainty: Cross-lens corroboration is weak
  - watch: Signal recurrence frequency
  - watch: Independent source confirmation
  - critique: MarketStructureLens→PolicyRiskLens: PolicyRiskLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: PolicyRiskLens→ExecutionLens: ExecutionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: ExecutionLens→AdoptionLens: AdoptionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。

## 2026-02-27 | agent-isolation
- lesson: 单 bot 混合命令会导致能力边界不清，应在代码层引入 `AGENT_ROLE` 做硬隔离。
- rule: 解析器应先按 role 判定，再进入任务识别，避免跨 agent 误触发。

## 2026-02-27 | tenant-runtime
- lesson: 用 `AGENT_TENANTS + <TENANT>_*` 比单一 `AGENT_ROLE` 更适合多 agent 托管。
- rule: 每个 tenant 必须独立 token/allowlist/report path，避免跨租户信息串扰。

## 2026-02-27T14:47:08.228Z | default
- lessons:
  - uncertainty: Signal continuity uncertain
  - uncertainty: Cross-lens corroboration is weak
  - watch: Signal recurrence frequency
  - watch: Independent source confirmation
  - critique: ExecutionLens→PolicyRiskLens: PolicyRiskLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: PolicyRiskLens→SecondOrderLens: SecondOrderLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: SecondOrderLens→ExecutionLens: ExecutionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。


## 2026-02-27T14:49:22.287Z | default
- lessons:
  - uncertainty: Signal continuity uncertain
  - uncertainty: Cross-lens corroboration is weak
  - watch: Signal recurrence frequency
  - watch: Independent source confirmation
  - critique: ExecutionLens→PolicyRiskLens: PolicyRiskLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: PolicyRiskLens→SecondOrderLens: SecondOrderLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: SecondOrderLens→AdoptionLens: AdoptionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。


## 2026-02-27T14:55:16.238Z | technology
- lessons:
  - uncertainty: 关键行为体是否同步响应。
  - uncertainty: 跨主题外溢是否超预期。
  - watch: 政策口径变化频次
  - watch: 资金流向与波动率共振
  - watch: 供应链与渠道库存拐点
  - critique: MarketStructureLens→PolicyRiskLens: PolicyRiskLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: PolicyRiskLens→ExecutionLens: ExecutionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。
  - critique: ExecutionLens→AdoptionLens: AdoptionLens 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。


## 2026-02-27T15:05:04.413Z | technology
- lessons:
  - uncertainty: Stub uncertainty
  - watch: Stub monitoring signal

