import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { Skill } from "./skill.js";
import { StrategicResearchOrchestrator } from "../strategic/orchestrator.js";
import { CadenceMode, ExecutionPhase } from "../strategic/types.js";

export class StrategicResearchSkill implements Skill {
  readonly kind = "strategic_research" as const;

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
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

    if (result.insufficientBrief) {
      const brief = result.insufficientBrief;
      return {
        title: "战略研究简报（信号不足）",
        shortSummary: `信号不足：confidence=${brief.confidence}，建议继续监控。`,
        reportSection: [
          `## 战略研究简报（信号不足）`,
          ``,
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
        shortSummary: `已完成至 ${phase}，镜头=${result.selectedLenses.selected_lenses.join(", ")}`.slice(0, 300),
        reportSection: [
          `## 战略研究（阶段输出）`,
          ``,
          `- cadence: ${cadence}`,
          `- phase: ${phase}`,
          `- theme: ${result.signal.theme}`,
          `- selected_lenses: ${result.selectedLenses.selected_lenses.join(", ")}`,
          ``
        ].join("\n")
      };
    }

    const shortSummary = [
      `Base: ${synthesis.base_case}`,
      `Alt: ${synthesis.alternative_case}`,
      `Conf: ${synthesis.confidence}`
    ].join(" | ").slice(0, 320);

    return {
      title: "战略研究简报",
      shortSummary,
      reportSection: [
        `## 战略研究简报`,
        ``,
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
        synthesis.narrative_summary,
        ``
      ].join("\n")
    };
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
