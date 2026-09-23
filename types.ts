export interface AssetData {
  symbol: string;
  prices: number[];
  returns: number[];
  dateLabels?: string[];
}

export interface NetworkNode {
  id: string;
  degree: number;
  closeness: number;
  betweenness: number;
  peripheralityScore: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

export type Universe = 'Full' | 'Core' | 'Periphery';

export interface PortfolioResult {
  model: string;
  universe: Universe;
  weights: Record<string, number>;
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  cvar: number;
  cumulativeReturns: { date: number, value: number }[];
}

export interface ReportData {
  summary: string;
  portfolios: PortfolioResult[];
  totalAssets: number;
  coreAssets: number;
  peripheralAssets: number;
}

export type CorrelationMatrix = number[][];

export interface StressTestConfig {
  enabled: boolean;
  volatilityMultiplier: number;
  correlationShock: number;
  marketDriftShock: number;
  targetUniverse: 'All' | 'Core' | 'Periphery';
  selectedPresetId?: string;
}

export interface StressTestPreset {
  id: string;
  name: string;
  description: string;
  volatilityMultiplier: number;
  correlationShock: number;
  marketDriftShock: number;
  targetUniverse: 'All' | 'Core' | 'Periphery';
}

export interface BacktestDataPoint {
  index: number;
  label: string;
  benchmarkValue: number;
  strategyValue: number;
  benchmarkReturn: number;
  strategyReturn: number;
  benchmarkDrawdown: number;
  strategyDrawdown: number;
}

export interface BacktestSummary {
  strategyName: string;
  strategyUniverse: Universe;
  totalPeriods: number;
  startDateLabel: string;
  endDateLabel: string;
  benchmarkFinalValue: number;
  strategyFinalValue: number;
  benchmarkTotalReturn: number;
  strategyTotalReturn: number;
  benchmarkAnnualizedReturn: number;
  strategyAnnualizedReturn: number;
  benchmarkAnnualizedVol: number;
  strategyAnnualizedVol: number;
  benchmarkSharpeRatio: number;
  strategySharpeRatio: number;
  benchmarkMaxDrawdown: number;
  strategyMaxDrawdown: number;
  alpha: number;
  beta: number;
  trackingError: number;
  informationRatio: number;
  winRate: number;
  upCaptureRatio: number;
  downCaptureRatio: number;
}

