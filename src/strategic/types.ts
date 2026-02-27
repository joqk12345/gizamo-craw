export type CadenceMode = "daily" | "weekly" | "monthly";

export type ExecutionPhase = "phase1" | "phase2" | "phase3" | "phase4";

export type OrchestratorState =
  | "signal_intake"
  | "lens_selection"
  | "parallel_lens_analysis"
  | "dialectic"
  | "synthesis"
  | "editorial"
  | "publish"
  | "abort";

export interface SignalInput {
  text: string;
  sourceType: string;
  timestamp?: string;
}

export interface SignalObject {
  signal_id: string;
  theme: string;
  relevance_score: number;
  intensity_score: number;
  entities: string[];
  summary: string;
  source_type: string;
  timestamp: string;
}

export interface LensSelection {
  selected_lenses: string[];
  selection_rationale: string;
}

export interface LensAnalysis {
  lens_name: string;
  core_thesis: string;
  assumptions: string[];
  risk_factors: string[];
  confidence: number;
}

export interface DialecticCritique {
  lens_name: string;
  target_lens: string;
  critique: string;
  confidence_adjustment: number;
}

export interface StrategicSynthesis {
  base_case: string;
  alternative_case: string;
  confidence: number;
  key_uncertainties: string[];
  monitoring_signals: string[];
  narrative_summary: string;
}

export interface InsufficientSignalBrief {
  type: "insufficient_signal";
  confidence: number;
  reason: string;
  key_uncertainties: string[];
  monitoring_signals: string[];
}

export interface EditorialReviewResult {
  passed: boolean;
  revised?: StrategicSynthesis;
  errors: string[];
}

export interface OrchestrationTraceEntry {
  state: OrchestratorState;
  startedAt: string;
  finishedAt: string;
  costUnits: number;
  note: string;
}

export interface OrchestrationResult {
  state: "publish" | "abort";
  signal: SignalObject;
  selectedLenses: LensSelection;
  lensAnalyses: LensAnalysis[];
  critiques: DialecticCritique[];
  synthesis?: StrategicSynthesis;
  insufficientBrief?: InsufficientSignalBrief;
  trace: OrchestrationTraceEntry[];
}

export interface ThemeLensMatrix {
  [theme: string]: string[];
}

export function clampScore(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function validateSignalObject(signal: SignalObject): string[] {
  const errors: string[] = [];
  if (!signal.signal_id) errors.push("signal_id is required");
  if (!signal.theme) errors.push("theme is required");
  if (!Number.isInteger(signal.relevance_score) || signal.relevance_score < 0 || signal.relevance_score > 100) {
    errors.push("relevance_score must be integer 0-100");
  }
  if (!Number.isInteger(signal.intensity_score) || signal.intensity_score < 0 || signal.intensity_score > 100) {
    errors.push("intensity_score must be integer 0-100");
  }
  if (!Array.isArray(signal.entities)) errors.push("entities must be string[]");
  if (!signal.summary) errors.push("summary is required");
  if (!signal.source_type) errors.push("source_type is required");
  if (!signal.timestamp) errors.push("timestamp is required");
  return errors;
}

export function validateLensSelection(selection: LensSelection): string[] {
  const errors: string[] = [];
  if (selection.selected_lenses.length < 3 || selection.selected_lenses.length > 5) {
    errors.push("selected_lenses size must be between 3 and 5");
  }
  if (!selection.selection_rationale) errors.push("selection_rationale is required");
  return errors;
}

export function validateLensAnalysis(analysis: LensAnalysis): string[] {
  const errors: string[] = [];
  if (!analysis.lens_name) errors.push("lens_name is required");
  if (!analysis.core_thesis) errors.push("core_thesis is required");
  if (!analysis.assumptions.length) errors.push("assumptions must be non-empty");
  if (!analysis.risk_factors.length) errors.push("risk_factors must be non-empty");
  if (analysis.confidence < 0 || analysis.confidence > 1) errors.push("confidence must be 0-1");
  return errors;
}

export function validateDialecticCritique(critique: DialecticCritique): string[] {
  const errors: string[] = [];
  if (!critique.lens_name) errors.push("lens_name is required");
  if (!critique.target_lens) errors.push("target_lens is required");
  if (!critique.critique) errors.push("critique is required");
  if (critique.confidence_adjustment < -0.2 || critique.confidence_adjustment > 0.2) {
    errors.push("confidence_adjustment must be in [-0.2, 0.2]");
  }
  return errors;
}

export function validateStrategicSynthesis(synthesis: StrategicSynthesis): string[] {
  const errors: string[] = [];
  if (!synthesis.base_case) errors.push("base_case is required");
  if (!synthesis.alternative_case) errors.push("alternative_case is required");
  if (synthesis.confidence < 0 || synthesis.confidence > 1) errors.push("confidence must be 0-1");
  if (!synthesis.key_uncertainties.length) errors.push("key_uncertainties must be non-empty");
  if (!synthesis.monitoring_signals.length) errors.push("monitoring_signals must be non-empty");
  if (!synthesis.narrative_summary) errors.push("narrative_summary is required");
  return errors;
}
