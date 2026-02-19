import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { Skill } from "./skill.js";
import { LLMClient } from "../services/llm.js";
import { buildStructuredSummaryInstruction } from "./summary-template.js";
import { sanitizeSummaryOutput } from "./summary-output-fixer.js";

export class SummarizeTextSkill implements Skill {
  readonly kind = "summarize_text" as const;

  constructor(private readonly llm: LLMClient) {}

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const text = String(task.payload.text || "");
    const summaryRaw = await this.llm.summarizeLongText(
      text,
      buildStructuredSummaryInstruction("用户输入文本")
    );
    const summary = sanitizeSummaryOutput(summaryRaw);

    return {
      title: "文本总结",
      shortSummary: summary.slice(0, 300),
      reportSection: `## 文本总结\n\n${summary}`
    };
  }
}
