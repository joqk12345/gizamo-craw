import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { Skill } from "./skill.js";
import { StrategicResearchOrchestrator } from "../strategic/orchestrator.js";
import { CadenceMode, ExecutionPhase, OrchestrationResult } from "../strategic/types.js";
import { hasRule, loadPersonaProfile, PersonaProfile } from "../services/persona-profile.js";
import { StrategicMemoryJournal } from "../strategic/memory-journal.js";

export class StrategicResearchSkill implements Skill {
  readonly kind = "strategic_research" as const;

  constructor(
    private readonly persona: PersonaProfile = loadPersonaProfile(),
    private readonly memoryJournal: StrategicMemoryJournal = new StrategicMemoryJournal()
  ) {}

  async run(task: ParsedTask, ctx: TaskContext): Promise<SkillResult> {
    const text = String(task.payload.text || "").trim();
    if (!text) {
      throw new Error("战略研究任务缺少文本输入。示例：战略研究: weekly phase4 AI芯片出口限制影响");
    }

    const cadence = this.parseCadence(task.payload.cadence);
    const phase = this.parsePhase(task.payload.phase);
    const sourceType = String(task.payload.sourceType || "telegram");

    const orchestrator = new StrategicResearchOrchestrator({
      cadence,
      phase,
      insufficientSignalThreshold: 0.4
    });

    const result = await orchestrator.run({ text, sourceType });
    this.memoryJournal.persist({
      requestId: ctx.requestId,
      cadence,
      phase,
      result,
      snapshot: orchestrator.getMemorySnapshot()
    });

    const speaker = `${this.persona.assistantSymbol} ${this.persona.assistantName}`;
    const confidence = result.synthesis?.confidence ?? result.insufficientBrief?.confidence ?? 0;
    const summaryLine = this.renderSummaryLine(
      result.synthesis?.base_case || "信号不足，建议继续监控",
      result.synthesis?.alternative_case || "等待反证或独立来源确认",
      confidence
    );

    return {
      title: "战略研究完整报告",
      shortSummary: `${speaker}｜${summaryLine}`.slice(0, 320),
      reportSection: this.buildStructuredReport(result, {
        speaker,
        cadence,
        phase,
        sourceType,
        requestId: ctx.requestId
      })
    };
  }

  private buildStructuredReport(
    result: OrchestrationResult,
    meta: {
      speaker: string;
      cadence: CadenceMode;
      phase: ExecutionPhase;
      sourceType: string;
      requestId: string;
    }
  ): string {
    const synthesis = result.synthesis;
    const insufficient = result.insufficientBrief;
    const confidence = synthesis?.confidence ?? insufficient?.confidence ?? 0;

    const tldr = synthesis
      ? [
          `主题 ${result.signal.theme} 当前基准情景成立概率更高。`,
          `主结论：${synthesis.base_case}`,
          `替代路径：${synthesis.alternative_case}`,
          `置信度 ${confidence}（已吸收 dialectic 调整）。`,
          `仍有未决张力：${this.applySoulStyle(synthesis.narrative_summary)}`
        ]
      : [
          `触发了 Insufficient Signal 分支。`,
          `原因：${insufficient?.reason || "聚合置信度不足"}`,
          `置信度 ${confidence}，暂不建议做强结论。`
        ];

    const assumptions = result.lensAnalyses.flatMap((l) => l.assumptions).slice(0, 6);
    const reasoning = result.lensAnalyses
      .map((l) => `- ${l.lens_name}: conf=${l.confidence} | thesis=${l.core_thesis}`)
      .join("\n");
    const critiques = result.critiques.length
      ? result.critiques
          .map((c) => `- ${c.lens_name} -> ${c.target_lens} | adj=${c.confidence_adjustment} | ${c.critique}`)
          .join("\n")
      : "- 无（phase1）";

    const watchlist = synthesis?.monitoring_signals ?? insufficient?.monitoring_signals ?? [];
    const uncertainties = synthesis?.key_uncertainties ?? insufficient?.key_uncertainties ?? [];
    const nextActions = this.buildNextActions(confidence, watchlist);
    const opinion = this.buildOpinion(confidence);

    return [
      `## 战略研究完整报告`,
      ``,
      `- request_id: ${meta.requestId}`,
      `- speaker: ${meta.speaker}`,
      `- user: ${this.persona.userAlias}`,
      `- workspace: ${this.persona.workspaceDir}`,
      `- cadence/phase: ${meta.cadence}/${meta.phase}`,
      `- source_type: ${meta.sourceType}`,
      `- signal_id: ${result.signal.signal_id}`,
      `- theme: ${result.signal.theme}`,
      `- confidence: ${confidence}`,
      ``,
      `### 1) 结论摘要（TL;DR）`,
      ...tldr.map((x) => `- ${x}`),
      ``,
      `### 2) 关键假设`,
      ...(assumptions.length ? assumptions.map((x) => `- ${x}`) : ["- 当前阶段无可用假设输出"]),
      ``,
      `### 3) 证据与推理`,
      `#### Signal`,
      `- summary: ${result.signal.summary}`,
      `- relevance/intensity: ${result.signal.relevance_score}/${result.signal.intensity_score}`,
      `- selected_lenses: ${result.selectedLenses.selected_lenses.join(", ")}`,
      ``,
      `#### Lens Outputs`,
      reasoning || "- 无",
      ``,
      `#### Dialectic`,
      critiques,
      ``,
      `### 4) 情景（Base / Alt）`,
      `- Base: ${synthesis?.base_case || "Insufficient Signal: 暂不建立稳定基准情景"}`,
      `- Alt: ${synthesis?.alternative_case || "Insufficient Signal: 等待外部确认后重建替代情景"}`,
      ``,
      `### 5) 监控信号（Watchlist）`,
      ...(watchlist.length ? watchlist.map((x) => `- ${x}`) : ["- 暂无"]),
      ``,
      `### 6) 行动建议（Next Actions）`,
      ...nextActions.map((x) => `- ${x}`),
      ``,
      `### Key Uncertainties`,
      ...(uncertainties.length ? uncertainties.map((x) => `- ${x}`) : ["- 暂无"]),
      ``,
      `### Narrative Summary`,
      this.applySoulStyle(synthesis?.narrative_summary || "证据不足，维持观察并补充独立信号源。"),
      ``,
      opinion ? `### 观点\n${opinion}\n` : "",
      `### Persona Source`,
      `- SOUL.md loaded: ${this.persona.soul ? "yes" : "no"}`,
      `- IDENTITY.md loaded: ${this.persona.identity ? "yes" : "no"}`,
      `- USER.md loaded: ${this.persona.user ? "yes" : "no"}`,
      ``,
      `### Machine Trace (for GitHub audit)`,
      "```json",
      JSON.stringify(
        {
          signal: result.signal,
          selected_lenses: result.selectedLenses,
          lens_count: result.lensAnalyses.length,
          critique_count: result.critiques.length,
          trace: result.trace
        },
        null,
        2
      ),
      "```",
      ``
    ].join("\n");
  }

