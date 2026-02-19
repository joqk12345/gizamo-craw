import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { getJson } from "../services/http.js";
import { LLMClient } from "../services/llm.js";
import { Skill } from "./skill.js";

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

interface OpenRouterModelResponse {
  data?: OpenRouterModel[];
}

export class OpenRouterRankingSkill implements Skill {
  readonly kind = "openrouter_ranking" as const;

  constructor(private readonly llm: LLMClient) {}

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const limit = Number(task.payload.limit || 10);
    const data = await getJson<OpenRouterModelResponse>(
      "https://openrouter.ai/api/v1/models"
    );
    const models = (data.data || []).slice(0, Math.max(1, Math.min(limit, 20)));

    const ranked = models.map((m, i) => ({
      rank: i + 1,
      id: m.id,
      name: m.name || m.id,
      context: m.context_length || 0,
      inputCost: Number(m.pricing?.prompt || "0"),
      outputCost: Number(m.pricing?.completion || "0")
    }));

    const raw = ranked
      .map(
        (m) =>
          `${m.rank}. ${m.name} (${m.id}) | context=${m.context} | input=${m.inputCost} | output=${m.outputCost}`
      )
      .join("\n");

    const summary = await this.llm.complete(
      `你是模型情报分析师。以下是 OpenRouter models 列表（平台返回顺序可视作热度参考，但不是官方热度榜）。\n请以“综合、热度优先”给出：\n1) 最值得关注的前5模型\n2) 每个模型一句理由（热度+能力+成本）\n3) 选型建议（高质量优先/成本优先各给2条）\n\n数据：\n${raw}`
    );

    return {
      title: "OpenRouter 综合热度分析",
      shortSummary: summary.slice(0, 320),
      reportSection: `## OpenRouter 综合热度分析\n\n> 注：OpenRouter API 未直接返回官方“热度分数”，本报告将接口顺序作为热度参考。\n\n### 原始列表\n${raw
        .split("\n")
        .map((v) => `- ${v}`)
        .join("\n")}\n\n### 分析\n${summary}`
    };
  }
}
