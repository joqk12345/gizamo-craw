import { TelegramAdapter } from "./channels/telegram-adapter.js";
import { loadConfig } from "./config.js";
import { Gateway } from "./core/gateway.js";
import { TaskRunner } from "./core/task-runner.js";
import { ContentExtractor } from "./services/content-extractor.js";
import { GitHubReporter } from "./services/github-reporter.js";
import { DisabledLLM, OpenRouterLLM } from "./services/llm.js";
import { NoopReporter } from "./services/noop-reporter.js";
import { HeartbeatService } from "./services/heartbeat.js";
import { HackerNewsDigestSkill } from "./skills/hn-digest-skill.js";
import { OpenRouterRankingSkill } from "./skills/openrouter-ranking-skill.js";
import { SummarizeLinkSkill } from "./skills/summarize-link-skill.js";
import { SummarizeTextSkill } from "./skills/summarize-text-skill.js";
import { StrategicResearchSkill } from "./skills/strategic-research-skill.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const llm = config.openRouterApiKey
    ? new OpenRouterLLM(
        config.openRouterApiKey,
        config.openRouterModel,
        config.openRouterFallbackModels
      )
    : new DisabledLLM();
  const extractor = new ContentExtractor();

  const skills = [
    new SummarizeTextSkill(llm),
    new SummarizeLinkSkill(extractor, llm),
    new HackerNewsDigestSkill(llm),
    new OpenRouterRankingSkill(llm),
    new StrategicResearchSkill()
  ];
  const runner = new TaskRunner(skills);
  const reporter =
    config.githubToken && config.githubRepo
      ? new GitHubReporter(
          config.githubToken,
          config.githubRepo,
          config.githubBranch,
          config.reportBasePath
        )
      : new NoopReporter();
  const telegram = new TelegramAdapter(
    config.telegramBotToken,
    config.pollIntervalMs,
    config.telegramLongPollTimeoutSec,
    config.telegramForceShortPoll,
    config.telegramTransport
  );

  const gateway = new Gateway(telegram, {
    allowedUserIds: config.telegramAllowedUserIds,
    allowedChatIds: config.telegramAllowedChatIds,
    runner,
    reporter
  });

  console.log("[boot] gateway starting...");
  if (!config.openRouterApiKey) {
    console.log("[boot] OPENROUTER_API_KEY is missing: summarize/analyze tasks will return config hint.");
  } else if (config.openRouterFallbackModels.length > 0) {
    console.log(
      `[boot] OPENROUTER_FALLBACK_MODELS enabled: ${config.openRouterFallbackModels.length} candidates.`
    );
  }
  if (!config.githubToken || !config.githubRepo) {
    console.log("[boot] GITHUB_TOKEN/GITHUB_REPO is missing: report link publishing disabled.");
  }
  if (config.telegramForceShortPoll) {
    console.log("[boot] TELEGRAM_FORCE_SHORT_POLL enabled: using timeout=0 polling mode.");
  }
  if (config.telegramTransport === "curl") {
    console.log("[boot] TELEGRAM_TRANSPORT=curl enabled.");
  }

  const heartbeatTarget =
    Array.from(config.telegramAllowedChatIds)[0] || Array.from(config.telegramAllowedUserIds)[0] || "";
  if (config.heartbeatEnabled && heartbeatTarget) {
    const heartbeat = new HeartbeatService(telegram, reporter, {
      intervalMs: config.heartbeatIntervalMs,
      rootDir: process.cwd(),
      targetChatId: heartbeatTarget
    });
    heartbeat.start();
    console.log(`[boot] heartbeat enabled: interval=${config.heartbeatIntervalMs}ms target=${heartbeatTarget}`);
  } else {
    console.log("[boot] heartbeat disabled (missing target or HEARTBEAT_ENABLED=0).");
  }
  await gateway.start();
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
