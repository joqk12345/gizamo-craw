import {
  CadenceMode,
  DialecticCritique,
  ExecutionPhase,
  InsufficientSignalBrief,
  LensAnalysis,
  OrchestrationResult,
  OrchestratorState,
  SignalInput,
  StrategicSynthesis,
  clampScore,
  validateDialecticCritique,
  validateLensAnalysis,
  validateLensSelection,
  validateSignalObject,
  validateStrategicSynthesis
} from "./types.js";
import { averageLensConfidence, createStrategicMemoryStores, StrategicMemoryStores } from "./stores.js";
import {
  ChiefSynthesizerAgent,
  DialecticAgent,
  EditorialGovernorAgent,
  LensAnalysisAgent,
  LensSelectionAgent,
  SignalEvaluatorAgent
} from "./agents.js";

export interface StrategicOrchestratorConfig {
  cadence: CadenceMode;
  phase?: ExecutionPhase;
  insufficientSignalThreshold?: number;
}

export class StrategicResearchOrchestrator {
  private readonly signalEvaluator = new SignalEvaluatorAgent();
  private readonly lensSelection = new LensSelectionAgent();
  private readonly lensAnalysis = new LensAnalysisAgent();
  private readonly dialectic = new DialecticAgent();
  private readonly synthesizer = new ChiefSynthesizerAgent();
  private readonly editorial = new EditorialGovernorAgent();
  private readonly stores: StrategicMemoryStores;

  constructor(private readonly config: StrategicOrchestratorConfig, stores?: StrategicMemoryStores) {
    this.stores = stores ?? createStrategicMemoryStores();
  }

  async run(input: SignalInput): Promise<OrchestrationResult> {
    const trace: OrchestrationResult["trace"] = [];

    const signal = this.withTrace(trace, "signal_intake", () => {
      const evaluated = this.signalEvaluator.evaluate(input);
      this.validateOrThrow(validateSignalObject(evaluated), "signal_intake");
      this.stores.signalStore.add(evaluated);
      this.stores.themeClusterStore.addSignal(evaluated);
      return evaluated;
    });

    const selectedLenses = this.withTrace(trace, "lens_selection", () => {
      const selection = this.lensSelection.select(
        signal,
        this.config.cadence,
        this.stores.strategicThesisStore,
        this.stores.lensPerformanceStore
      );
      this.validateOrThrow(validateLensSelection(selection), "lens_selection");
      return selection;
    });

    const analyses = this.withTrace(trace, "parallel_lens_analysis", () => {
      const results = selectedLenses.selected_lenses.map((lensName) => {
        const analysis = this.lensAnalysis.analyze(lensName, signal, this.stores.strategicThesisStore);
        this.validateOrThrow(validateLensAnalysis(analysis), "parallel_lens_analysis");
        this.stores.lensPerformanceStore.recordActivation(lensName, analysis.confidence);
        return analysis;
      });
      return results;
    });

    if (this.config.phase === "phase1") {
      return {
        state: "publish",
        signal,
        selectedLenses,
        lensAnalyses: analyses,
        critiques: [],
        synthesis: this.stubSynthesis(analyses),
        trace
      };
    }

    const critiques = this.withTrace(trace, "dialectic", () => this.runDialectic(analyses));
    const adjusted = this.applyCritiques(analyses, critiques);

    const aggregateConfidence = averageLensConfidence(adjusted);
    if (aggregateConfidence < (this.config.insufficientSignalThreshold ?? 0.4)) {
      const insufficientBrief: InsufficientSignalBrief = {
        type: "insufficient_signal",
        confidence: Number(aggregateConfidence.toFixed(3)),
        reason: "Aggregate lens confidence below threshold",
        key_uncertainties: ["Signal continuity uncertain", "Cross-lens corroboration is weak"],
        monitoring_signals: ["Signal recurrence frequency", "Independent source confirmation"]
      };
      return {
        state: "publish",
        signal,
        selectedLenses,
        lensAnalyses: adjusted,
        critiques,
        insufficientBrief,
        trace
      };
    }

    const synthesis = this.withTrace(trace, "synthesis", () => {
      const draft = this.synthesizer.synthesize(adjusted, critiques, this.stores.themeClusterStore, this.config.cadence);
      this.validateOrThrow(validateStrategicSynthesis(draft), "synthesis");
      return draft;
    });

    if (this.config.phase === "phase2") {
      return {
        state: "publish",
        signal,
        selectedLenses,
        lensAnalyses: adjusted,
        critiques,
        synthesis,
        trace
      };
    }

    const editorialResult = this.withTrace(trace, "editorial", () => this.editorial.review(synthesis));


    if (this.config.cadence === "monthly") {
      this.recalibrateMonthlyThesis(adjusted);
    }

    if (!editorialResult.passed) {
      if (!editorialResult.revised) {
        return {
          state: "abort",
          signal,
          selectedLenses,
          lensAnalyses: adjusted,
          critiques,
          synthesis,
          trace
        };
      }

      const revised = editorialResult.revised;
      const revisedErrors = validateStrategicSynthesis(revised);
      if (revisedErrors.length) {
        return {
          state: "abort",
          signal,
          selectedLenses,
          lensAnalyses: adjusted,
          critiques,
          synthesis: revised,
          trace
        };
      }

      return {
        state: "publish",
        signal,
        selectedLenses,
        lensAnalyses: adjusted,
        critiques,
        synthesis: revised,
        trace
      };
    }

    return {
      state: "publish",
      signal,
      selectedLenses,
      lensAnalyses: adjusted,
      critiques,
      synthesis,
      trace
    };
  }

