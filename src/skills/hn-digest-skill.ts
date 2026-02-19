import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";
import { getJson } from "../services/http.js";
import { LLMClient } from "../services/llm.js";
import { Skill } from "./skill.js";

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  by?: string;
  time?: number;
}

export class HackerNewsDigestSkill implements Skill {
  readonly kind = "hn_digest" as const;

  constructor(private readonly llm: LLMClient) {}

  async run(task: ParsedTask, _ctx: TaskContext): Promise<SkillResult> {
    const limit = Number(task.payload.limit || 10);
    const topIds = await getJson<number[]>(
      "https://hacker-news.firebaseio.com/v0/topstories.json"
    );
    const ids = topIds.slice(0, Math.max(1, Math.min(30, limit)));
    const stories = await Promise.all(
      ids.map((id) =>
        getJson<HNItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
      )
    );

    const list = stories
      .map((s, i) => {
        const score = s.score ?? 0;
        const comments = s.descendants ?? 0;
        return `${i + 1}. ${s.title || "(untitled)"} | score=${score} | comments=${comments} | ${
          s.url || `https://news.ycombinator.com/item?id=${s.id}`
        }`;
      })
      .join("\n");

    const summary = await this.llm.complete(
      `你是新闻编辑，以下是 Hacker News Top ${ids.length}。\n请输出：\n1) 今日技术热点主线（3条）\n2) 热度最高的 5 条及原因\n3) 对内容策略的建议（3条）\n\n数据：\n${list}`
    );

    return {
      title: "Hacker News 热点分析",
      shortSummary: summary.slice(0, 320),
      reportSection: `## Hacker News 热点分析\n\n### 原始榜单\n${list
        .split("\n")
        .map((v) => `- ${v}`)
        .join("\n")}\n\n### 分析\n${summary}`
    };
  }
}
