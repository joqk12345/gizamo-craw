import { ParsedTask } from "./types.js";

export type TaskParserMode = "news" | "strategic";

const URL_RE = /https?:\/\/[^\s]+/gi;

function normalizeDetectedUrl(raw: string): string {
  return raw.replace(/[),.;!?，。；！？）】》]+$/g, "");
}

function detectTopN(text: string, defaultValue: number): number {
  const match = text.match(/top\s*(\d{1,3})/i) || text.match(/前\s*(\d{1,3})/i);
  if (!match) {
    return defaultValue;
  }
  const n = Number(match[1]);
  if (Number.isNaN(n)) {
    return defaultValue;
  }
  return Math.max(1, Math.min(30, n));
}


function parseStrategicResearchTask(source: string): ParsedTask | null {
  const m = source.match(/^(战略研究|战略|strategy|strategic)\s*[:：]?\s*(.*)$/i);
  if (!m) return null;
  const body = (m[2] || "").trim();
  if (!body) return null;

  const cadenceMatch = body.match(/\b(daily|weekly|monthly)\b/i);
  const phaseMatch = body.match(/\bphase\s*([1-4])\b/i);
  const cadence = (cadenceMatch?.[1]?.toLowerCase() || "weekly") as "daily" | "weekly" | "monthly";
  const phase = (`phase${phaseMatch?.[1] || "4"}`) as "phase1" | "phase2" | "phase3" | "phase4";
  const cleaned = body
    .replace(/\b(daily|weekly|monthly)\b/gi, " ")
    .replace(/\bphase\s*[1-4]\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    kind: "strategic_research",
    title: "战略研究",
    payload: {
      text: cleaned,
      sourceType: "telegram",
      cadence,
      phase
    }
  };
}

function stripControlText(input: string): string {
  return input
    .replace(URL_RE, " ")
    .replace(/任务[:：]?/gi, " ")
    .replace(/总结|summar(y|ize)/gi, " ")
    .replace(/抓取|拉取|分析|digest/gi, " ")
    .replace(/hacker\s*news|openrouter|ranking|排行|榜单|\bhn\b/gi, " ")
    .replace(/[+,，;；]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseTasks(text: string, mode: TaskParserMode = "news"): ParsedTask[] {
  const source = text.trim();
  if (!source) {
    return [];
  }
  if (/^(总结|summary|summarize|抓取|分析|任务[:：]?)\s*$/i.test(source)) {
    return [];
  }

  const strategicTask = parseStrategicResearchTask(source);
  if (mode === "strategic") {
    return strategicTask ? [strategicTask] : [];
  }
  if (strategicTask) {
    return [];
  }

  const tasks: ParsedTask[] = [];
  const links = Array.from(
    new Set((source.match(URL_RE) || []).map((v) => normalizeDetectedUrl(v)).filter(Boolean))
  );

  for (const link of links) {
    tasks.push({
      kind: "summarize_link",
      title: `链接总结: ${link}`,
      payload: { url: link }
    });
  }

  if (/(hacker\s*news|\bhn\b|HackerNews)/i.test(source)) {
    tasks.push({
      kind: "hn_digest",
      title: "Hacker News 热点分析",
      payload: { limit: detectTopN(source, 10) }
    });
  }

  if (/openrouter/i.test(source)) {
    tasks.push({
      kind: "openrouter_ranking",
      title: "OpenRouter 模型热度榜分析",
      payload: { limit: detectTopN(source, 10) }
    });
  }

  const maybeLongText = stripControlText(source);
  if (maybeLongText.length >= 120 || (tasks.length === 0 && maybeLongText.length >= 40)) {
    tasks.push({
      kind: "summarize_text",
      title: "文本总结",
      payload: { text: maybeLongText }
    });
  }

  if (tasks.length === 0 && source.length > 0) {
    tasks.push({
      kind: "summarize_text",
      title: "文本总结",
      payload: { text: source }
    });
  }

  return tasks;
}
