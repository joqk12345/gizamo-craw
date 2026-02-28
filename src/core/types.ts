export interface IncomingMessage {
  channel: "telegram" | string;
  actorId: string;
  chatId: string;
  chatType: "private" | "group" | "channel" | string;
  text: string;
  messageId: string;
  createdAt: string;
}

export interface ParsedTask {
  kind:
    | "summarize_text"
    | "rewrite_bilingual"
    | "summarize_link"
    | "hn_digest"
    | "openrouter_ranking"
    | "strategic_research";
  title: string;
  payload: Record<string, unknown>;
}

export interface SkillResult {
  title: string;
  shortSummary: string;
  reportSection: string;
}

export interface TaskContext {
  requestId: string;
}
