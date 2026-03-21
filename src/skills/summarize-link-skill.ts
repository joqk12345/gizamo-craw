import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { ContentExtractor } from "../services/content-extractor.js";
import { Skill } from "./skill.js";
import { StructuredSummaryGenerator } from "../services/structured-summary-generator.js";
import {
  renderStructuredSummaryMarkdown,
  renderStructuredSummaryShortText
} from "./renderers/structured-summary-markdown.js";

export class SummarizeLinkSkill implements Skill {
  readonly kind = "summarize_link" as const;

  constructor(
    private readonly extractor: ContentExtractor,
    private readonly generator: StructuredSummaryGenerator
  ) {}

  private buildTraceLines(title: string, meta: { model: string; attemptedModels: string[]; schemaFallbackUsed: boolean }): string[] {
    return [
      `${title} | model=${meta.model}`,
      `${title} | schema_fallback=${meta.schemaFallbackUsed ? "yes" : "no"}`,
      `${title} | attempted_models=${meta.attemptedModels.join(", ")}`
    ];
  }

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const url = String(task.payload.url || "");
    if (!this.generator.isConfigured) {
      const message = this.generator.getDisabledMessage();
      return {
        title: `链接总结: ${url}`,
        shortSummary: `${url}\n${message}`.slice(0, 320),
        reportSection: `## 链接总结\n\n- URL: ${url}\n\n${message}`
      };
    }

    const text = await this.extractor.extractText(url);
    const run = await this.generator.summarize({
      sourceType: "url",
      sourceLabel: `网页正文 (${url})`,
      text
    });
    const summary = run.summary;
    const markdown = renderStructuredSummaryMarkdown(summary);
    const traceTitle = `链接总结: ${url}`;
    const traceLines = this.buildTraceLines(traceTitle, run.meta);

    return {
      title: `链接总结: ${url}`,
      shortSummary: `${url}\n${renderStructuredSummaryShortText(summary)}`.slice(0, 320),
      reportSection: [
        `## 链接总结`,
        ``,
        `- URL: ${url}`,
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
