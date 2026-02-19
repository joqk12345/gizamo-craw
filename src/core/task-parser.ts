import { ParsedTask } from "./types.js";

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

export function parseTasks(text: string): ParsedTask[] {
  const source = text.trim();
  if (!source) {
    return [];
  }
  if (/^(总结|summary|summarize|抓取|分析|任务[:：]?)\s*$/i.test(source)) {
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
