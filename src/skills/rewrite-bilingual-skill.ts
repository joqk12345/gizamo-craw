import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { LLMClient } from "../services/llm.js";
import { Skill } from "./skill.js";

export class RewriteBilingualSkill implements Skill {
  readonly kind = "rewrite_bilingual" as const;

  constructor(private readonly llm: LLMClient) {}

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const text = String(task.payload.text || "").trim();
    const rewritten = await this.llm.summarizeLongText(
      text,
      [
        "你是资深双语编辑。",
        "请只基于输入原文进行重写，不得杜撰新增事实。",
        "保留原文关键信息、逻辑和语气，表达更清晰、可读性更高。",
        "输出必须严格按以下 Markdown 结构：",
        "## 中文重写",
        "- 给出完整的中文重写版本",
        "## English Rewrite",
        "- Provide a full English rewrite with the same meaning"
      ].join("\n")
    );

    return {
      title: "原文中英重写",
      shortSummary: rewritten.slice(0, 320),
      reportSection: `## 原文中英重写\n\n${rewritten}`
    };
  }
}
