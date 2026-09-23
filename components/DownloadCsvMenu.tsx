import React, { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileSpreadsheet, Layers, Network, Check, LineChart } from 'lucide-react';
import { AssetData, NetworkData, ReportData } from '../types';
import {
  exportCompleteTMFGCsv,
  exportPortfolioWeightsCsv,
  exportAssetMetricsCsv,
  exportBacktestCsv,
} from '../utils/csvExporter';
import { calculateBacktest, calculate8020SplitBacktest } from '../services/financialCalculations';

interface DownloadCsvMenuProps {
  assets: AssetData[];
  networkData: NetworkData | null;
  reportData: ReportData | null;
  threshold: number;
  disabled?: boolean;
  variant?: 'header' | 'inline';
}

export const DownloadCsvMenu: React.FC<DownloadCsvMenuProps> = ({
  assets,
  networkData,
  reportData,
  threshold,
  disabled = false,
  variant = 'header',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleDownload = (type: 'complete' | 'weights' | 'metrics' | 'backtest') => {
    if (!reportData || assets.length === 0) return;

    if (type === 'complete') {
      if (!networkData) return;
      exportCompleteTMFGCsv({ assets, networkData, reportData, threshold });
      setDownloadSuccess('Complete CSV Downloaded');
    } else if (type === 'weights') {
      exportPortfolioWeightsCsv({ assets, reportData });
      setDownloadSuccess('Weights CSV Downloaded');
    } else if (type === 'metrics') {
      if (!networkData) return;
      exportAssetMetricsCsv({ assets, networkData, reportData });
      setDownloadSuccess('Asset Metrics CSV Downloaded');
    } else if (type === 'backtest') {
      const benchmark = reportData.portfolios.find(p => p.model === '1/N (Benchmark)') || reportData.portfolios[0];
      const peripheryPortfolios = reportData.portfolios.filter(p => p.universe === 'Periphery');
      const strategy = peripheryPortfolios.length > 0
        ? peripheryPortfolios.reduce((best, p) => p.sharpeRatio > best.sharpeRatio ? p : best, peripheryPortfolios[0])
        : reportData.portfolios.find(p => p.model !== '1/N (Benchmark)') || reportData.portfolios[0];

      const dateLabels = assets[0]?.dateLabels || [];
      const splitRes = calculate8020SplitBacktest(benchmark, strategy, assets, dateLabels, false, threshold);
      exportBacktestCsv({
        summary: splitRes.fullDuration.summary,
        series: splitRes.fullDuration.series,
        splitResult: splitRes,
      });
      setDownloadSuccess('80/20 Backtest CSV Downloaded');
    }

    setTimeout(() => {
      setDownloadSuccess(null);
      setIsOpen(false);
    }, 1200);
  };

  const isDataReady = Boolean(reportData && networkData && assets.length > 0);

  if (variant === 'inline') {
    return (
      <div className="relative inline-block text-left" ref={menuRef} id="download-csv-inline-container">
        <button
          type="button"
          id="download-csv-inline-button"
          disabled={disabled || !isDataReady}
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {downloadSuccess ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-600 animate-bounce" />
              <span className="text-green-700 font-medium">{downloadSuccess}</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </>
          )}
        </button>

        {isOpen && (
          <div
            id="download-csv-inline-dropdown"
            className="absolute right-0 mt-2 w-72 origin-top-right rounded-xl bg-white shadow-xl ring-1 ring-black/5 border border-slate-200 z-50 p-1.5 animate-fade-in text-slate-800"
          >
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-900">Export TMFG Data (CSV)</p>
              <p className="text-[11px] text-slate-500">Spreadsheet-compatible data format</p>
            </div>

            <div className="py-1">
              <button
                type="button"
                id="btn-download-complete-inline"
                onClick={() => handleDownload('complete')}
                className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-100 flex items-start gap-2.5 transition-colors group"
              >
                <FileSpreadsheet className="w-4 h-4 text-blue-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                    Complete TMFG Analysis
                    <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded font-medium">Recommended</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Optimized weights, centrality scores & return/risk metrics</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-download-weights-inline"
                onClick={() => handleDownload('weights')}
                className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-100 flex items-start gap-2.5 transition-colors group"
              >
                <Layers className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-semibold text-slate-800">Portfolio Weights Only</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Matrix & tidy tables across Full, Core, and Periphery universes</div>
                </div>
              </button>

              <button
                type="button"
                id="btn-download-metrics-inline"
                onClick={() => handleDownload('metrics')}
                className="w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-slate-100 flex items-start gap-2.5 transition-colors group"
              >
                <Network className="w-4 h-4 text-purple-600 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-semibold text-slate-800">Asset Centrality & Metrics</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Peripherality score, degree, closeness, volatility & Sharpe</div>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Header variant
  return (
    <div className="relative inline-block text-left" ref={menuRef} id="download-csv-header-container">
      <button
        type="button"
        id="download-csv-header-button"
        disabled={disabled || !isDataReady}
        onClick={() => setIsOpen(!isOpen)}
        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-lg font-semibold transition-colors shadow-md flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloadSuccess ? (
          <>
            <Check className="w-3.5 h-3.5 text-white animate-bounce" />
            <span>{downloadSuccess}</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </>
        )}
      </button>

      {isOpen && (
        <div
          id="download-csv-header-dropdown"
          className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 text-white animate-fade-in"
        >
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              Export TMFG Analysis to CSV
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Choose export format for optimized weights and asset metrics</p>
          </div>

          <div className="py-1.5 space-y-1">
            <button
              type="button"
              id="btn-download-complete"
              onClick={() => handleDownload('complete')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-start gap-3 transition-colors group cursor-pointer"
            >
              <div className="p-1.5 rounded-md bg-emerald-500/20 text-emerald-400 shrink-0 mt-0.5 group-hover:bg-emerald-500/30">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-100 flex items-center justify-between">
                  <span>Complete TMFG Package</span>
                  <span className="bg-emerald-900/80 text-emerald-300 border border-emerald-700 text-[10px] px-1.5 py-0.5 rounded font-medium">All Data</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Both optimized portfolio weights & asset centrality measures with full metadata</div>
              </div>
            </button>

            <button
              type="button"
              id="btn-download-weights"
              onClick={() => handleDownload('weights')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-start gap-3 transition-colors group cursor-pointer"
            >
              <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-400 shrink-0 mt-0.5 group-hover:bg-blue-500/30">
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-100">Optimized Portfolio Weights</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Allocation weights matrix (wide) & tidy breakdown for 1/N, Mean-Var, Risk Parity, CVaR</div>
              </div>
            </button>

            <button
              type="button"
              id="btn-download-metrics"
              onClick={() => handleDownload('metrics')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-start gap-3 transition-colors group cursor-pointer"
            >
              <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-400 shrink-0 mt-0.5 group-hover:bg-purple-500/30">
                <Network className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-100">TMFG Asset Metrics</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Network degree, closeness centrality, peripherality score (P), annualized return & volatility</div>
              </div>
            </button>

            <button
              type="button"
              id="btn-download-backtest"
              onClick={() => handleDownload('backtest')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-xs hover:bg-slate-800 flex items-start gap-3 transition-colors group cursor-pointer"
            >
              <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 group-hover:bg-amber-500/30">
                <LineChart className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-slate-100">Historical Backtest Series</div>
                <div className="text-[11px] text-slate-400 mt-0.5">Full-duration cumulative return curve, underwater drawdown, Alpha & Beta vs 1/N</div>
              </div>
            </button>
          </div>

          <div className="mt-1 pt-2 border-t border-slate-800 px-3 py-1 flex items-center justify-between text-[10px] text-slate-500">
            <span>Threshold: {threshold.toFixed(2)}</span>
            <span>{assets.length} Assets Analyzed</span>
          </div>
        </div>
      )}
    </div>
  );
};