  private runDialectic(analyses: LensAnalysis[]): DialecticCritique[] {
    const critiques = this.dialectic.critique(analyses);
    for (const critique of critiques) {
      this.validateOrThrow(validateDialecticCritique(critique), "dialectic");
      this.stores.lensPerformanceStore.recordCritique(critique);
    }
    return critiques;
  }

  private applyCritiques(analyses: LensAnalysis[], critiques: DialecticCritique[]): LensAnalysis[] {
    const adjustmentMap = new Map<string, number>();
    critiques.forEach((c) => {
      adjustmentMap.set(c.lens_name, (adjustmentMap.get(c.lens_name) ?? 0) + c.confidence_adjustment);
    });

    return analyses.map((analysis) => ({
      ...analysis,
      confidence: Number(clampScore(analysis.confidence + (adjustmentMap.get(analysis.lens_name) ?? 0), 0, 1).toFixed(3))
    }));
  }

  private stubSynthesis(analyses: LensAnalysis[]): StrategicSynthesis {
    return {
      base_case: `Stub base case from ${analyses[0]?.lens_name ?? "N/A"}`,
      alternative_case: "Stub alternative case",
      confidence: Number(averageLensConfidence(analyses).toFixed(3)),
      key_uncertainties: ["Stub uncertainty"],
      monitoring_signals: ["Stub monitoring signal"],
      narrative_summary: "Stub synthesis"
    };
  }

  private recalibrateMonthlyThesis(analyses: LensAnalysis[]): void {
    const record = this.stores.strategicThesisStore.get("global") ?? {
      thesisId: "global",
      coreTheses: [],
      confidenceHistory: [],
      revisionLog: [],
      contradictions: [],
      openQuestions: []
    };
    record.coreTheses = analyses.map((a) => a.core_thesis).slice(0, 3);
    record.confidenceHistory.push(Number(averageLensConfidence(analyses).toFixed(3)));
    record.revisionLog.push(`monthly recalibration @ ${new Date().toISOString()}`);
    this.stores.strategicThesisStore.upsert(record);
  }

  private withTrace<T>(trace: OrchestrationResult["trace"], state: OrchestratorState, fn: () => T): T {
    const started = new Date();
    const result = fn();
    const finished = new Date();
    trace.push({
      state,
      startedAt: started.toISOString(),
      finishedAt: finished.toISOString(),
      costUnits: this.estimateCostUnits(state),
      note: "ok"
    });
    return result;
  }

  private estimateCostUnits(state: OrchestratorState): number {
    const map: Record<OrchestratorState, number> = {
      signal_intake: 1,
      lens_selection: 1,
      parallel_lens_analysis: 3,
      dialectic: 2,
      synthesis: 3,
      editorial: 1,
      publish: 1,
      abort: 1
    };
    return map[state];
  }

  private validateOrThrow(errors: string[], state: OrchestratorState): void {
    if (errors.length) {
      throw new Error(`[${state}] schema validation failed: ${errors.join("; ")}`);
    }
  }
}
