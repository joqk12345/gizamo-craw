import crypto from "node:crypto";
import {
  CadenceMode,
  DialecticCritique,
  EditorialReviewResult,
  LensAnalysis,
  LensSelection,
  SignalInput,
  SignalObject,
  StrategicSynthesis,
  ThemeLensMatrix,
  clampScore
} from "./types.js";
import { LensPerformanceStore, StrategicThesisStore, ThemeClusterStore } from "./stores.js";

const DEFAULT_MATRIX: ThemeLensMatrix = {
  technology: ["MarketStructureLens", "PolicyRiskLens", "ExecutionLens", "AdoptionLens", "CapitalFlowLens"],
  geopolitics: ["ScenarioLens", "PolicyRiskLens", "SecondOrderLens", "SupplyChainLens", "CapitalFlowLens"],
  finance: ["LiquidityLens", "BalanceSheetLens", "PolicyRiskLens", "BehavioralLens", "SecondOrderLens"],
  default: ["ExecutionLens", "PolicyRiskLens", "SecondOrderLens", "AdoptionLens", "ScenarioLens"]
};

export class SignalEvaluatorAgent {
  evaluate(input: SignalInput): SignalObject {
    const text = input.text.trim();
    const entities = this.entityExtraction(text);
    const theme = this.themeClassification(text);
    const relevance = clampScore(Math.round(Math.min(100, 30 + text.length / 8 + entities.length * 4)), 0, 100);
    const intensity = clampScore(Math.round(Math.min(100, (text.match(/!|风险|危机|突破|崩盘|禁令/gi)?.length ?? 0) * 12 + 25)), 0, 100);

    return {
      signal_id: crypto.createHash("sha256").update(`${input.sourceType}:${text}`).digest("hex").slice(0, 16),
      theme,
      relevance_score: relevance,
      intensity_score: intensity,
      entities,
      summary: this.normalizeText(text).slice(0, 280),
      source_type: input.sourceType,
      timestamp: input.timestamp ?? new Date().toISOString()
    };
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  private entityExtraction(text: string): string[] {
    const tokens = text.match(/[A-Z][A-Za-z0-9_-]{2,}|[\u4e00-\u9fa5]{2,6}/g) ?? [];
    return Array.from(new Set(tokens)).slice(0, 12);
  }

  private themeClassification(text: string): string {
    const lower = text.toLowerCase();
    if (/(ai|模型|芯片|software|cloud|open source|agent)/i.test(lower)) return "technology";
    if (/(央行|利率|通胀|债券|流动性|估值|市场)/i.test(lower)) return "finance";
    if (/(制裁|选举|地缘|外交|冲突|关税)/i.test(lower)) return "geopolitics";
    return "default";
  }
}

export class LensSelectionAgent {
  constructor(private readonly matrix: ThemeLensMatrix = DEFAULT_MATRIX) {}

