import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { Skill } from "./skill.js";
import { StructuredSummaryGenerator } from "../services/structured-summary-generator.js";
import {
  renderStructuredSummaryMarkdown,
  renderStructuredSummaryShortText
} from "./renderers/structured-summary-markdown.js";

export class SummarizeTextSkill implements Skill {
  readonly kind = "summarize_text" as const;

  constructor(private readonly generator: StructuredSummaryGenerator) {}

  private buildTraceLines(title: string, meta: { model: string; attemptedModels: string[]; schemaFallbackUsed: boolean }): string[] {
    return [
      `${title} | model=${meta.model}`,
      `${title} | schema_fallback=${meta.schemaFallbackUsed ? "yes" : "no"}`,
      `${title} | attempted_models=${meta.attemptedModels.join(", ")}`
    ];
  }

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const text = String(task.payload.text || "");
    if (!this.generator.isConfigured) {
      const message = this.generator.getDisabledMessage();
      return {
        title: "文本总结",
        shortSummary: message.slice(0, 300),
        reportSection: `## 文本总结\n\n${message}`
      };
    }

    const run = await this.generator.summarize({
      sourceType: "text",
      sourceLabel: "用户输入文本",
      text
    });
    const summary = run.summary;
    const markdown = renderStructuredSummaryMarkdown(summary);
    const traceLines = this.buildTraceLines("文本总结", run.meta);

    return {
      title: "文本总结",
      shortSummary: renderStructuredSummaryShortText(summary),
      reportSection: [
        `## 文本总结`,
        ``,
        `### 运行信息`,
        `- model: ${run.meta.model}`,
        `- schema_fallback: ${run.meta.schemaFallbackUsed ? "yes" : "no"}`,
        `- attempted_models: ${run.meta.attemptedModels.join(", ")}`,
        ``,
        markdown
      ].join("\n"),
      traceLines
    };
  }
}
