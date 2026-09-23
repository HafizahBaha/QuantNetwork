import React, { useState, useMemo } from 'react';
import { PortfolioResult, AssetData, Universe, StressTestConfig } from '../types';
import { calculateBacktest } from '../services/financialCalculations';
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
} from 'lucide-react';

interface BacktestViewProps {
  portfolios: PortfolioResult[];
  assets: AssetData[];
  stressConfig?: StressTestConfig;
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  portfolios,
  assets,
  stressConfig,
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

  // Run backtest calculation
  const backtestResult = useMemo(() => {
    if (!benchmarkPortfolio || !activeStrategy || assets.length === 0) {
      return null;
    }
    return calculateBacktest(benchmarkPortfolio, activeStrategy, assets, dateLabels);
  }, [benchmarkPortfolio, activeStrategy, assets, dateLabels]);

  const handleExportCsv = () => {
    if (!backtestResult) return;
    exportBacktestCsv({
      summary: backtestResult.summary,
      series: backtestResult.series,
    });
  };

  const filteredStrategies = useMemo(() => {
    if (universeFilter === 'All') return candidateStrategies;
    return candidateStrategies.filter(p => p.universe === universeFilter);
  }, [candidateStrategies, universeFilter]);

  if (!benchmarkPortfolio || !activeStrategy || !backtestResult) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200 p-8">
        <p className="text-base font-semibold text-slate-700">No Historical Backtest Data Available</p>
        <p className="text-sm text-slate-400 mt-1">
          Please upload a valid price dataset or load sample data to run full-duration backtesting.
        </p>
      </div>
    );
  }

  const { summary, series } = backtestResult;
  const isAlphaPositive = summary.alpha >= 0;
  const isReturnSuperior = summary.strategyTotalReturn >= summary.benchmarkTotalReturn;

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

  return (
    <div className="space-y-8 animate-fade-in select-none">
      {/* Top Header & Strategy Switcher Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-slate-900 text-white p-6 rounded-2xl shadow-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Full-Duration Backtest
            </span>
            {stressConfig?.enabled && (
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                <Flame className="w-3 h-3 animate-pulse" /> Stressed Data
              </span>
            )}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">
            TMFG-Optimized vs. 1/N Benchmark Performance
          </h2>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 inline" />
            <span>Range: {summary.startDateLabel} → {summary.endDateLabel}</span>
            <span>•</span>
            <span>{summary.totalPeriods} trading intervals</span>
            <span>•</span>
            <span>{assets.length} historical assets</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Export Backtest CSV</span>
          </button>
        </div>
      </div>

      {/* Model & Universe Selection Cards */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Select Strategy to Backtest Against 1/N Benchmark</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare any TMFG network-partitioned portfolio against equally weighted allocation.
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

      {/* KPI Comparison Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Return */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Return</span>
            <TrendingUp className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono ${summary.strategyTotalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {(summary.strategyTotalReturn * 100).toFixed(2)}%
            </span>
            <span className="text-xs text-slate-400 font-mono">
              vs {(summary.benchmarkTotalReturn * 100).toFixed(2)}% (1/N)
            </span>
          </div>
          <div className="mt-2 text-[11px] font-medium flex items-center gap-1 font-mono">
            {isReturnSuperior ? (
              <span className="text-emerald-600 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5 inline" /> +{((summary.strategyTotalReturn - summary.benchmarkTotalReturn) * 100).toFixed(2)}% Outperformance
              </span>
            ) : (
              <span className="text-amber-600 flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5 inline" /> {((summary.strategyTotalReturn - summary.benchmarkTotalReturn) * 100).toFixed(2)}% Underperformance
              </span>
            )}
          </div>
        </div>

        {/* Sharpe Ratio */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Sharpe Ratio</span>
            <Activity className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-blue-700">
              {summary.strategySharpeRatio.toFixed(3)}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              vs {summary.benchmarkSharpeRatio.toFixed(3)} (1/N)
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-medium">
            Spread: <span className="font-mono font-bold text-slate-700">{(summary.strategySharpeRatio - summary.benchmarkSharpeRatio >= 0 ? '+' : '')}{(summary.strategySharpeRatio - summary.benchmarkSharpeRatio).toFixed(3)}</span>
          </div>
        </div>

        {/* Annualized Volatility */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Ann. Volatility</span>
            <Percent className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-rose-600">
              {(summary.strategyAnnualizedVol * 100).toFixed(2)}%
            </span>
            <span className="text-xs text-slate-400 font-mono">
              vs {(summary.benchmarkAnnualizedVol * 100).toFixed(2)}%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-medium">
            Risk Delta: <span className="font-mono font-bold text-slate-700">{((summary.strategyAnnualizedVol - summary.benchmarkAnnualizedVol) * 100).toFixed(2)}%</span>
          </div>
        </div>

        {/* Max Drawdown */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Max Drawdown</span>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-amber-600">
              {(summary.strategyMaxDrawdown * 100).toFixed(2)}%
            </span>
            <span className="text-xs text-slate-400 font-mono">
              vs {(summary.benchmarkMaxDrawdown * 100).toFixed(2)}%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 font-medium">
            {summary.strategyMaxDrawdown < summary.benchmarkMaxDrawdown ? (
              <span className="text-emerald-600 font-medium">Lower peak-to-trough risk</span>
            ) : (
              <span className="text-amber-600 font-medium">Higher drawdown exposure</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Cumulative Return Graph */}
      <CumulativeReturnBacktestChart
        series={series}
        strategyName={activeStrategy.model}
        strategyUniverse={activeStrategy.universe}
      />

      {/* Underwater Drawdown Chart */}
      <DrawdownBacktestChart
        series={series}
        strategyName={activeStrategy.model}
      />

      {/* Detailed Quantitative Backtest Attribution Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Quantitative Risk & Benchmark Attribution</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Standard institutional backtest statistics evaluated over the complete dataset duration.
            </p>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Benchmark: 1/N Equally Weighted ({assets.length} components)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-600 uppercase text-xs">
              <tr>
                <th className="px-5 py-3.5">Statistical Metric</th>
                <th className="px-5 py-3.5 text-right text-blue-700">
                  {summary.strategyName} ({summary.strategyUniverse})
                </th>
                <th className="px-5 py-3.5 text-right text-slate-700">1/N Benchmark</th>
                <th className="px-5 py-3.5 text-right">Differential / Alpha</th>
                <th className="px-5 py-3.5">Institutional Interpretation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-xs">
              {/* Final Portfolio Value */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Final Portfolio Value ($1.00 Base)</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700">${summary.strategyFinalValue.toFixed(4)}</td>
                <td className="px-5 py-3 text-right text-slate-700">${summary.benchmarkFinalValue.toFixed(4)}</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.strategyFinalValue >= summary.benchmarkFinalValue ? 'text-emerald-600' : 'text-red-600'}`}>
                  {summary.strategyFinalValue >= summary.benchmarkFinalValue ? '+' : ''}
                  ${(summary.strategyFinalValue - summary.benchmarkFinalValue).toFixed(4)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">
                  Terminal capital accumulated over {summary.totalPeriods} periods.
                </td>
              </tr>

              {/* Total Cumulative Return */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Total Cumulative Return</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.strategyTotalReturn >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(summary.strategyTotalReturn * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.benchmarkTotalReturn * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.strategyTotalReturn >= summary.benchmarkTotalReturn ? 'text-emerald-600' : 'text-red-600'}`}>
                  {summary.strategyTotalReturn >= summary.benchmarkTotalReturn ? '+' : ''}
                  {((summary.strategyTotalReturn - summary.benchmarkTotalReturn) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">
                  Cumulative unannualized holding period growth.
                </td>
              </tr>

              {/* Annualized Return */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Annualized Expected Return</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">{(summary.strategyAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.benchmarkAnnualizedReturn * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-semibold ${summary.strategyAnnualizedReturn >= summary.benchmarkAnnualizedReturn ? 'text-emerald-600' : 'text-red-600'}`}>
                  {summary.strategyAnnualizedReturn >= summary.benchmarkAnnualizedReturn ? '+' : ''}
                  {((summary.strategyAnnualizedReturn - summary.benchmarkAnnualizedReturn) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Compound annual growth rate basis (252-day convention).</td>
              </tr>

              {/* Annualized Volatility */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Annualized Volatility (Risk σ)</td>
                <td className="px-5 py-3 text-right text-rose-600">{(summary.strategyAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.benchmarkAnnualizedVol * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-700">
                  {((summary.strategyAnnualizedVol - summary.benchmarkAnnualizedVol) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Standard deviation of returns scaled by √252.</td>
              </tr>

              {/* Sharpe Ratio */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Sharpe Ratio (Rf = 2.0%)</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700">{summary.strategySharpeRatio.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-700">{summary.benchmarkSharpeRatio.toFixed(3)}</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.strategySharpeRatio >= summary.benchmarkSharpeRatio ? 'text-emerald-600' : 'text-red-600'}`}>
                  {summary.strategySharpeRatio >= summary.benchmarkSharpeRatio ? '+' : ''}
                  {(summary.strategySharpeRatio - summary.benchmarkSharpeRatio).toFixed(3)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Efficiency per unit of total volatility.</td>
              </tr>

              {/* Maximum Drawdown */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Maximum Drawdown</td>
                <td className="px-5 py-3 text-right text-amber-600 font-semibold">{(summary.strategyMaxDrawdown * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.benchmarkMaxDrawdown * 100).toFixed(2)}%</td>
                <td className={`px-5 py-3 text-right font-semibold ${summary.strategyMaxDrawdown <= summary.benchmarkMaxDrawdown ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {((summary.strategyMaxDrawdown - summary.benchmarkMaxDrawdown) * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Worst historical peak-to-trough equity drop.</td>
              </tr>

              {/* Jensen's Alpha */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Jensen's Alpha (vs 1/N)</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.alpha >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(summary.alpha * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 text-right text-slate-400">0.00%</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.alpha >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {(summary.alpha * 100).toFixed(2)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Excess return generated above CAPM benchmark expectation.</td>
              </tr>

              {/* Portfolio Beta */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Portfolio Beta (β)</td>
                <td className="px-5 py-3 text-right font-bold text-slate-800">{summary.beta.toFixed(3)}</td>
                <td className="px-5 py-3 text-right text-slate-700">1.000</td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.beta - 1).toFixed(3)}</td>
                <td className="px-5 py-3 font-sans text-slate-500">
                  {summary.beta < 1 ? 'Defensive sensitivity (< 1.0)' : 'Aggressive market sensitivity (> 1.0)'}.
                </td>
              </tr>

              {/* Tracking Error & Information Ratio */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Tracking Error (Ann.)</td>
                <td className="px-5 py-3 text-right text-slate-800">{(summary.trackingError * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 text-right text-slate-400">0.00%</td>
                <td className="px-5 py-3 text-right text-slate-700">{(summary.trackingError * 100).toFixed(2)}%</td>
                <td className="px-5 py-3 font-sans text-slate-500">Annualized standard deviation of excess returns.</td>
              </tr>

              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Information Ratio (IR)</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.informationRatio >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {summary.informationRatio.toFixed(3)}
                </td>
                <td className="px-5 py-3 text-right text-slate-400">0.000</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.informationRatio >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                  {summary.informationRatio.toFixed(3)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">Risk-adjusted active return consistency relative to tracking error.</td>
              </tr>

              {/* Win Rate */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Period Win Rate</td>
                <td className="px-5 py-3 text-right font-bold text-blue-700">{(summary.winRate * 100).toFixed(1)}%</td>
                <td className="px-5 py-3 text-right text-slate-400">50.0%</td>
                <td className={`px-5 py-3 text-right font-bold ${summary.winRate >= 0.5 ? 'text-emerald-600' : 'text-slate-600'}`}>
                  {((summary.winRate - 0.5) * 100).toFixed(1)}%
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">
                  Percentage of single trading intervals outperforming 1/N.
                </td>
              </tr>

              {/* Up & Down Capture */}
              <tr className="hover:bg-slate-50/80">
                <td className="px-5 py-3 font-sans font-medium text-slate-900">Up / Down Market Capture</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-900">
                  {summary.upCaptureRatio.toFixed(1)}% / {summary.downCaptureRatio.toFixed(1)}%
                </td>
                <td className="px-5 py-3 text-right text-slate-400">100.0% / 100.0%</td>
                <td className="px-5 py-3 text-right font-semibold text-slate-700">
                  Ratio: {(summary.upCaptureRatio / Math.max(0.1, summary.downCaptureRatio)).toFixed(2)}
                </td>
                <td className="px-5 py-3 font-sans text-slate-500">
                  Upside market capture relative to downside market loss absorption.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
