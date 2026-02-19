import { ParsedTask, SkillResult, TaskContext } from "../core/types.js";

export interface SkillDeps {
  summarizeText: (text: string, instruction: string) => Promise<string>;
  extractTextFromUrl: (url: string) => Promise<string>;
}

export interface Skill {
  kind: ParsedTask["kind"];
  run(task: ParsedTask, ctx: TaskContext): Promise<SkillResult>;
}

