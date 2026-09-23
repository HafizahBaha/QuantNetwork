import React, { useState, useMemo } from 'react';
import { PortfolioResult, AssetData, Universe, StressTestConfig, SampleSplitMode } from '../types';
import { calculate8020SplitBacktest } from '../services/financialCalculations';
import { CumulativeReturnBacktestChart } from './CumulativeReturnBacktestChart';
import { DrawdownBacktestChart } from './DrawdownBacktestChart';
import { exportBacktestCsv } from '../utils/csvExporter';
import {
  Download,
  TrendingUp,
  ShieldAlert,
  Percent,
  Activity,
  Flame,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Split,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
  Clock,
  Target,
  SlidersHorizontal,
} from 'lucide-react';

interface BacktestViewProps {
  portfolios: PortfolioResult[];
  assets: AssetData[];
  stressConfig?: StressTestConfig;
  correlationThreshold?: number;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  portfolios,
  assets,
  stressConfig,
  correlationThreshold = 0.5,
}) => {
  // Benchmark portfolio is 1/N
  const benchmarkPortfolio = useMemo(() => {
    return (
      portfolios.find(p => p.model === '1/N (Benchmark)') ||
      portfolios.find(p => p.model.toLowerCase().includes('benchmark')) ||
      portfolios[0]
    );
  }, [portfolios]);

  // Non-benchmark strategies
  const candidateStrategies = useMemo(() => {
    return portfolios.filter(p => p.model !== '1/N (Benchmark)');
  }, [portfolios]);

  // Default to the highest Sharpe Periphery portfolio or highest Sharpe overall
  const defaultStrategy = useMemo(() => {
    const periphery = candidateStrategies.filter(p => p.universe === 'Periphery');
    if (periphery.length > 0) {
      return periphery.reduce((best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best), periphery[0]);
    }
    return candidateStrategies[0] || portfolios[0];
  }, [candidateStrategies, portfolios]);

  // Selected strategy state (model + universe key)
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    return defaultStrategy ? `${defaultStrategy.model}__${defaultStrategy.universe}` : '';
  });

  const [universeFilter, setUniverseFilter] = useState<'All' | Universe>('All');

  // 80/20 Test Modes: 'combined' | 'in-sample' | 'out-of-sample' | 'full'
  const [splitMode, setSplitMode] = useState<SampleSplitMode>('combined');

  // Re-calibrate on in-sample strictly (zero lookahead) vs full dataset weights
  const [recalibrateOnInSample, setRecalibrateOnInSample] = useState<boolean>(true);

  // Active strategy
  const activeStrategy = useMemo(() => {
    if (!selectedKey) return defaultStrategy;
    const [model, universe] = selectedKey.split('__');
    const match = candidateStrategies.find(p => p.model === model && p.universe === universe);
    return match || defaultStrategy;
  }, [selectedKey, candidateStrategies, defaultStrategy]);

  // Date labels
  const dateLabels = useMemo(() => {
    if (assets.length > 0 && assets[0].dateLabels && assets[0].dateLabels.length > 0) {
      return assets[0].dateLabels;
    }
    const len = assets[0]?.returns?.length || 0;
    return Array.from({ length: len + 1 }, (_, i) => (i === 0 ? 'Start' : `T+${i}`));
  }, [assets]);

  // Run 80/20 In-Sample vs. Out-of-Sample Split Backtest Engine
  const splitResult = useMemo(() => {
    if (!benchmarkPortfolio || !activeStrategy || assets.length === 0) {
      return null;
    }
    return calculate8020SplitBacktest(
      benchmarkPortfolio,
      activeStrategy,
      assets,
      dateLabels,
      recalibrateOnInSample,
      correlationThreshold,
      stressConfig
    );
  }, [benchmarkPortfolio, activeStrategy, assets, dateLabels, recalibrateOnInSample, correlationThreshold, stressConfig]);

  // Filtered candidate list
  const filteredStrategies = useMemo(() => {
    if (universeFilter === 'All') return candidateStrategies;
    return candidateStrategies.filter(p => p.universe === universeFilter);
  }, [candidateStrategies, universeFilter]);

  if (!benchmarkPortfolio || !activeStrategy || !splitResult) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
        <p className="text-base font-semibold text-slate-700">No Historical Backtest Data Available</p>
        <p className="text-sm text-slate-400 mt-1">
          Please upload a valid price dataset or load sample data to run 80/20 in-sample and out-of-sample backtesting.
        </p>
      </div>
    );
  }

  // Active series and summary for the selected split display mode
  const currentActiveSeries =
    splitMode === 'in-sample'
      ? splitResult.inSample.series
      : splitMode === 'out-of-sample'
      ? splitResult.outOfSample.series
      : splitResult.fullDuration.series;

  const currentActiveSummary =
    splitMode === 'in-sample'
      ? splitResult.inSample.summary
      : splitMode === 'out-of-sample'
      ? splitResult.outOfSample.summary
      : splitResult.fullDuration.summary;

  const handleExportCsv = () => {
    exportBacktestCsv({
      summary: currentActiveSummary,
      series: currentActiveSeries,
      splitResult,
    });
  };

  const getUniverseBadge = (u: Universe) => {
    switch (u) {
      case 'Periphery':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Core':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'Full':
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getRiskBadge = (risk: 'Low' | 'Moderate' | 'High') => {
    switch (risk) {
      case 'Low':
        return {
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: ShieldCheck,
          text: 'Low Overfitting Risk (Robust)',
        };
      case 'Moderate':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: AlertTriangle,
          text: 'Moderate Degradation',
        };
      case 'High':
      default:
        return {
          bg: 'bg-rose-50 text-rose-800 border-rose-200',
          icon: ShieldAlert,
          text: 'High Overfitting Alert',
        };
    }
  };

  const riskBadgeInfo = getRiskBadge(splitResult.robustness.overfittingRisk);
  const RiskIcon = riskBadgeInfo.icon;

  const isOosAlphaPositive = splitResult.outOfSample.summary.alpha >= 0;
  const isOosReturnSuperior =
    splitResult.outOfSample.summary.strategyTotalReturn >=
    splitResult.outOfSample.summary.benchmarkTotalReturn;

  return (
    <div className="space-y-8 animate-fade-in select-none">
      {/* Top Header & Strategy Switcher Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-md">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30">
              <Split className="w-3 h-3 text-blue-400" /> 80/20 Rule Backtest
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
              Train: {splitResult.inSampleCount} periods (80%) ┆ Test: {splitResult.outOfSampleCount} periods (20%)
            </span>
            {stressConfig?.enabled && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                <Flame className="w-3 h-3 animate-pulse" /> Stressed Data
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            In-Sample & Out-of-Sample Walk-Forward Backtesting
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <Calendar className="w-3.5 h-3.5 inline text-slate-400" />
            <span>Range: {splitResult.fullDuration.summary.startDateLabel} → {splitResult.fullDuration.summary.endDateLabel}</span>
            <span>•</span>
            <span>Split Point: {splitResult.splitDateLabel} (Period {splitResult.splitIndex})</span>
            <span>•</span>
            <span>{assets.length} Assets</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export 80/20 Backtest CSV</span>
          </button>
        </div>
      </div>

      {/* 80/20 Split Mode Controls & Calibration Settings */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">80/20 Sample Period & Walk-Forward Settings</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Inspect model performance across training (first 80%) vs. unseen out-of-sample forward testing (last 20%).
            </p>
          </div>

          {/* Segmented Period Tabs */}
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'combined', label: 'Walk-Forward (80/20 Split)' },
                { id: 'in-sample', label: 'In-Sample (80% Train)' },
                { id: 'out-of-sample', label: 'Out-of-Sample (20% Test)' },
                { id: 'full', label: 'Full Duration (100%)' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSplitMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  splitMode === tab.id
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calibration Methodology Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100/60 text-blue-700 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">
                Optimization Calibration Methodology
              </p>
              <p className="text-[11px] text-slate-500">
                {recalibrateOnInSample
                  ? 'Strict In-Sample Training: TMFG network topology and portfolio weights are calculated exclusively on the first 80% of returns to eliminate lookahead bias.'
                  : 'Full-Dataset Weights: Current weights optimized across all periods are decomposed into in-sample and out-of-sample intervals.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setRecalibrateOnInSample(!recalibrateOnInSample)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                recalibrateOnInSample ? 'bg-blue-600' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={recalibrateOnInSample}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  recalibrateOnInSample ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-slate-700">
              {recalibrateOnInSample ? 'Strict 80% Train' : 'Full-Sample Weights'}
            </span>
          </div>
        </div>
      </div>

      {/* Model & Universe Selection Cards */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Select Strategy to Test Against 1/N Benchmark</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select any TMFG network-partitioned portfolio to evaluate walk-forward robustness.
            </p>
          </div>

          {/* Universe Filter Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
            {(['All', 'Periphery', 'Core', 'Full'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setUniverseFilter(tab)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  universeFilter === tab
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy Badges Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredStrategies.map(p => {
            const key = `${p.model}__${p.universe}`;
            const isSelected = selectedKey === key || (!selectedKey && p === defaultStrategy);

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedKey(key)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100/80 border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-bold text-xs truncate ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                      {p.model}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border ${getUniverseBadge(p.universe)}`}>
                      {p.universe}
                    </span>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-slate-200/60 font-mono text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Sharpe</span>
                    <span className="font-bold text-blue-700">{p.sharpeRatio.toFixed(3)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block font-sans">Ann. Return</span>
                    <span className={p.expectedReturn >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {(p.expectedReturn * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 80/20 Side-by-Side Comparison Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: In-Sample (80% Train) */}
        <div className={`p-4 rounded-xl border shadow-xs transition-all ${
          splitMode === 'in-sample' ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-400/20' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">In-Sample (80% Train)</span>
            </div>
            <Clock className="w-4 h-4 text-blue-600" />
          </div>
          <div className="space-y-2 font-mono mt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Sharpe Ratio</span>
              <span className="text-base font-bold text-blue-700">
                {splitResult.inSample.summary.strategySharpeRatio.toFixed(3)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Total Return</span>
              <span className={`font-semibold ${splitResult.inSample.summary.strategyTotalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(splitResult.inSample.summary.strategyTotalReturn * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Annualized Vol</span>
              <span className="text-rose-600 font-semibold">
                {(splitResult.inSample.summary.strategyAnnualizedVol * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Max Drawdown</span>
              <span className="text-amber-600 font-semibold">
                {(splitResult.inSample.summary.strategyMaxDrawdown * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-sans">
            Calibrated on {splitResult.inSampleCount} chronological trading periods.
          </div>
        </div>

        {/* Card 2: Out-of-Sample (20% Test) */}
        <div className={`p-4 rounded-xl border shadow-xs transition-all ${
          splitMode === 'out-of-sample' ? 'bg-amber-50/60 border-amber-400 ring-2 ring-amber-400/20' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Out-of-Sample (20% Test)</span>
            </div>
            <Target className="w-4 h-4 text-amber-600" />
          </div>
          <div className="space-y-2 font-mono mt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Forward Sharpe</span>
              <span className="text-base font-bold text-amber-700">
                {splitResult.outOfSample.summary.strategySharpeRatio.toFixed(3)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Forward Return</span>
              <span className={`font-semibold ${splitResult.outOfSample.summary.strategyTotalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {(splitResult.outOfSample.summary.strategyTotalReturn * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Forward Vol</span>
              <span className="text-rose-600 font-semibold">
                {(splitResult.outOfSample.summary.strategyAnnualizedVol * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Forward Max DD</span>
              <span className="text-amber-600 font-semibold">
                {(splitResult.outOfSample.summary.strategyMaxDrawdown * 100).toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-sans">
            Evaluated on {splitResult.outOfSampleCount} unseen walk-forward periods.
          </div>
        </div>

        {/* Card 3: Out-of-Sample Alpha vs 1/N Benchmark */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">OOS Alpha vs. 1/N</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="space-y-2 font-mono mt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">Jensen's Alpha</span>
              <span className={`text-base font-bold ${isOosAlphaPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                {isOosAlphaPositive ? '+' : ''}{(splitResult.outOfSample.summary.alpha * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">OOS Return Spread</span>
              <span className={`font-semibold ${isOosReturnSuperior ? 'text-emerald-600' : 'text-red-600'}`}>
                {isOosReturnSuperior ? '+' : ''}
                {(
                  (splitResult.outOfSample.summary.strategyTotalReturn -
                    splitResult.outOfSample.summary.benchmarkTotalReturn) *
                  100
                ).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">OOS Benchmark Return</span>
              <span className="text-slate-700 font-semibold">
                {(splitResult.outOfSample.summary.benchmarkTotalReturn * 100).toFixed(2)}%
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-slate-500 font-sans">OOS Win Rate</span>
              <span className="text-blue-700 font-semibold">
                {(splitResult.outOfSample.summary.winRate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-sans">
            Benchmark: 1/N Equally Weighted over the 20% test period.
          </div>
        </div>

        {/* Card 4: Robustness & Overfitting Audit */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-400 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Generalization Audit</span>
              <RiskIcon className="w-4 h-4 text-blue-600" />
            </div>

            <div className="mt-2.5">
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500 font-sans">Sharpe Retention (OOS / IS)</span>
                <span className="text-lg font-bold text-slate-900">
                  {(splitResult.robustness.sharpeDecayRatio * 100).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    splitResult.robustness.overfittingRisk === 'Low'
                      ? 'bg-emerald-500'
                      : splitResult.robustness.overfittingRisk === 'Moderate'
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, splitResult.robustness.sharpeDecayRatio * 100))}%` }}
                />
              </div>
            </div>

            <div className="mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${riskBadgeInfo.bg}`}>
                <RiskIcon className="w-3.5 h-3.5" />
                {riskBadgeInfo.text}
              </span>
            </div>
          </div>

          <p className="mt-3 pt-2.5 border-t border-slate-100 text-[11px] text-slate-500 leading-snug">
            {splitResult.robustness.verdictMessage}
          </p>
        </div>
      </div>

      {/* Main Cumulative Return Graph with 80/20 Demarcation */}
      <CumulativeReturnBacktestChart
        series={currentActiveSeries}
        strategyName={activeStrategy.model}
        strategyUniverse={activeStrategy.universe}
        splitIndex={splitResult.splitIndex}
        splitDateLabel={splitResult.splitDateLabel}
        activeSplitMode={splitMode}
      />

      {/* Underwater Drawdown Chart with 80/20 Split */}
      <DrawdownBacktestChart
        series={currentActiveSeries}
        strategyName={activeStrategy.model}
        splitIndex={splitResult.splitIndex}
        activeSplitMode={splitMode}
      />

      {/* Comprehensive 80/20 Comparative Quantitative Attribution Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              80/20 Walk-Forward Quantitative Attribution Matrix
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive statistical performance comparison across Training (80%), Testing (20%), and Full duration.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Calibration: {recalibrateOnInSample ? 'Strict 80% In-Sample Train' : 'Full-Sample Weights'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="px-5 py-3.5">Statistical Metric</th>
                <th className="px-5 py-3.5 text-right text-blue-700">
                  In-Sample (80% Train)
                </th>
                <th className="px-5 py-3.5 text-right text-amber-700">
                  Out-of-Sample (20% Test)
                </th>
                <th className="px-5 py-3.5 text-right text-slate-900">
                  Full Period (100%)
                </th>
                <th className="px-5 py-3.5 text-right text-slate-600">
                  1/N Benchmark (OOS)
                </th>
                <th className="px-5 py-3.5 text-right">
                  OOS Alpha Spread
                </th>
                <th className="px-5 py-3.5">Analytical Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-xs">
              {/* Terminal Value */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Terminal Capital ($1.00 base)</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700">${splitResult.inSample.summary.strategyFinalValue.toFixed(4)}</td>
                <td className="px-5 py-3 text-right font-bold text-amber-700">${splitResult.outOfSample.summary.strategyFinalValue.toFixed(4)}</td>
                <td className="px-5 py-3 text-right font-bold text-slate-900">${splitResult.fullDuration.summary.strategyFinalValue.toFixed(4)}</td>
                <td className="px-5 py-3 text-right text-slate-600">${splitResult.outOfSample.summary.benchmarkFinalValue.toFixed(4)}</td>
                <td className={`px-5 py-3 text-right font-bold ${splitResult.outOfSample.summary.strategyFinalValue >= splitResult.outOfSample.summary.benchmarkFinalValue ? 'text-emerald-600' : 'text-red-600'}`}>
                  {splitResult.outOfSample.summary.strategyFinalValue >= splitResult.outOfSample.summary.benchmarkFinalValue ? '+' : ''}
                  ${(splitResult.outOfSample.summary.strategyFinalValue - splitResult.outOfSample.summary.benchmarkFinalValue).toFixed(4)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Compounded growth over each chronological partition.</td>
              </tr>

              {/* Total Cumulative Return */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Total Return</td>
                <td className="px-5 py-3 text-right font-semibold text-blue-700">{(splitResult.inSample.summary.strategyTotalReturn * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-semibold ${splitResult.outOfSample.summary.strategyTotalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(splitResult.outOfSample.summary.strategyTotalReturn * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.strategyTotalReturn * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-600">{(splitResult.outOfSample.summary.benchmarkTotalReturn * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-bold ${isOosReturnSuperior ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isOosReturnSuperior ? '+' : ''}
                  {(
                    (splitResult.outOfSample.summary.strategyTotalReturn -
                      splitResult.outOfSample.summary.benchmarkTotalReturn) *
                    100
                  ).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Unannualized total capital return during the interval.</td>
              </tr>

              {/* Annualized Return */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Annualized Expected Return</td>
                <td className="px-5 py-3 text-right text-blue-700">{(splitResult.inSample.summary.strategyAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-amber-700">{(splitResult.outOfSample.summary.strategyAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.strategyAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-600">{(splitResult.outOfSample.summary.benchmarkAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-semibold ${splitResult.outOfSample.summary.strategyAnnualizedReturn >= splitResult.outOfSample.summary.benchmarkAnnualizedReturn ? 'text-emerald-600' : 'text-red-600'}`}>
                  {splitResult.outOfSample.summary.strategyAnnualizedReturn >= splitResult.outOfSample.summary.benchmarkAnnualizedReturn ? '+' : ''}
                  {((splitResult.outOfSample.summary.strategyAnnualizedReturn - splitResult.outOfSample.summary.benchmarkAnnualizedReturn) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Scaled using 252-day annualized financial convention.</td>
              </tr>

              {/* Annualized Volatility */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Annualized Volatility (σ)</td>
                <td className="px-5 py-3 text-right text-rose-600">{(splitResult.inSample.summary.strategyAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-rose-600">{(splitResult.outOfSample.summary.strategyAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.strategyAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-600">{(splitResult.outOfSample.summary.benchmarkAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-700">
                  {((splitResult.outOfSample.summary.strategyAnnualizedVol - splitResult.outOfSample.summary.benchmarkAnnualizedVol) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Realized risk standard deviation across each window.</td>
              </tr>

              {/* Sharpe Ratio */}
              <tr className="hover:bg-slate-50/80 bg-blue-50/20">
                <td className="px-5 py-3 font-sans font-bold text-slate-900">Sharpe Ratio (Rf = 2.0%)</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700">{splitResult.inSample.summary.strategySharpeRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right font-bold text-amber-700">{splitResult.outOfSample.summary.strategySharpeRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right font-bold text-slate-900">{splitResult.fullDuration.summary.strategySharpeRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-600">{splitResult.outOfSample.summary.benchmarkSharpeRatio.toFixed(3)}</td>
                <td className={`px-5 py-3 text-right font-bold ${splitResult.outOfSample.summary.strategySharpeRatio >= splitResult.outOfSample.summary.benchmarkSharpeRatio ? 'text-emerald-600' : 'text-red-600'}`}>
                  {splitResult.outOfSample.summary.strategySharpeRatio >= splitResult.outOfSample.summary.benchmarkSharpeRatio ? '+' : ''}
                  {(splitResult.outOfSample.summary.strategySharpeRatio - splitResult.outOfSample.summary.benchmarkSharpeRatio).toFixed(3)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-700 font-medium">Risk-adjusted return per unit of volatility.</td>
              </tr>

              {/* Max Drawdown */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Maximum Drawdown</td>
                <td className="px-5 py-3 text-right text-amber-600 font-semibold">{(splitResult.inSample.summary.strategyMaxDrawdown * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-amber-600 font-semibold">{(splitResult.outOfSample.summary.strategyMaxDrawdown * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.strategyMaxDrawdown * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-600">{(splitResult.outOfSample.summary.benchmarkMaxDrawdown * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-semibold ${splitResult.outOfSample.summary.strategyMaxDrawdown <= splitResult.outOfSample.summary.benchmarkMaxDrawdown ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {((splitResult.outOfSample.summary.strategyMaxDrawdown - splitResult.outOfSample.summary.benchmarkMaxDrawdown) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Deepest peak-to-trough equity drop.</td>
              </tr>

              {/* Jensen's Alpha */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Jensen's Alpha (Ann.)</td>
                <td className="px-5 py-3 text-right text-blue-700">{(splitResult.inSample.summary.alpha * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-bold ${isOosAlphaPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isOosAlphaPositive ? '+' : ''}{(splitResult.outOfSample.summary.alpha * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.alpha * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-400">N/A</td>
                <td className={`px-5 py-3 text-right font-bold ${isOosAlphaPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isOosAlphaPositive ? '+' : ''}{(splitResult.outOfSample.summary.alpha * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Excess return independent of market beta.</td>
              </tr>

              {/* Beta */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Beta (vs 1/N Benchmark)</td>
                <td className="px-5 py-3 text-right text-slate-800">{splitResult.inSample.summary.beta.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-800">{splitResult.outOfSample.summary.beta.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-900">{splitResult.fullDuration.summary.beta.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-600">1.000</td>
                <td className="px-5 py-3 text-right text-slate-700">{(splitResult.outOfSample.summary.beta - 1.0).toFixed(3)}</td>
                <td className="px-5 py-3 font-sans text-slate-500">Systematic co-movement elasticity against equal-weight market.</td>
              </tr>

              {/* Information Ratio */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Information Ratio</td>
                <td className="px-5 py-3 text-right text-blue-700">{splitResult.inSample.summary.informationRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-amber-700">{splitResult.outOfSample.summary.informationRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-900">{splitResult.fullDuration.summary.informationRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-400">N/A</td>
                <td className="px-5 py-3 text-right text-slate-700">{splitResult.outOfSample.summary.informationRatio.toFixed(3)}</td>
                <td className="px-5 py-3 font-sans text-slate-500">Active excess return per unit of tracking error.</td>
              </tr>

              {/* Win Rate */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Period Win Rate (% beating 1/N)</td>
                <td className="px-5 py-3 text-right text-blue-700">{(splitResult.inSample.summary.winRate * 100).toFixed(1)}%</td>
                <td className="px-5 py-3 text-right font-bold text-amber-700">{(splitResult.outOfSample.summary.winRate * 100).toFixed(1)}%</td>
                <td className="px-5 py-3 text-right text-slate-900">{(splitResult.fullDuration.summary.winRate * 100).toFixed(1)}%</td>
                <td className="px-5 py-3 text-right text-slate-400">N/A</td>
                <td className="px-5 py-3 text-right text-slate-700">{(splitResult.outOfSample.summary.winRate * 100).toFixed(1)}%</td>
                <td className="px-5 py-3 font-sans text-slate-500">Percentage of periods generating positive active alpha.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