  select(
    signal: SignalObject,
    cadence: CadenceMode,
    thesisStore: StrategicThesisStore,
    lensPerformanceStore: LensPerformanceStore
  ): LensSelection {
    const candidates = this.matrix[signal.theme] ?? this.matrix.default;
    const maxLens = cadence === "daily" ? 3 : 5;
    const minLens = 3;

    const weighted = candidates
      .map((lens) => {
        const perf = lensPerformanceStore.get(lens);
        const activationPenalty = perf ? perf.activationFrequency * 0.02 : 0;
        const thesisBonus = thesisStore.get("global")?.coreTheses.some((t) => t.includes(signal.theme)) ? 0.05 : 0;
        const intensityBonus = signal.intensity_score > 60 ? 0.08 : 0;
        return { lens, score: 1 - activationPenalty + thesisBonus + intensityBonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxLens);

    const selected = weighted.map((w) => w.lens).slice(0, Math.max(minLens, Math.min(maxLens, weighted.length)));

    return {
      selected_lenses: selected,
      selection_rationale: `Theme=${signal.theme}; intensity=${signal.intensity_score}; cadence=${cadence}; selected by score ordering.`
    };
  }
}

export class LensAnalysisAgent {
  analyze(lensName: string, signal: SignalObject, _thesisStore: StrategicThesisStore): LensAnalysis {
    const baseConfidence = clampScore((signal.relevance_score + signal.intensity_score) / 200, 0.2, 0.9);
    return {
      lens_name: lensName,
      core_thesis: `${lensName} 认为该信号将重塑 ${signal.theme} 议题优先级，并影响未来决策窗口。`,
      assumptions: [
        `信号 ${signal.signal_id} 在未来两周内持续发酵。`,
        `${signal.theme} 相关行为体会产生二阶反应。`
      ],
      risk_factors: [
        "数据源可能存在样本偏差。",
        "监管/政策时点可能打断预期路径。"
      ],
      confidence: Number(baseConfidence.toFixed(3))
    };
  }
}

export class DialecticAgent {
  critique(analyses: LensAnalysis[]): DialecticCritique[] {
    if (analyses.length < 2) return [];
    return analyses.map((current, idx) => {
      const target = analyses[(idx + 1) % analyses.length];
      const adjustment = current.confidence > 0.7 ? -0.06 : -0.03;
      return {
        lens_name: current.lens_name,
        target_lens: target.lens_name,
        critique: `${target.lens_name} 的最弱假设是外部条件线性延续，系统性盲点是忽略跨主题传导速度。`,
        confidence_adjustment: adjustment
      };
    });
  }
}

export class ChiefSynthesizerAgent {
  synthesize(
    analyses: LensAnalysis[],
    critiques: DialecticCritique[],
    themeClusterStore: ThemeClusterStore,
    cadence: CadenceMode
  ): StrategicSynthesis {
    const confidence = analyses.length
      ? analyses.reduce((acc, item) => acc + item.confidence, 0) / analyses.length
      : 0;
    const trend = themeClusterStore.get("default")?.temporalTrend ?? "flat";
    const unresolvedTension = critiques.length
      ? `未解决张力：${critiques[0].lens_name} 与 ${critiques[0].target_lens} 在速度与持续性判断上仍冲突。`
      : "未解决张力：多镜头证据不足。";

    const narrativeByCadence: Record<CadenceMode, string> = {
      daily: `${unresolvedTension} 建议以日频短评跟踪。`,
      weekly: `${unresolvedTension} 建议按周追踪并保留双路径应对。`,
      monthly: `${unresolvedTension} 建议进行月度论题重估与权重再平衡。`
    };

    return {
      base_case: `基准情景：信号驱动的 ${analyses[0]?.lens_name ?? "主"} 叙事将在短周期内成为主线，趋势=${trend}。`,
      alternative_case: "替代情景：若政策或流动性约束提前触发，叙事将从扩张转向防御。",
      confidence: Number(confidence.toFixed(3)),
      key_uncertainties: [
        "关键行为体是否同步响应。",
        "跨主题外溢是否超预期。"
      ],
      monitoring_signals: [
        "政策口径变化频次",
        "资金流向与波动率共振",
        "供应链与渠道库存拐点"
      ],
      narrative_summary: narrativeByCadence[cadence]
    };
  }
}

export class EditorialGovernorAgent {
  review(synthesis: StrategicSynthesis): EditorialReviewResult {
    const errors: string[] = [];
    if (!synthesis.base_case || !synthesis.alternative_case) errors.push("missing base/alternative case");
    if (synthesis.monitoring_signals.length < 2) errors.push("monitoring signals too sparse");
    if (!/未解决张力|冲突/.test(synthesis.narrative_summary)) {
      errors.push("narrative must mention unresolved tension");
    }

    if (errors.length === 0) {
      return { passed: true, errors: [] };
    }

    const revised: StrategicSynthesis = {
      ...synthesis,
      narrative_summary: `${synthesis.narrative_summary} 未解决张力仍存在，避免形成虚假共识。`
    };
    const revisedErrors = /未解决张力|冲突/.test(revised.narrative_summary)
      ? errors.filter((e) => e !== "narrative must mention unresolved tension")
      : errors;

    return {
      passed: revisedErrors.length === 0,
      revised,
      errors: revisedErrors
    };
  }
}
