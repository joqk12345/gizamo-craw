import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { Skill } from "./skill.js";
import { StrategicResearchOrchestrator } from "../strategic/orchestrator.js";
import { CadenceMode, ExecutionPhase } from "../strategic/types.js";
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

    if (result.insufficientBrief) {
      const brief = result.insufficientBrief;
      return {
        title: "战略研究简报（信号不足）",
        shortSummary: `${speaker}｜信号不足（confidence=${brief.confidence}），继续观察。`.slice(0, 320),
        reportSection: [
          `## 战略研究简报（信号不足）`,
          ``,
          `- speaker: ${speaker}`,
          `- user: ${this.persona.userAlias}`,
          `- confidence: ${brief.confidence}`,
          `- reason: ${brief.reason}`,
          `- key_uncertainties: ${brief.key_uncertainties.join("；")}`,
          `- monitoring_signals: ${brief.monitoring_signals.join("；")}`,
          ``
        ].join("\n")
      };
    }

    const synthesis = result.synthesis;
    if (!synthesis) {
      return {
        title: "战略研究（阶段输出）",
        shortSummary: `${speaker}｜已完成至 ${phase}，镜头=${result.selectedLenses.selected_lenses.join(", ")}`.slice(
          0,
          320
        ),
        reportSection: [
          `## 战略研究（阶段输出）`,
          ``,
          `- speaker: ${speaker}`,
          `- user: ${this.persona.userAlias}`,
          `- cadence: ${cadence}`,
          `- phase: ${phase}`,
          `- theme: ${result.signal.theme}`,
          `- selected_lenses: ${result.selectedLenses.selected_lenses.join(", ")}`,
          ``
        ].join("\n")
      };
    }

    const opinion = this.buildOpinion(synthesis.confidence);
    const summaryLine = this.renderSummaryLine(synthesis.base_case, synthesis.alternative_case, synthesis.confidence);

    return {
      title: "战略研究简报",
      shortSummary: `${speaker}｜${summaryLine}`.slice(0, 320),
      reportSection: [
        `## 战略研究简报`,
        ``,
        `- speaker: ${speaker}`,
        `- user: ${this.persona.userAlias}`,
        `- workspace: ${this.persona.workspaceDir}`,
        `- cadence: ${cadence}`,
        `- phase: ${phase}`,
        `- signal_id: ${result.signal.signal_id}`,
        `- theme: ${result.signal.theme}`,
        `- confidence: ${synthesis.confidence}`,
        ``,
        `### Base Case`,
        synthesis.base_case,
        ``,
        `### Alternative Case`,
        synthesis.alternative_case,
        ``,
        `### Key Uncertainties`,
        ...synthesis.key_uncertainties.map((v) => `- ${v}`),
        ``,
        `### Monitoring Signals`,
        ...synthesis.monitoring_signals.map((v) => `- ${v}`),
        ``,
        `### Narrative Summary`,
        this.applySoulStyle(synthesis.narrative_summary),
        ``,
        opinion ? `### 观点\n${opinion}\n` : "",
        `### Persona Source`,
        `- SOUL.md loaded: ${this.persona.soul ? "yes" : "no"}`,
        `- IDENTITY.md loaded: ${this.persona.identity ? "yes" : "no"}`,
        `- USER.md loaded: ${this.persona.user ? "yes" : "no"}`,
        ``
      ].join("\n")
    };
  }

  private renderSummaryLine(base: string, alt: string, confidence: number): string {
    const concise = hasRule(this.persona.soul, "简洁优先") || hasRule(this.persona.soul, "concise");
    if (concise) {
      return `Base=${base.slice(0, 50)}；Alt=${alt.slice(0, 40)}；Conf=${confidence}`;
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
    if (concise && output.length > 140) {
      output = `${output.slice(0, 140)}...`;
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
