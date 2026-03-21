## 2026-02-27T14:11:52.410Z | request 1772201510139-x8zmpo
- theme: technology
- cadence/phase: weekly/phase4
- selected_lenses: MarketStructureLens, PolicyRiskLens, ExecutionLens, AdoptionLens, CapitalFlowLens
- status: publish
- summary: Aggregate lens confidence below threshold

## 2026-02-27 | news-editer
- status: active
- change: 拆分为 role-based agent runtime（news / strategic）
- isolation: bot token、allowlist、命令解析、帮助文案、报告路径均按角色隔离
- change: 升级为 tenant-based runtime，支持单进程并行运行多个 agent

## 2026-02-28 | news-editer
- status: active
- change: 信息处理新增 `rewrite_bilingual` 任务类型与 `RewriteBilingualSkill`
- routing: `重写/改写/rewrite/paraphrase` 指令前置解析并直达中英重写流程
- docs: README 与网关帮助文案同步新增“原文中英重写”示例
- change: 新增统一 runtime 记忆落盘；任务执行成功/失败自动写入 `memory/YYYY-MM-DD.md`
- observability: 记录 requestId、tenant/role、task kinds、result/error，便于回溯执行轨迹
- persona: 新增 `SOUL.news.md`，用于 News Agent 独立语气/风格配置
- runtime: news 运营链路已接入 persona 包装 LLM，`SOUL.news.md` 对 news 全部任务生效

## 2026-02-27T14:47:08.226Z | request 1772203624409-9ndzc8
- theme: default
- cadence/phase: daily/phase2
- selected_lenses: ExecutionLens, PolicyRiskLens, SecondOrderLens
- status: publish
- summary: Aggregate lens confidence below threshold


## 2026-02-27T14:49:22.285Z | request 1772203759082-zjo5zi
- theme: default
- cadence/phase: weekly/phase3
- selected_lenses: ExecutionLens, PolicyRiskLens, SecondOrderLens, AdoptionLens, ScenarioLens
- status: publish
- summary: Aggregate lens confidence below threshold


## 2026-02-27T14:55:16.236Z | request 1772204113619-stoxsx
- theme: technology
- cadence/phase: weekly/phase4
- selected_lenses: MarketStructureLens, PolicyRiskLens, ExecutionLens, AdoptionLens, CapitalFlowLens
- status: publish
- summary: 基准情景：信号驱动的 MarketStructureLens 叙事将在短周期内成为主线，趋势=flat。


## 2026-02-27T15:05:04.411Z | request 1772204700966-aqofno
- theme: technology
- cadence/phase: weekly/phase1
- selected_lenses: MarketStructureLens, PolicyRiskLens, ExecutionLens, AdoptionLens, CapitalFlowLens
- status: publish
- summary: Stub base case from MarketStructureLens

## 2026-03-21 | news-editer
- status: active
- change: `summarize_text` / `summarize_link` 改为 AI SDK 结构化输出链路，模型只产 JSON，Markdown 与 Mermaid 由代码渲染
- scope: 新增 schema、renderer、OpenRouter structured summary generator；保留 Gateway / TaskRunner / Telegram 主干不变
- validation: 已执行 `npm install` 与 `npm run build`

## 2026-03-22 | news-editer
- status: active
- change: summary 结构化链路新增双重回退；`provider returned error` 视为可切换模型错误，`json_schema` 不兼容时自动降级到普通 completion + 本地 JSON 校验
- fallback: 当配置全部为 `:free` 模型时，自动追加 `openrouter/free` 作为最终兜底路由
- validation: 本地构建通过；2026-03-22 的 live smoke test 已确认旧报错不再卡在首个模型，但 OpenRouter 免费路由当时响应较慢/不稳定
- observability: summary 报告头与 runtime 日志现在会记录实际命中的模型、是否触发 schema fallback、完整 attempted_models 链
