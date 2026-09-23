import { AssetData, NetworkData, PortfolioResult, ReportData, BacktestDataPoint, BacktestSummary, SplitBacktestResult } from '../types';

/**
 * Escapes a cell value for standard CSV formatting (RFC 4180).
 */
const escapeCsv = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Triggers a client-side browser file download for a CSV string.
 */
export const downloadCsvFile = (csvContent: string, filename: string): void => {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export interface AssetMetricRow {
  symbol: string;
  role: 'Core' | 'Periphery' | 'Intermediate';
  peripheralityScore: number;
  degree: number;
  closeness: number;
  annualizedReturn: number;
  annualizedVolatility: number;
  sharpeRatio: number;
  dataPoints: number;
}

/**
 * Computes individual asset return and volatility statistics alongside TMFG network centrality metrics.
 */
export const computeAssetMetrics = (
  assets: AssetData[],
  networkData: NetworkData,
  reportData?: ReportData | null
): AssetMetricRow[] => {
  const tradingDays = 252;
  const riskFreeRate = 0.02;

  // Identify core and periphery symbols from portfolios if available
  const coreSymbols = new Set<string>();
  const peripherySymbols = new Set<string>();

  if (reportData) {
    const corePortfolio = reportData.portfolios.find(p => p.universe === 'Core');
    if (corePortfolio) {
      Object.keys(corePortfolio.weights).forEach(s => coreSymbols.add(s));
    }
    const peripheryPortfolio = reportData.portfolios.find(p => p.universe === 'Periphery');
    if (peripheryPortfolio) {
      Object.keys(peripheryPortfolio.weights).forEach(s => peripherySymbols.add(s));
    }
  }

  // Map nodes by id for quick lookup
  const nodeMap = new Map(networkData.nodes.map(n => [n.id, n]));

  return assets.map(asset => {
    const node = nodeMap.get(asset.symbol);
    const returns = asset.returns || [];
    
    // Mean & Volatility calculation
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const sqDiff = returns.map(r => Math.pow(r - meanReturn, 2));
    const stdDev = returns.length > 0 ? Math.sqrt(sqDiff.reduce((a, b) => a + b, 0) / returns.length) : 0;

    const annualizedReturn = meanReturn * tradingDays;
    const annualizedVolatility = stdDev * Math.sqrt(tradingDays);
    const sharpeRatio = annualizedVolatility > 0 ? (annualizedReturn - riskFreeRate) / annualizedVolatility : 0;

    // Role classification
    let role: 'Core' | 'Periphery' | 'Intermediate' = 'Intermediate';
    if (coreSymbols.has(asset.symbol)) {
      role = 'Core';
    } else if (peripherySymbols.has(asset.symbol)) {
      role = 'Periphery';
    } else if (node) {
      if (node.peripheralityScore >= 0.7) role = 'Periphery';
      else if (node.peripheralityScore <= 0.3) role = 'Core';
    }

    return {
      symbol: asset.symbol,
      role,
      peripheralityScore: node?.peripheralityScore ?? 0,
      degree: node?.degree ?? 0,
      closeness: node?.closeness ?? 0,
      annualizedReturn,
      annualizedVolatility,
      sharpeRatio,
      dataPoints: asset.prices.length,
    };
  });
};

/**
 * Builds the CSV string for Optimized Portfolio Weights in wide matrix format.
 */
export const generatePortfolioWeightsMatrixCsv = (
  portfolios: PortfolioResult[],
  allSymbols: string[]
): string => {
  const lines: string[] = [];

  // Header row
  const headers = [
    'Model',
    'Universe',
    'Annualized Return (%)',
    'Annualized Volatility (%)',
    'Sharpe Ratio',
    'Max Drawdown (%)',
    'CVaR 95% (%)',
    'Allocated Assets Count',
    ...allSymbols.map(s => `Weight_${s}_(%)`),
  ];
  lines.push(headers.map(escapeCsv).join(','));

  // Data rows
  portfolios.forEach(p => {
    const allocatedCount = Object.values(p.weights).filter(w => w > 0.0001).length;
    const row = [
      p.model,
      p.universe,
      (p.expectedReturn * 100).toFixed(4),
      (p.volatility * 100).toFixed(4),
      p.sharpeRatio.toFixed(4),
      (p.maxDrawdown * 100).toFixed(4),
      (p.cvar * 100).toFixed(4),
      allocatedCount,
      ...allSymbols.map(s => {
        const w = p.weights[s] ?? 0;
        return (w * 100).toFixed(4);
      }),
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  return lines.join('\r\n');
};

/**
 * Builds the CSV string for Tidy / Long-form Portfolio Asset Weights.
 */
export const generatePortfolioWeightsTidyCsv = (
  portfolios: PortfolioResult[],
  assetMetricsMap?: Map<string, AssetMetricRow>
): string => {
  const lines: string[] = [];

  const headers = [
    'Model',
    'Universe',
    'Asset Symbol',
    'Weight (Decimal)',
    'Weight (%)',
    'Asset Network Role',
    'Portfolio Sharpe Ratio',
    'Portfolio Return (%)',
    'Portfolio Volatility (%)',
  ];
  lines.push(headers.map(escapeCsv).join(','));

  portfolios.forEach(p => {
    // Sort weights descending
    const sorted = Object.entries(p.weights)
      .filter(([, w]) => w > 0.00001)
      .sort(([, a], [, b]) => b - a);

    sorted.forEach(([symbol, weight]) => {
      const metric = assetMetricsMap?.get(symbol);
      const row = [
        p.model,
        p.universe,
        symbol,
        weight.toFixed(6),
        (weight * 100).toFixed(4),
        metric?.role || 'Unknown',
        p.sharpeRatio.toFixed(4),
        (p.expectedReturn * 100).toFixed(4),
        (p.volatility * 100).toFixed(4),
      ];
      lines.push(row.map(escapeCsv).join(','));
    });
  });

  return lines.join('\r\n');
};

/**
 * Builds the CSV string for TMFG Asset Network Centrality & Risk Metrics.
 */
export const generateAssetMetricsCsv = (metricRows: AssetMetricRow[]): string => {
  const lines: string[] = [];

  const headers = [
    'Asset Symbol',
    'Network Role',
    'Peripherality Score (P)',
    'Network Degree',
    'Closeness Centrality',
    'Annualized Return (%)',
    'Annualized Volatility (%)',
    'Sharpe Ratio',
    'Historical Price Observations',
  ];
  lines.push(headers.map(escapeCsv).join(','));

  metricRows.forEach(row => {
    const line = [
      row.symbol,
      row.role,
      row.peripheralityScore.toFixed(4),
      row.degree,
      row.closeness.toFixed(4),
      (row.annualizedReturn * 100).toFixed(4),
      (row.annualizedVolatility * 100).toFixed(4),
      row.sharpeRatio.toFixed(4),
      row.dataPoints,
    ];
    lines.push(line.map(escapeCsv).join(','));
  });

  return lines.join('\r\n');
};

/**
 * Exports a combined full TMFG analysis CSV with both Optimized Portfolio Weights
 * and TMFG Asset Centrality Metrics.
 */
export const exportCompleteTMFGCsv = ({
  assets,
  networkData,
  reportData,
  threshold,
}: {
  assets: AssetData[];
  networkData: NetworkData;
  reportData: ReportData;
  threshold: number;
}): void => {
  const symbols = assets.map(a => a.symbol);
  const metricRows = computeAssetMetrics(assets, networkData, reportData);
  const metricsMap = new Map(metricRows.map(m => [m.symbol, m]));

  const timestamp = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  const fileDate = new Date().toISOString().slice(0, 10);

  const sections: string[] = [];

  // Metadata Header
  sections.push([
    '# TMFG QUANTITATIVE INVESTMENT ANALYSIS EXPORT',
    `# Export Date: ${timestamp}`,
    `# Correlation Threshold: ${threshold.toFixed(2)}`,
    `# Total Assets: ${assets.length}`,
    `# Core Universe Assets: ${reportData.coreAssets}`,
    `# Periphery Universe Assets: ${reportData.peripheralAssets}`,
  ].join('\r\n'));

  // Section 1: Portfolio Performance & Allocation Matrix
  sections.push('\r\n# --- SECTION 1: OPTIMIZED PORTFOLIO WEIGHTS & PERFORMANCE METRICS MATRIX ---');
  sections.push(generatePortfolioWeightsMatrixCsv(reportData.portfolios, symbols));

  // Section 2: Detailed Asset Weights (Tidy Format)
  sections.push('\r\n# --- SECTION 2: PORTFOLIO ASSET WEIGHTS BREAKDOWN (TIDY FORMAT) ---');
  sections.push(generatePortfolioWeightsTidyCsv(reportData.portfolios, metricsMap));

  // Section 3: TMFG Asset Network Centrality & Risk Metrics
  sections.push('\r\n# --- SECTION 3: TMFG ASSET NETWORK CENTRALITY & RISK METRICS ---');
  sections.push(generateAssetMetricsCsv(metricRows));

  const csvContent = sections.join('\r\n');
  downloadCsvFile(csvContent, `TMFG_Full_Analysis_${fileDate}.csv`);
};

/**
 * Exports specifically the Optimized Portfolio Weights CSV.
 */
export const exportPortfolioWeightsCsv = ({
  assets,
  reportData,
}: {
  assets: AssetData[];
  reportData: ReportData;
}): void => {
  const symbols = assets.map(a => a.symbol);
  const metricRows = computeAssetMetrics(assets, { nodes: [], edges: [] }, reportData);
  const metricsMap = new Map(metricRows.map(m => [m.symbol, m]));
  const fileDate = new Date().toISOString().slice(0, 10);

  const sections: string[] = [
    '# TMFG OPTIMIZED PORTFOLIO WEIGHTS EXPORT',
    `# Export Date: ${new Date().toISOString().slice(0, 10)}`,
    '\r\n# --- MATRIX FORMAT: PORTFOLIO WEIGHTS & PERFORMANCE ---',
    generatePortfolioWeightsMatrixCsv(reportData.portfolios, symbols),
    '\r\n# --- TIDY FORMAT: INDIVIDUAL ASSET ALLOCATIONS ---',
    generatePortfolioWeightsTidyCsv(reportData.portfolios, metricsMap),
  ];

  downloadCsvFile(sections.join('\r\n'), `TMFG_Portfolio_Weights_${fileDate}.csv`);
};

/**
 * Exports specifically the TMFG Asset Metrics & Centrality CSV.
 */
export const exportAssetMetricsCsv = ({
  assets,
  networkData,
  reportData,
}: {
  assets: AssetData[];
  networkData: NetworkData;
  reportData?: ReportData | null;
}): void => {
  const metricRows = computeAssetMetrics(assets, networkData, reportData);
  const fileDate = new Date().toISOString().slice(0, 10);

  const sections: string[] = [
    '# TMFG ASSET NETWORK CENTRALITY & RISK METRICS EXPORT',
    `# Export Date: ${new Date().toISOString().slice(0, 10)}`,
    generateAssetMetricsCsv(metricRows),
  ];

  downloadCsvFile(sections.join('\r\n'), `TMFG_Asset_Metrics_${fileDate}.csv`);
};

/**
 * Exports historical backtest results and cumulative return series to CSV.
 * Supports optional 80/20 In-Sample vs. Out-of-Sample quantitative breakdown.
 */
export const exportBacktestCsv = ({
  summary,
  series,
  splitResult,
}: {
  summary: BacktestSummary;
  series: BacktestDataPoint[];
  splitResult?: SplitBacktestResult | null;
}): void => {
  const fileDate = new Date().toISOString().slice(0, 10);
  const cleanStrategyName = `${summary.strategyName.replace(/[^a-zA-Z0-9]/g, '_')}_${summary.strategyUniverse}`;

  const summaryRows = [
    '# HISTORICAL FULL DURATION & 80/20 WALK-FORWARD BACKTEST REPORT',
    `# Export Date: ${new Date().toISOString().slice(0, 10)}`,
    `# Strategy Model: ${summary.strategyName}`,
    `# Strategy Universe: ${summary.strategyUniverse}`,
    `# Benchmark: 1/N (Equally Weighted Benchmark)`,
    `# Total Periods: ${summary.totalPeriods}`,
    `# Date Range: ${summary.startDateLabel} to ${summary.endDateLabel}`,
  ];

  if (splitResult) {
    summaryRows.push(
      `# 80/20 Split Point: Period ${splitResult.splitIndex} (${splitResult.splitDateLabel})`,
      `# In-Sample Periods (80% Train): ${splitResult.inSampleCount}`,
      `# Out-of-Sample Periods (20% Test): ${splitResult.outOfSampleCount}`,
      `# Calibration Type: ${splitResult.recalibratedOnInSample ? 'Strict 80% In-Sample Optimization' : 'Full-Sample Portfolio Weights'}`,
      `# Overfitting Risk Verdict: ${splitResult.robustness.overfittingRisk}`,
      `# Sharpe Decay Ratio (OOS/IS): ${(splitResult.robustness.sharpeDecayRatio * 100).toFixed(2)}%`,
      `# Robustness Message: ${splitResult.robustness.verdictMessage}`,
      '',
      '# --- 80/20 IN-SAMPLE vs OUT-OF-SAMPLE COMPARATIVE ATTRIBUTION ---',
      'Metric,In-Sample (80% Train),Out-of-Sample (20% Test),Full Duration (100%),1/N Benchmark (OOS)',
      `Total Return,${(splitResult.inSample.summary.strategyTotalReturn * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.strategyTotalReturn * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.strategyTotalReturn * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.benchmarkTotalReturn * 100).toFixed(4)}%`,
      `Annualized Return,${(splitResult.inSample.summary.strategyAnnualizedReturn * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.strategyAnnualizedReturn * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.strategyAnnualizedReturn * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.benchmarkAnnualizedReturn * 100).toFixed(4)}%`,
      `Annualized Volatility,${(splitResult.inSample.summary.strategyAnnualizedVol * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.strategyAnnualizedVol * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.strategyAnnualizedVol * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.benchmarkAnnualizedVol * 100).toFixed(4)}%`,
      `Sharpe Ratio (Rf=2%),${splitResult.inSample.summary.strategySharpeRatio.toFixed(4)},${splitResult.outOfSample.summary.strategySharpeRatio.toFixed(4)},${splitResult.fullDuration.summary.strategySharpeRatio.toFixed(4)},${splitResult.outOfSample.summary.benchmarkSharpeRatio.toFixed(4)}`,
      `Max Drawdown,${(splitResult.inSample.summary.strategyMaxDrawdown * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.strategyMaxDrawdown * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.strategyMaxDrawdown * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.benchmarkMaxDrawdown * 100).toFixed(4)}%`,
      `Jensen Alpha (Ann.),${(splitResult.inSample.summary.alpha * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.alpha * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.alpha * 100).toFixed(4)}%,N/A`,
      `Beta (vs Benchmark),${splitResult.inSample.summary.beta.toFixed(4)},${splitResult.outOfSample.summary.beta.toFixed(4)},${splitResult.fullDuration.summary.beta.toFixed(4)},1.0000`,
      `Tracking Error (Ann.),${(splitResult.inSample.summary.trackingError * 100).toFixed(4)}%,${(splitResult.outOfSample.summary.trackingError * 100).toFixed(4)}%,${(splitResult.fullDuration.summary.trackingError * 100).toFixed(4)}%,N/A`,
      `Information Ratio,${splitResult.inSample.summary.informationRatio.toFixed(4)},${splitResult.outOfSample.summary.informationRatio.toFixed(4)},${splitResult.fullDuration.summary.informationRatio.toFixed(4)},N/A`,
      `Win Rate (% periods beating BM),${(splitResult.inSample.summary.winRate * 100).toFixed(2)}%,${(splitResult.outOfSample.summary.winRate * 100).toFixed(2)}%,${(splitResult.fullDuration.summary.winRate * 100).toFixed(2)}%,N/A`
    );
  }

  summaryRows.push(
    '',
    '# --- OVERALL PERFORMANCE & RISK SUMMARY ---',
    'Metric,Strategy,Benchmark,Difference / Alpha',
    `Total Return,${(summary.strategyTotalReturn * 100).toFixed(4)}%,${(summary.benchmarkTotalReturn * 100).toFixed(4)}%,${((summary.strategyTotalReturn - summary.benchmarkTotalReturn) * 100).toFixed(4)}%`,
    `Annualized Return,${(summary.strategyAnnualizedReturn * 100).toFixed(4)}%,${(summary.benchmarkAnnualizedReturn * 100).toFixed(4)}%,${((summary.strategyAnnualizedReturn - summary.benchmarkAnnualizedReturn) * 100).toFixed(4)}%`,
    `Annualized Volatility,${(summary.strategyAnnualizedVol * 100).toFixed(4)}%,${(summary.benchmarkAnnualizedVol * 100).toFixed(4)}%,${((summary.strategyAnnualizedVol - summary.benchmarkAnnualizedVol) * 100).toFixed(4)}%`,
    `Sharpe Ratio (Rf=2%),${summary.strategySharpeRatio.toFixed(4)},${summary.benchmarkSharpeRatio.toFixed(4)},${(summary.strategySharpeRatio - summary.benchmarkSharpeRatio).toFixed(4)}`,
    `Max Drawdown,${(summary.strategyMaxDrawdown * 100).toFixed(4)}%,${(summary.benchmarkMaxDrawdown * 100).toFixed(4)}%,${((summary.strategyMaxDrawdown - summary.benchmarkMaxDrawdown) * 100).toFixed(4)}%`,
    `Jensen Alpha (Ann.),${(summary.alpha * 100).toFixed(4)}%,N/A,N/A`,
    `Beta (vs Benchmark),${summary.beta.toFixed(4)},1.0000,N/A`,
    `Tracking Error (Ann.),${(summary.trackingError * 100).toFixed(4)}%,N/A,N/A`,
    `Information Ratio,${summary.informationRatio.toFixed(4)},N/A,N/A`,
    `Win Rate (% periods beating BM),${(summary.winRate * 100).toFixed(2)}%,N/A,N/A`,
    `Up Market Capture Ratio,${summary.upCaptureRatio.toFixed(2)}%,100.00%,N/A`,
    `Down Market Capture Ratio,${summary.downCaptureRatio.toFixed(2)}%,100.00%,N/A`,
    '',
    '# --- HISTORICAL CUMULATIVE RETURN TIME SERIES ---',
    'Index,Period_Label,Sample_Type,Strategy_Value,Benchmark_Value,Strategy_Return,Benchmark_Return,Strategy_Drawdown,Benchmark_Drawdown',
    ...series.map(d =>
      [
        d.index,
        escapeCsv(d.label),
        d.sampleType === 'out-of-sample' ? 'OUT_OF_SAMPLE' : 'IN_SAMPLE',
        d.strategyValue.toFixed(6),
        d.benchmarkValue.toFixed(6),
        d.strategyReturn.toFixed(6),
        d.benchmarkReturn.toFixed(6),
        (d.strategyDrawdown * 100).toFixed(4) + '%',
        (d.benchmarkDrawdown * 100).toFixed(4) + '%',
      ].join(',')
    )
  );

  downloadCsvFile(summaryRows.join('\r\n'), `TMFG_Backtest_${cleanStrategyName}_80_20_WalkForward_${fileDate}.csv`);
};

