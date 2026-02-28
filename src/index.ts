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
import { loadPersonaProfile } from "./services/persona-profile.js";
import { PersonaAwareLLM } from "./services/persona-llm.js";
import { SummarizeLinkSkill } from "./skills/summarize-link-skill.js";
import { RewriteBilingualSkill } from "./skills/rewrite-bilingual-skill.js";
import { SummarizeTextSkill } from "./skills/summarize-text-skill.js";
import { StrategicResearchSkill } from "./skills/strategic-research-skill.js";
import { AgentRole, TenantConfig } from "./config.js";

function buildSkills(
  tenant: TenantConfig,
  llm: OpenRouterLLM | DisabledLLM,
  extractor: ContentExtractor
) {
  const role: AgentRole = tenant.agentRole;
  const persona = loadPersonaProfile({
    workspaceDir: tenant.personaWorkspaceDir,
    soulPath: tenant.soulFile,
    identityPath: tenant.identityFile,
    userPath: tenant.userFile
  });
  if (role === "strategic") {
    return [
      new StrategicResearchSkill(
        persona,
        undefined,
        tenant.strategicInsufficientSignalThreshold
      )
    ];
  }
  const personaLLM = new PersonaAwareLLM(llm, persona.soul);
  return [
    new RewriteBilingualSkill(personaLLM),
    new SummarizeTextSkill(personaLLM),
    new SummarizeLinkSkill(extractor, personaLLM),
    new HackerNewsDigestSkill(personaLLM),
    new OpenRouterRankingSkill(personaLLM)
  ];
}

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
  console.log(`[boot] tenants=${config.tenants.length}`);
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

  const starts = config.tenants.map(async (tenant) => {
    const skills = buildSkills(tenant, llm, extractor);
    const runner = new TaskRunner(skills, {
      agentLabel: `${tenant.id}/${tenant.agentRole}`
    });
    const reporter =
      config.githubToken && config.githubRepo
        ? new GitHubReporter(
            config.githubToken,
            config.githubRepo,
            config.githubBranch,
            tenant.reportBasePath
          )
        : new NoopReporter();
    const telegram = new TelegramAdapter(
      tenant.telegramBotToken,
      config.pollIntervalMs,
      config.telegramLongPollTimeoutSec,
      config.telegramForceShortPoll,
      config.telegramTransport
    );
    const gateway = new Gateway(telegram, {
      agentRole: tenant.agentRole,
      agentLabel: `${tenant.id}/${tenant.agentRole}`,
      allowedUserIds: tenant.telegramAllowedUserIds,
      allowedChatIds: tenant.telegramAllowedChatIds,
      runner,
      reporter
    });

    console.log(
      `[boot] tenant=${tenant.id} role=${tenant.agentRole} reportBasePath=${tenant.reportBasePath} threshold=${tenant.strategicInsufficientSignalThreshold ?? "default"}`
    );

    const heartbeatTarget =
      Array.from(tenant.telegramAllowedChatIds)[0] ||
      Array.from(tenant.telegramAllowedUserIds)[0] ||
      "";
    if (config.heartbeatEnabled && heartbeatTarget) {
      const heartbeat = new HeartbeatService(telegram, reporter, {
        intervalMs: config.heartbeatIntervalMs,
        rootDir: process.cwd(),
        targetChatId: heartbeatTarget
      });
      heartbeat.start();
      console.log(
        `[boot] heartbeat enabled: tenant=${tenant.id} interval=${config.heartbeatIntervalMs}ms target=${heartbeatTarget}`
      );
    } else {
      console.log(`[boot] heartbeat disabled: tenant=${tenant.id} (missing target or HEARTBEAT_ENABLED=0).`);
    }

    await gateway.start();
  });
  await Promise.all(starts);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
