import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ParsedTask } from "../core/types.js";

interface RuntimeMemoryRecord {
  requestId: string;
  agentLabel: string;
  actorId: string;
  chatId: string;
  status: "success" | "failed";
  tasks: ParsedTask[];
  errorMessage?: string;
}

function readIfExists(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function appendLines(file: string, lines: string[]): void {
  const prev = readIfExists(file);
  const next = `${prev}${prev ? "\n" : ""}${lines.join("\n")}\n`;
  writeFileSync(file, next, "utf-8");
}

export class RuntimeMemoryJournal {
  readonly rootDir: string;
  readonly memoryDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || path.resolve(process.cwd());
    this.memoryDir = path.join(this.rootDir, "memory");
    mkdirSync(this.memoryDir, { recursive: true });
  }

  appendRuntimeRecord(input: RuntimeMemoryRecord): void {
    const now = new Date();
    const file = path.join(this.memoryDir, `${formatLocalDate(now)}.md`);
    const taskKinds = input.tasks.map((t) => t.kind).join(", ");
    const taskTitles = input.tasks.map((t) => t.title).join(" | ");
    const outcome = input.status === "success" ? "执行成功" : "执行失败";
    appendLines(file, [
      `## ${now.toISOString()} | request ${input.requestId}`,
      `- runtime: ${input.agentLabel}`,
      `- actor/chat: ${input.actorId}/${input.chatId}`,
      `- status: ${input.status}`,
      `- tasks: ${taskKinds || "none"}`,
      `- titles: ${taskTitles || "none"}`,
      `- result: ${outcome}${input.errorMessage ? `（${input.errorMessage}）` : ""}`,
      ""
    ]);
  }
}
