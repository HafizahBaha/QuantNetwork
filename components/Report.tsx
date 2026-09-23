import React from 'react';
import { ReportData, PortfolioResult, AssetData, NetworkData } from '../types';
import { Download } from 'lucide-react';
import { exportPortfolioWeightsCsv, exportCompleteTMFGCsv } from '../utils/csvExporter';
import { SharpeRatioBarChart, RiskReturnScatterChart } from './ReportCharts';

interface ReportProps {
  data: ReportData;
  assets?: AssetData[];
  networkData?: NetworkData | null;
  threshold?: number;
}

const formatPercent = (val: number) => `${(val * 100).toFixed(2)}%`;
const formatNumber = (val: number) => (isNaN(val) ? '0.000' : val.toFixed(3));

export const Report: React.FC<ReportProps> = ({
  data,
  assets = [],
  networkData = null,
  threshold = 0.3,
}) => {
  const benchmark = data.portfolios.find(p => p.model === '1/N (Benchmark)');
  const otherPortfolios = data.portfolios.filter(p => p.model !== '1/N (Benchmark)');

  const peripheryPortfolios = data.portfolios.filter(p => p.universe === 'Periphery');
  const bestPeripheryPortfolio: PortfolioResult | null =
    peripheryPortfolios.length > 0
      ? peripheryPortfolios.reduce(
          (best, p) => (p.sharpeRatio > best.sharpeRatio ? p : best),
          peripheryPortfolios[0]
        )
      : null;

  const getUniverseClass = (universe: string) => {
    switch (universe) {
      case 'Full':
        return 'bg-slate-200 text-slate-800';
      case 'Core':
        return 'bg-red-100 text-red-800';
      case 'Periphery':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDownloadReportCsv = () => {
    if (networkData && assets.length > 0) {
      exportCompleteTMFGCsv({ assets, networkData, reportData: data, threshold });
    } else if (assets.length > 0) {
      exportPortfolioWeightsCsv({ assets, reportData: data });
    }
  };

  return (
    <div className="space-y-12">
      <header className="text-center border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Comparative TMFG Asset Allocation Report</h1>
        <p className="text-sm text-slate-500 mt-2">Generated on: {new Date().toLocaleString()}</p>
      </header>

      <section id="summary">
        <h2 className="text-xl font-bold text-slate-800 mb-4">1. Executive Summary</h2>
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-100 text-blue-900 text-sm leading-relaxed">
          <p className="font-semibold mb-2">🤖 AI-Generated Insights:</p>
          <p className="italic">{data.summary}</p>
        </div>
      </section>

      <section id="performance-table">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">2. Performance Comparison</h2>
            <p className="text-xs text-slate-500 mt-0.5">Summary of quantitative metrics across all constructed universes.</p>
          </div>
          <button
            type="button"
            id="download-report-csv-btn"
            onClick={handleDownloadReportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Summary CSV
          </button>
        </div>

        {benchmark && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
            <h3 className="font-bold text-md text-slate-800 mb-2">Benchmark: {benchmark.model}</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Ann. Return</p>
                <p className="font-semibold text-sm text-green-600">{formatPercent(benchmark.expectedReturn)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ann. Volatility</p>
                <p className="font-semibold text-sm text-red-600">{formatPercent(benchmark.volatility)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sharpe Ratio</p>
                <p className="font-semibold text-sm text-blue-600">{formatNumber(benchmark.sharpeRatio)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Max Drawdown</p>
                <p className="font-semibold text-sm text-amber-600">{formatPercent(benchmark.maxDrawdown)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Universe</th>
                <th className="px-4 py-3 text-right">Ann. Return</th>
                <th className="px-4 py-3 text-right">Ann. Volatility</th>
                <th className="px-4 py-3 text-right">Sharpe Ratio</th>
                <th className="px-4 py-3 text-right">Max Drawdown</th>
                <th className="px-4 py-3 text-right">CVaR (95%)</th>
              </tr>
            </thead>
            <tbody>
              {otherPortfolios.map((p, i) => (
                <tr key={`${p.model}-${p.universe}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{p.model}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${getUniverseClass(p.universe)}`}>
                      {p.universe}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono ${p.expectedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(p.expectedReturn)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{formatPercent(p.volatility)}</td>
                  <td className="px-4 py-3 text-right font-mono font-bold text-blue-600">{formatNumber(p.sharpeRatio)}</td>
                  <td className="px-4 py-3 text-right font-mono text-amber-600">{formatPercent(p.maxDrawdown)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{formatPercent(p.cvar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="visualizations">
        <h2 className="text-xl font-bold text-slate-800 mb-6">3. Visualizations</h2>
        <div className="grid grid-cols-1 gap-10">
          {/* Sharpe Ratio Comparison BarChart */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-md font-semibold text-slate-800">Sharpe Ratio Comparison</h3>
                <p className="text-xs text-slate-500">Risk-adjusted return across models and network-partitioned universes.</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Periphery
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Core
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" /> Benchmark / Full
                </span>
              </div>
            </div>

            <SharpeRatioBarChart portfolios={data.portfolios} />
          </div>

          {/* Risk vs. Return Efficient Frontier Scatter Plot */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <div>
                <h3 className="text-md font-semibold text-slate-800">
                  Risk vs. Return Trade-off (Efficient Frontier)
                </h3>
                <p className="text-xs text-slate-500">
                  Annualized expected return versus volatility across all allocation models and network clusters.
                </p>
              </div>
              {bestPeripheryPortfolio && (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 self-start sm:self-auto">
                  Optimal Periphery: {bestPeripheryPortfolio.model} (Sharpe {bestPeripheryPortfolio.sharpeRatio.toFixed(3)})
                </span>
              )}
            </div>

            <RiskReturnScatterChart portfolios={data.portfolios} />
          </div>
        </div>
      </section>
    </div>
  );
};
