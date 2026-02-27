import { ParsedTask, SkillResult, TaskContext } from "./types.js";
import { Skill } from "../skills/skill.js";

export interface RunOutput {
  shortMessage: string;
  markdownReport: string;
  title: string;
}

interface TaskRunnerOptions {
  agentLabel?: string;
}

export class TaskRunner {
  private readonly skillMap: Map<ParsedTask["kind"], Skill>;
  private readonly agentLabel: string;

  constructor(skills: Skill[], options: TaskRunnerOptions = {}) {
    this.skillMap = new Map(skills.map((s) => [s.kind, s]));
    this.agentLabel = (options.agentLabel || "news").toLowerCase();
  }

  async run(
    requestId: string,
    tasks: ParsedTask[],
    onProgress?: (message: string) => Promise<void>
  ): Promise<RunOutput> {
    const ctx: TaskContext = { requestId };
    const results: SkillResult[] = [];

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const skill = this.skillMap.get(task.kind);
      if (!skill) {
        throw new Error(`No skill for kind: ${task.kind}`);
      }

      if (onProgress) {
        await onProgress(`执行中 ${i + 1}/${tasks.length}: ${task.title}`);
      }

      const result = await skill.run(task, ctx);
      results.push(result);
    }

    const topLines = results
      .map((r, i) => `${i + 1}. ${r.shortSummary.replace(/\n+/g, " ").slice(0, 120)}`)
      .join("\n");
    const shortMessage = `[${this.agentLabel}] 任务完成，共 ${results.length} 项。\n${topLines}`;
    const markdownReport = [
      `# ${this.agentLabel.toUpperCase()} 任务报告`,
      ``,
      `- agent: ${this.agentLabel}`,
      `- requestId: ${requestId}`,
      `- 生成时间(UTC): ${new Date().toISOString()}`,
      ``,
      ...results.map((r) => r.reportSection),
      ``
    ].join("\n");

    return {
      shortMessage,
      markdownReport,
      title: `${this.agentLabel}-task-${requestId}`
    };
  }
}
