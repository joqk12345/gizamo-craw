import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { LensAnalysis, OrchestrationResult, SignalObject } from "./types.js";
import { LensPerformance, ThemeCluster, ThesisRecord } from "./stores.js";

export interface StrategicMemorySnapshot {
  signals: SignalObject[];
  themeClusters: ThemeCluster[];
  theses: ThesisRecord[];
  lensPerformance: LensPerformance[];
}

export interface StrategicMemoryJournalInput {
  requestId: string;
  cadence: string;
  phase: string;
  result: OrchestrationResult;
  snapshot: StrategicMemorySnapshot;
}

function readIfExists(file: string): string {
  if (!existsSync(file)) return "";
  return readFileSync(file, "utf-8");
}

function upsertSection(content: string, sectionTitle: string, nextBody: string): string {
  const block = `## ${sectionTitle}\n${nextBody}\n`;
  const re = new RegExp(`## ${sectionTitle}\\n[\\s\\S]*?(?=\\n## |$)`, "m");
  if (re.test(content)) {
    return content.replace(re, block.trimEnd());
  }
  return `${content.trimEnd()}\n\n${block}`.trimStart();
}

function appendLines(file: string, lines: string[]): void {
  const prev = readIfExists(file);
  const next = `${prev}${prev ? "\n" : ""}${lines.join("\n")}\n`;
  writeFileSync(file, next, "utf-8");
}

export class StrategicMemoryJournal {
  readonly rootDir: string;
  readonly memoryDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || process.env.STRATEGIC_MEMORY_DIR || path.resolve(process.cwd());
    this.memoryDir = path.join(this.rootDir, "memory");
    mkdirSync(this.memoryDir, { recursive: true });
  }

  persist(input: StrategicMemoryJournalInput): void {
    this.writeMemoryIndex(input);
    this.writeProjects(input);
    this.writeInfra(input);
    this.writeLessons(input);
    this.writeDailyLog(input);
  }

  private writeMemoryIndex(input: StrategicMemoryJournalInput): void {
    const file = path.join(this.rootDir, "MEMORY.md");
    const signal = input.result.signal;
    const confidence = input.result.synthesis?.confidence ?? input.result.insufficientBrief?.confidence ?? 0;

    const lines = [
      "# MEMORY",
      "",
      "战略研究记忆索引（MVP）：仅记录关键状态与文件引用。",
      "",
      "## Latest",
      `- request_id: ${input.requestId}`,
      `- signal_id: ${signal.signal_id}`,
      `- theme: ${signal.theme}`,
      `- cadence/phase: ${input.cadence}/${input.phase}`,
      `- confidence: ${confidence}`,
      `- files: memory/projects.md, memory/infra.md, memory/lessons.md, memory/${this.dateKey()}.md`,
      ""
    ];
    writeFileSync(file, lines.join("\n"), "utf-8");
  }

  private writeProjects(input: StrategicMemoryJournalInput): void {
    const file = path.join(this.memoryDir, "projects.md");
    const summary = input.result.synthesis?.base_case || input.result.insufficientBrief?.reason || "phase output";
    appendLines(file, [
      `## ${new Date().toISOString()} | request ${input.requestId}`,
      `- theme: ${input.result.signal.theme}`,
      `- cadence/phase: ${input.cadence}/${input.phase}`,
      `- selected_lenses: ${input.result.selectedLenses.selected_lenses.join(", ")}`,
      `- status: ${input.result.state}`,
      `- summary: ${summary}`,
      ""
    ]);
  }

  private writeInfra(input: StrategicMemoryJournalInput): void {
    const file = path.join(this.memoryDir, "infra.md");
    const snapshot = input.snapshot;
    const rows = [
      `- root_dir: ${this.rootDir}`,
      `- signal_count: ${snapshot.signals.length}`,
      `- theme_cluster_count: ${snapshot.themeClusters.length}`,
      `- thesis_count: ${snapshot.theses.length}`,
      `- lens_perf_count: ${snapshot.lensPerformance.length}`,
      `- updated_at: ${new Date().toISOString()}`
    ].join("\n");

    const current = readIfExists(file) || "# infra\n\n";
    const next = upsertSection(current, "Runtime Snapshot", `${rows}\n`);
    writeFileSync(file, next, "utf-8");
  }

  private writeLessons(input: StrategicMemoryJournalInput): void {
    const file = path.join(this.memoryDir, "lessons.md");
    const uncertainties = input.result.synthesis?.key_uncertainties ?? input.result.insufficientBrief?.key_uncertainties ?? [];
    const watch = input.result.synthesis?.monitoring_signals ?? input.result.insufficientBrief?.monitoring_signals ?? [];
    const critiques = input.result.critiques.slice(0, 3).map((c) => `${c.lens_name}→${c.target_lens}: ${c.critique}`);
    appendLines(file, [
      `## ${new Date().toISOString()} | ${input.result.signal.theme}`,
      "- lessons:",
      ...uncertainties.map((u) => `  - uncertainty: ${u}`),
      ...watch.map((w) => `  - watch: ${w}`),
      ...critiques.map((c) => `  - critique: ${c}`),
      ""
    ]);
  }

  private writeDailyLog(input: StrategicMemoryJournalInput): void {
    const file = path.join(this.memoryDir, `${this.dateKey()}.md`);
    const result = input.result;
    const analyses: LensAnalysis[] = result.lensAnalyses;
    const confidence = result.synthesis?.confidence ?? result.insufficientBrief?.confidence ?? 0;
    appendLines(file, [
      `## ${new Date().toISOString()} | request ${input.requestId}`,
      `- signal: ${result.signal.signal_id} / ${result.signal.theme}`,
      `- cadence/phase: ${input.cadence}/${input.phase}`,
      `- confidence: ${confidence}`,
      "- lenses:",
      ...analyses.map((a) => `  - ${a.lens_name}: ${a.confidence} | ${a.core_thesis}`),
      "- monitoring:",
      ...(result.synthesis?.monitoring_signals ?? result.insufficientBrief?.monitoring_signals ?? []).map((m) => `  - ${m}`),
      ""
    ]);
  }

  private dateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
