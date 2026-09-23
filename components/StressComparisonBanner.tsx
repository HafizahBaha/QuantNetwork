import React from 'react';
import { Flame, ArrowRight, RotateCcw, AlertTriangle, Layers, TrendingDown, Activity } from 'lucide-react';
import { StressTestConfig, PortfolioResult } from '../types';

interface StressComparisonBannerProps {
  stressConfig: StressTestConfig;
  baselinePortfolios?: PortfolioResult[];
  currentPortfolios?: PortfolioResult[];
  onReset: () => void;
}

export const StressComparisonBanner: React.FC<StressComparisonBannerProps> = ({
  stressConfig,
  baselinePortfolios = [],
  currentPortfolios = [],
  onReset,
}) => {
  if (!stressConfig.enabled) return null;

  // Compare best performing periphery portfolio or 1/N benchmark
  const baselineBenchmark = baselinePortfolios.find(p => p.model === '1/N (Benchmark)');
  const currentBenchmark = currentPortfolios.find(p => p.model === '1/N (Benchmark)');

  const baselinePeripheryRP = baselinePortfolios.find(p => p.universe === 'Periphery' && p.model === 'Risk Parity') ||
    baselinePortfolios.find(p => p.universe === 'Periphery');
  const currentPeripheryRP = currentPortfolios.find(p => p.universe === 'Periphery' && p.model === 'Risk Parity') ||
    currentPortfolios.find(p => p.universe === 'Periphery');

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm text-slate-800">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-500 text-white font-bold flex items-center justify-center">
            <Flame className="w-4 h-4" />
          </span>
          <div>
            <h4 className="text-sm font-bold text-amber-950 flex items-center gap-2">
              Live Stress Testing Active
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                {stressConfig.volatilityMultiplier}x Volatility • {stressConfig.correlationShock > 0 ? `+${stressConfig.correlationShock}` : stressConfig.correlationShock} Contagion
              </span>
            </h4>
            <p className="text-xs text-amber-800">
              Observing real-time TMFG graph reorganization, universe pruning, and model weight redistributions under stressed market parameters.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-amber-300 shadow-xs cursor-pointer self-start sm:self-auto"
        >
          <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
          Revert to Normal Market
        </button>
      </div>

      {/* Metric shift badges */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs">
        <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
          <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-red-500" />
            Market Volatility Shock
          </div>
          <div className="text-slate-900 font-mono font-bold text-sm">
            {stressConfig.volatilityMultiplier}x Baseline
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Targeting: <strong className="text-slate-700">{stressConfig.targetUniverse} assets</strong>
          </div>
        </div>

        <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
          <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1">
            <Layers className="w-3 h-3 text-blue-600" />
            Contagion & Correlation Shift
          </div>
          <div className="text-slate-900 font-mono font-bold text-sm">
            {stressConfig.correlationShock > 0 ? `+${(stressConfig.correlationShock * 100).toFixed(0)}%` : `${(stressConfig.correlationShock * 100).toFixed(0)}%`}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Network edges recalculated dynamically
          </div>
        </div>

        <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
          <div className="text-[11px] text-slate-500 flex items-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-amber-600" />
            Annual Drift / Return Shock
          </div>
          <div className="text-slate-900 font-mono font-bold text-sm">
            {(stressConfig.marketDriftShock * 100).toFixed(1)}% Annualized
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Tail-risk (CVaR & Max DD) reassessed
          </div>
        </div>
      </div>
    </div>
  );
};
