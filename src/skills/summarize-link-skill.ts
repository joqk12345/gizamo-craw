import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { ContentExtractor } from "../services/content-extractor.js";
import { LLMClient } from "../services/llm.js";
import { Skill } from "./skill.js";
import { buildStructuredSummaryInstruction } from "./summary-template.js";
import { sanitizeSummaryOutput } from "./summary-output-fixer.js";

export class SummarizeLinkSkill implements Skill {
  readonly kind = "summarize_link" as const;

  constructor(
    private readonly extractor: ContentExtractor,
    private readonly llm: LLMClient
  ) {}

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const url = String(task.payload.url || "");
    const text = await this.extractor.extractText(url);
    const summaryRaw = await this.llm.summarizeLongText(
      text,
      buildStructuredSummaryInstruction(`网页正文 (${url})`)
    );
    const summary = sanitizeSummaryOutput(summaryRaw);

    return {
      title: `链接总结: ${url}`,
      shortSummary: `${url}\n${summary}`.slice(0, 320),
      reportSection: `## 链接总结\n\n- URL: ${url}\n\n${summary}`
    };
  }
}
