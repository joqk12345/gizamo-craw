import { DialecticCritique, LensAnalysis, SignalObject } from "./types.js";

export interface ThemeCluster {
  theme: string;
  signalFrequency: number;
  intensityAverage: number;
  temporalTrend: "up" | "flat" | "down";
}

export interface ThesisRecord {
  thesisId: string;
  coreTheses: string[];
  confidenceHistory: number[];
  revisionLog: string[];
  contradictions: string[];
  openQuestions: string[];
}

export interface LensPerformance {
  lensName: string;
  activationFrequency: number;
  confidenceDrift: number[];
  critiquePatterns: string[];
  blindSpotRecurrence: Record<string, number>;
}

export class SignalStore {
  private readonly signals: SignalObject[] = [];

  add(signal: SignalObject): void {
    this.signals.push(signal);
  }

  all(): SignalObject[] {
    return [...this.signals];
  }
}

export class ThemeClusterStore {
  private readonly clusters = new Map<string, ThemeCluster>();
  private readonly themeSeries = new Map<string, number[]>();

  addSignal(signal: SignalObject): void {
    const series = this.themeSeries.get(signal.theme) ?? [];
    series.push(signal.intensity_score);
    this.themeSeries.set(signal.theme, series);

    const prev = this.clusters.get(signal.theme);
    const signalFrequency = (prev?.signalFrequency ?? 0) + 1;
    const intensityAverage = series.reduce((acc, v) => acc + v, 0) / series.length;
    const temporalTrend = this.computeTrend(series);

    this.clusters.set(signal.theme, {
      theme: signal.theme,
      signalFrequency,
      intensityAverage,
      temporalTrend
    });
  }

  get(theme: string): ThemeCluster | undefined {
    return this.clusters.get(theme);
  }

  all(): ThemeCluster[] {
    return Array.from(this.clusters.values());
  }

  private computeTrend(series: number[]): "up" | "flat" | "down" {
    if (series.length < 2) return "flat";
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    if (last > prev) return "up";
    if (last < prev) return "down";
    return "flat";
  }
}

export class StrategicThesisStore {
  private readonly records = new Map<string, ThesisRecord>();

  upsert(record: ThesisRecord): void {
    this.records.set(record.thesisId, record);
  }

  get(thesisId: string): ThesisRecord | undefined {
    return this.records.get(thesisId);
  }

  all(): ThesisRecord[] {
    return Array.from(this.records.values());
  }
}

export class LensPerformanceStore {
  private readonly data = new Map<string, LensPerformance>();

  recordActivation(lensName: string, confidence: number): void {
    const entry = this.data.get(lensName) ?? {
      lensName,
      activationFrequency: 0,
      confidenceDrift: [],
      critiquePatterns: [],
      blindSpotRecurrence: {}
    };
    entry.activationFrequency += 1;
    entry.confidenceDrift.push(confidence);
    this.data.set(lensName, entry);
  }

  recordCritique(critique: DialecticCritique): void {
    const entry = this.data.get(critique.lens_name);
    if (!entry) return;
    entry.critiquePatterns.push(critique.critique);
  }

  recordBlindSpot(lensName: string, blindSpot: string): void {
    const entry = this.data.get(lensName);
    if (!entry) return;
    entry.blindSpotRecurrence[blindSpot] = (entry.blindSpotRecurrence[blindSpot] ?? 0) + 1;
  }

  get(lensName: string): LensPerformance | undefined {
    return this.data.get(lensName);
  }

  all(): LensPerformance[] {
    return Array.from(this.data.values());
  }
}

export interface StrategicMemoryStores {
  signalStore: SignalStore;
  themeClusterStore: ThemeClusterStore;
  strategicThesisStore: StrategicThesisStore;
  lensPerformanceStore: LensPerformanceStore;
}

export function createStrategicMemoryStores(): StrategicMemoryStores {
  return {
    signalStore: new SignalStore(),
    themeClusterStore: new ThemeClusterStore(),
    strategicThesisStore: new StrategicThesisStore(),
    lensPerformanceStore: new LensPerformanceStore()
  };
}

export function averageLensConfidence(analyses: LensAnalysis[]): number {
  if (!analyses.length) return 0;
  return analyses.reduce((acc, v) => acc + v.confidence, 0) / analyses.length;
}
