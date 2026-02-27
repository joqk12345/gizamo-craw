import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ChannelAdapter } from "../channels/channel-adapter.js";
import { Reporter } from "./reporter.js";

type CadenceKey = "every" | "daily" | "weekly";

interface HeartbeatPlan {
  every: string[];
  daily: string[];
  weekly: string[];
}

interface HeartbeatState {
  lastDaily?: string;
  lastWeekly?: string;
}

interface HeartbeatOptions {
  intervalMs: number;
  rootDir: string;
  targetChatId: string;
}

export class HeartbeatService {
  private timer?: NodeJS.Timeout;
  private state: HeartbeatState = {};

  constructor(
    private readonly channel: ChannelAdapter,
    private readonly reporter: Reporter,
    private readonly options: HeartbeatOptions
  ) {}

  start(): void {
    this.runOnce().catch((err) => console.error("[heartbeat] first run failed:", err));
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => console.error("[heartbeat] run failed:", err));
    }, this.options.intervalMs);
  }

  async runOnce(now = new Date()): Promise<void> {
    const heartbeatFile = path.join(this.options.rootDir, "HEARTBEAT.md");
    if (!existsSync(heartbeatFile)) {
      console.log("[heartbeat] HEARTBEAT.md not found, HEARTBEAT_OK");
      return;
    }

    const plan = this.parsePlan(readFileSync(heartbeatFile, "utf-8"));
    const sections: string[] = [];

    const everyLines = await this.executeLines(plan.every, "every", now);
    if (everyLines.length) sections.push("## 每次心跳\n" + everyLines.join("\n"));

    if (this.shouldRunDaily(now)) {
      const dailyLines = await this.executeLines(plan.daily, "daily", now);
      if (dailyLines.length) sections.push("## 每日任务\n" + dailyLines.join("\n"));
      this.state.lastDaily = now.toISOString().slice(0, 10);
    }

    if (this.shouldRunWeekly(now)) {
      const weeklyLines = await this.executeLines(plan.weekly, "weekly", now);
      if (weeklyLines.length) sections.push("## 每周任务\n" + weeklyLines.join("\n"));
      this.state.lastWeekly = this.isoWeek(now);
    }

    if (!sections.length) {
      return;
    }

    const markdown = [
      "# Heartbeat Report",
      `- time(UTC): ${now.toISOString()}`,
      "",
      ...sections,
      ""
    ].join("\n");

    let reportUrl = "";
    try {
      reportUrl = await this.reporter.publish(`heartbeat-${Date.now()}`, markdown);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      sections.push(`\n> GitHub publish failed: ${detail}`);
    }

    const short = [`[Heartbeat] 已完成巡检`, reportUrl ? `报告: ${reportUrl}` : "报告发布失败（见日志）"].join("\n");
    await this.channel.sendMessage(this.options.targetChatId, short);
  }

  private parsePlan(content: string): HeartbeatPlan {
    const plan: HeartbeatPlan = { every: [], daily: [], weekly: [] };
    let current: CadenceKey | null = null;
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/每次心跳时执行/.test(line)) {
        current = "every";
        continue;
      }
      if (/每日执行一次/.test(line)) {
        current = "daily";
        continue;
      }
      if (/每周执行一次/.test(line)) {
        current = "weekly";
        continue;
      }
      if (current && /^[-*]\s+/.test(line)) {
        plan[current].push(line.replace(/^[-*]\s+/, "").trim());
      }
    }
    return plan;
  }

  private async executeLines(lines: string[], cadence: CadenceKey, now: Date): Promise<string[]> {
    const output: string[] = [];
    for (const line of lines) {
      if (/健康状态|health/i.test(line)) {
        output.push(...(await this.checkHealth(line)));
        continue;
      }
      if (/待办|todo/i.test(line)) {
        output.push(...this.scanStaleTodos());
        continue;
      }
      if (/对话日志|过去\s*7\s*天|7\s*天/i.test(line)) {
        output.push(...this.buildWeeklyMemoryDigest(now));
        continue;
      }
      output.push(`- [SKIP] ${cadence}: ${line}（未匹配到内置执行器）`);
    }
    return output;
  }

  private async checkHealth(line: string): Promise<string[]> {
    const urls = this.extractUrls(line).length
      ? this.extractUrls(line)
      : (process.env.HEARTBEAT_HEALTH_URLS || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
    if (!urls.length) {
      return ["- [WARN] 未配置健康检查 URL（可在 HEARTBEAT.md 写 URL 或配置 HEARTBEAT_HEALTH_URLS）"];
    }
    const reports: string[] = [];
    for (const url of urls) {
      const started = Date.now();
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(t);
        const ms = Date.now() - started;
        reports.push(`- [${res.ok ? "OK" : "FAIL"}] ${url} status=${res.status} latency=${ms}ms`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        reports.push(`- [FAIL] ${url} error=${detail}`);
      }
    }
    return reports;
  }

  private scanStaleTodos(): string[] {
    const candidates = [path.join(this.options.rootDir, "TODO.md"), path.join(this.options.rootDir, "memory", "projects.md")];
    const lines: string[] = [];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf-8");
      const stale = raw
        .split("\n")
        .filter((l) => /\[( |-)\]/.test(l) || /^##\s+\d{4}-\d{2}-\d{2}/.test(l))
        .filter((l) => !/done|完成|已完成/i.test(l))
        .filter((l) => this.isOlderThan3Days(l));
      if (stale.length) {
        lines.push(`- [WARN] ${path.basename(file)} 存在 ${stale.length} 条超过 3 天未更新项`);
      }
    }
    if (!lines.length) lines.push("- [OK] 未发现超过 3 天未更新的待办项");
    return lines;
  }

  private buildWeeklyMemoryDigest(now: Date): string[] {
    const memoryDir = path.join(this.options.rootDir, "memory");
    if (!existsSync(memoryDir)) {
      return ["- [WARN] memory 目录不存在，跳过周报整理"];
    }

    const dayFiles = readdirSync(memoryDir)
      .filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n))
      .sort()
      .slice(-7);
    const bullets: string[] = [];
    for (const file of dayFiles) {
      const raw = readFileSync(path.join(memoryDir, file), "utf-8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (/^-\s+/.test(trimmed) && /confidence|theme|signal|monitoring|watch/i.test(trimmed)) {
          bullets.push(trimmed);
        }
      }
    }

    const weeklyFile = path.join(memoryDir, `weekly-${this.isoWeek(now)}.md`);
    const content = [
      `# Weekly Memory Digest ${this.isoWeek(now)}`,
      `- generated_at: ${now.toISOString()}`,
      `- sources: ${dayFiles.join(", ") || "none"}`,
      "",
      "## Highlights",
      ...(bullets.length ? bullets.slice(0, 60) : ["- 无可提炼项"]),
      ""
    ].join("\n");
    writeFileSync(weeklyFile, content, "utf-8");

    return [`- [OK] 已生成周摘要: memory/${path.basename(weeklyFile)}`];
  }

  private shouldRunDaily(now: Date): boolean {
    const d = now.toISOString().slice(0, 10);
    return this.state.lastDaily !== d;
  }

  private shouldRunWeekly(now: Date): boolean {
    const w = this.isoWeek(now);
    return this.state.lastWeekly !== w;
  }

  private isoWeek(now: Date): string {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  }

  private extractUrls(text: string): string[] {
    return Array.from(new Set(text.match(/https?:\/\/[^\s)]+/g) || []));
  }

  private isOlderThan3Days(line: string): boolean {
    const m = line.match(/(\d{4}-\d{2}-\d{2})/);
    if (!m) return false;
    const d = new Date(`${m[1]}T00:00:00Z`);
    const now = Date.now();
    return (now - d.getTime()) / 86400000 > 3;
  }
}