  private buildNextActions(confidence: number, watchlist: string[]): string[] {
    if (confidence >= 0.65) {
      return [
        "进入执行态：按 Base 情景推进资源配置，并设置触发式风控阈值。",
        "每周复盘 watchlist，若出现反证信号即切换到 Alt 方案。",
        ...(watchlist.slice(0, 2).map((w) => `为监控项“${w}”定义负责人和更新频率。`) || [])
      ];
    }
    if (confidence >= 0.4) {
      return [
        "保持试点规模，先做验证而非全面下注。",
        "补齐两类独立信号源（政策+市场/业务）以降低噪声。",
        "将关键决策推迟到下一轮 cadence 复核后。"
      ];
    }
    return [
      "当前仅做监控，不做重决策承诺。",
      "优先补充高质量信号源并去重。",
      "当聚合置信度连续两轮 >=0.4 再进入情景执行。"
    ];
  }

  private renderSummaryLine(base: string, alt: string, confidence: number): string {
    const concise = hasRule(this.persona.soul, "简洁优先") || hasRule(this.persona.soul, "concise");
    if (concise) {
      return `Base=${base.slice(0, 40)}；Alt=${alt.slice(0, 32)}；Conf=${confidence}`;
    }
    return `Base: ${base} | Alt: ${alt} | Conf: ${confidence}`;
  }

  private applySoulStyle(narrative: string): string {
    const direct = hasRule(this.persona.soul, "直接切入主题") || hasRule(this.persona.soul, "direct");
    const concise = hasRule(this.persona.soul, "简洁优先") || hasRule(this.persona.soul, "concise");
    let output = narrative;
    if (!direct) {
      output = `${this.persona.userAlias}，${output}`;
    }
    if (concise && output.length > 180) {
      output = `${output.slice(0, 180)}...`;
    }
    return output;
  }

  private buildOpinion(confidence: number): string {
    const allowsOpinion = hasRule(this.persona.soul, "允许表达观点") || hasRule(this.persona.soul, "观点");
    if (!allowsOpinion) return "";
    if (confidence >= 0.65) return "当前信号质量可支撑主动布局，但要给政策扰动留出缓冲。";
    if (confidence >= 0.4) return "信号可用但不稳，建议以监控触发为主，避免一次性重仓判断。";
    return "现阶段更适合继续观察，不建议用单一信号驱动重大策略动作。";
  }

  private parseCadence(input: unknown): CadenceMode {
    const raw = String(input || "weekly").toLowerCase();
    if (raw === "daily" || raw === "weekly" || raw === "monthly") return raw;
    return "weekly";
  }

  private parsePhase(input: unknown): ExecutionPhase {
    const raw = String(input || "phase4").toLowerCase();
    if (raw === "phase1" || raw === "phase2" || raw === "phase3" || raw === "phase4") return raw;
    return "phase4";
  }
}
