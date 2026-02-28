import { ChannelAdapter } from "../channels/channel-adapter.js";
import { Reporter } from "../services/reporter.js";
import { RuntimeMemoryJournal } from "../services/runtime-memory-journal.js";
import { parseTasks, TaskParserMode } from "./task-parser.js";
import { TaskRunner } from "./task-runner.js";
import { IncomingMessage } from "./types.js";

interface GatewayOptions {
  agentRole: TaskParserMode;
  agentLabel?: string;
  allowedUserIds: Set<string>;
  allowedChatIds: Set<string>;
  runner: TaskRunner;
  reporter: Reporter;
}

export class Gateway {
  private queue: Promise<void> = Promise.resolve();
  private readonly runtimeJournal = new RuntimeMemoryJournal();

  constructor(
    private readonly channel: ChannelAdapter,
    private readonly options: GatewayOptions
  ) {}

  private helpLines(): string[] {
    if (this.options.agentRole === "strategic") {
      return [
        "可用指令示例（Strategic Agent）：",
        "1) 战略研究: weekly phase4 AI芯片出口限制影响",
        "2) 战略研究：daily phase2 美债收益率上行影响",
        "3) strategy: weekly phase3 energy transition geopolitics"
      ];
    }
    return [
      "可用指令示例（News Agent）：",
      "1) 总结 https://example.com/article",
      "2) 抓取 hn top 10 并分析",
      "3) 抓取 openrouter top 10 并分析",
      "4) 任务：总结 https://a.com + 抓取 hn top 10",
      "5) 重写 这里放原文（我会输出中文重写 + English Rewrite）",
      "6) 直接发送长文本，我会自动总结"
    ];
  }

  private unknownTaskHint(): string {
    return this.options.agentRole === "strategic"
      ? "未识别到有效任务。Strategic Agent 仅接受“战略研究/strategy”类命令。"
      : "未识别到有效任务。News Agent 仅接受新闻采编类命令。";
  }

  private toPublishHint(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    const compact = raw.replace(/\s+/g, " ").slice(0, 220);
    const lower = compact.toLowerCase();
    if (lower.includes("401") || lower.includes("bad credentials")) {
      return `GitHub token 无效或过期（请检查 GITHUB_TOKEN）: ${compact}`;
    }
    if (lower.includes("403") || lower.includes("resource not accessible")) {
      return `GitHub token 权限不足（需要 repo contents 写权限）: ${compact}`;
    }
    if (lower.includes("404")) {
      return `仓库或分支不存在（请检查 GITHUB_REPO/GITHUB_BRANCH）: ${compact}`;
    }
    return `GitHub 发布失败: ${compact}`;
  }

  async start(): Promise<void> {
    await this.channel.start(async (message) => this.enqueue(message));
  }

  private enqueue(message: IncomingMessage): Promise<void> {
    this.queue = this.queue
      .then(() => this.handleMessage(message))
      .catch((err) => console.error("[gateway] queue error:", err));
    return this.queue;
  }

  private async handleMessage(message: IncomingMessage): Promise<void> {
    if (message.chatType !== "private") {
      return;
    }
    const allowedByUser = this.options.allowedUserIds.has(message.actorId);
    const allowedByChat = this.options.allowedChatIds.has(message.chatId);
    if (!allowedByUser && !allowedByChat) {
      await this.channel.sendMessage(
        message.chatId,
        `无权限：该账号不在允许列表。\nuser_id=${message.actorId}\nchat_id=${message.chatId}\n请把其中一个加入 .env 白名单。`
      );
      return;
    }
    const plain = message.text.trim();
    if (plain === "/start" || plain === "/help") {
      await this.channel.sendMessage(message.chatId, this.helpLines().join("\n"));
      return;
    }

    const tasks = parseTasks(message.text, this.options.agentRole);
    if (!tasks.length) {
      await this.channel.sendMessage(message.chatId, this.unknownTaskHint());
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.channel.sendMessage(
      message.chatId,
      `已接收任务(${requestId})，共 ${tasks.length} 项，开始执行。`
    );

    try {
      const runOutput = await this.options.runner.run(requestId, tasks, async (progress) => {
        await this.channel.sendMessage(message.chatId, progress);
      });
      this.runtimeJournal.appendRuntimeRecord({
        requestId,
        agentLabel: this.options.agentLabel || this.options.agentRole,
        actorId: message.actorId,
        chatId: message.chatId,
        status: "success",
        tasks
      });
      let reportUrl = "";
      let publishHint = "";
      try {
        reportUrl = await this.options.reporter.publish(
          runOutput.title,
          runOutput.markdownReport
        );
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.error("[gateway] report publish failed:", detail);
        publishHint = this.toPublishHint(err);
      }
      await this.channel.sendMessage(
        message.chatId,
        reportUrl
          ? `${runOutput.shortMessage}\n\n详细报告: ${reportUrl}`
          : `${runOutput.shortMessage}\n\n详细报告未发布（未配置 GitHub 或发布失败）。${
              publishHint ? `\n${publishHint}` : ""
            }`
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.runtimeJournal.appendRuntimeRecord({
        requestId,
        agentLabel: this.options.agentLabel || this.options.agentRole,
        actorId: message.actorId,
        chatId: message.chatId,
        status: "failed",
        tasks,
        errorMessage: detail.replace(/\s+/g, " ").slice(0, 220)
      });
      await this.channel.sendMessage(message.chatId, `任务失败(${requestId}): ${detail}`);
    }
  }
}
