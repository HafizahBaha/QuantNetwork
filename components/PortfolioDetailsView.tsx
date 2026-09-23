import React from 'react';
import { PortfolioResult, AssetData, StressTestConfig } from '../types';
import { Download, Flame } from 'lucide-react';
import { generatePortfolioWeightsMatrixCsv, generatePortfolioWeightsTidyCsv, downloadCsvFile } from '../utils/csvExporter';

interface PortfolioDetailsProps {
    portfolios: PortfolioResult[];
    assets?: AssetData[];
    stressConfig?: StressTestConfig;
}

const formatPercent = (val: number) => `${(val * 100).toFixed(2)}%`;
const formatNumber = (val: number) => val.toFixed(3);

const getUniverseClass = (universe: string) => {
    switch(universe) {
        case 'Full': return 'bg-slate-200 text-slate-800';
        case 'Core': return 'bg-red-100 text-red-800';
        case 'Periphery': return 'bg-blue-100 text-blue-800';
        default: return 'bg-gray-100 text-gray-800';
    }
};

const PortfolioCard: React.FC<{ portfolio: PortfolioResult; isStressed?: boolean }> = ({ portfolio, isStressed }) => {
    const sortedWeights = Object.entries(portfolio.weights)
        .filter(([, weight]) => weight > 0.0001)
        .sort(([, a], [, b]) => b - a);

    const handleDownloadSingle = () => {
        const rows = [
            `# Model: ${portfolio.model}`,
            `# Universe: ${portfolio.universe}`,
            `# Annualized Return: ${(portfolio.expectedReturn * 100).toFixed(2)}%`,
            `# Annualized Volatility: ${(portfolio.volatility * 100).toFixed(2)}%`,
            `# Sharpe Ratio: ${portfolio.sharpeRatio.toFixed(3)}`,
            `# Max Drawdown: ${(portfolio.maxDrawdown * 100).toFixed(2)}%`,
            `# CVaR (95%): ${(portfolio.cvar * 100).toFixed(2)}%`,
            'Asset,Weight_Decimal,Weight_Percent',
            ...sortedWeights.map(([sym, w]) => `${sym},${w.toFixed(6)},${(w * 100).toFixed(4)}%`)
        ];
        const cleanName = `${portfolio.model.replace(/[^a-zA-Z0-9]/g, '_')}_${portfolio.universe}_weights.csv`;
        downloadCsvFile(rows.join('\r\n'), cleanName);
    };

    return (
        <div className={`rounded-xl border p-6 flex flex-col space-y-4 h-full relative group transition-all ${
            isStressed ? 'bg-amber-50/40 border-amber-200 shadow-xs' : 'bg-slate-50 border-slate-200'
        }`}>
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-lg text-slate-800">{portfolio.model}</h3>
                    <span className={`inline-block mt-1 px-2.5 py-0.5 text-xs font-semibold rounded-full ${getUniverseClass(portfolio.universe)}`}>
                        {portfolio.universe} Universe
                    </span>
                </div>
                <button
                    type="button"
                    onClick={handleDownloadSingle}
                    title="Export this model's weights to CSV"
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/80 rounded-md transition-colors cursor-pointer"
                >
                    <Download className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center border-y border-slate-200 py-3 bg-white/60 rounded-lg">
                <div>
                    <p className="text-xs text-slate-500">Ann. Return</p>
                    <p className={`font-semibold text-sm ${portfolio.expectedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatPercent(portfolio.expectedReturn)}
                    </p>
                </div>
                <div>
                    <p className="text-xs text-slate-500">Ann. Volatility</p>
                    <p className="font-semibold text-sm text-red-600">{formatPercent(portfolio.volatility)}</p>
                </div>
                <div>
                    <p className="text-xs text-slate-500">Sharpe Ratio</p>
                    <p className="font-semibold text-sm text-blue-600">{formatNumber(portfolio.sharpeRatio)}</p>
                </div>
            </div>

            <div className="flex-grow flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-slate-700">Asset Allocation ({sortedWeights.length} assets)</h4>
                    <span className="text-[11px] text-slate-500">Real-time weights</span>
                </div>
                <div className="flex-grow max-h-60 overflow-y-auto border border-slate-200 rounded-md bg-white">
                    <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-100 z-10">
                            <tr>
                                <th className="text-left font-semibold p-2 border-b border-slate-200">Asset</th>
                                <th className="text-right font-semibold p-2 border-b border-slate-200">Weight</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedWeights.map(([symbol, weight]) => (
                                <tr key={symbol} className="border-t border-slate-100 hover:bg-slate-50">
                                    <td className="p-2 font-mono">{symbol}</td>
                                    <td className="p-2 font-mono text-right font-medium">{formatPercent(weight)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export const PortfolioDetailsView: React.FC<PortfolioDetailsProps> = ({
    portfolios,
    assets = [],
    stressConfig,
}) => {
    const corePortfolios = portfolios.filter(p => p.universe === 'Core');
    const peripheryPortfolios = portfolios.filter(p => p.universe === 'Periphery');
    const fullPortfolios = portfolios.filter(p => p.universe === 'Full' && p.model !== '1/N (Benchmark)');

    const handleExportAllWeights = () => {
        const allSymbols = assets.length > 0
            ? assets.map(a => a.symbol)
            : Array.from(new Set(portfolios.flatMap(p => Object.keys(p.weights))));
        
        const matrixContent = generatePortfolioWeightsMatrixCsv(portfolios, allSymbols);
        const tidyContent = generatePortfolioWeightsTidyCsv(portfolios);
        const fileDate = new Date().toISOString().slice(0, 10);

        const combined = [
            '# TMFG OPTIMIZED PORTFOLIO WEIGHTS',
            `# Export Date: ${fileDate}`,
            stressConfig?.enabled ? `# Market Stress Condition: Volatility ${stressConfig.volatilityMultiplier}x, Shock ${stressConfig.correlationShock}` : '# Market Condition: Baseline Normal',
            '\r\n# --- SECTION 1: ALLOCATION MATRIX ---',
            matrixContent,
            '\r\n# --- SECTION 2: INDIVIDUAL ALLOCATIONS (TIDY) ---',
            tidyContent
        ].join('\r\n');

        downloadCsvFile(combined, `TMFG_Portfolio_Weights_${fileDate}.csv`);
    };

    return (
        <div className="space-y-12">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        Portfolio Allocation Details
                        {stressConfig?.enabled && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                                <Flame className="w-3 h-3 text-amber-600" />
                                Stressed Allocations
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-slate-600 mt-1">A detailed breakdown of asset weights and performance, separated by universe.</p>
                </div>
                <button
                    id="export-weights-csv-btn"
                    onClick={handleExportAllWeights}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors self-start sm:self-auto cursor-pointer"
                >
                    <Download className="w-3.5 h-3.5" />
                    Download Weights CSV
                </button>
            </div>

            <section id="periphery-portfolios">
                <div className="border-b border-slate-200 pb-2 mb-6">
                    <h3 className="text-lg font-bold text-blue-700">Periphery Universe Portfolios (Diversification Focus)</h3>
                    <p className="text-xs text-slate-500 mt-1">Portfolios constructed from the most peripheral assets, evaluated for defensive properties under stress.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {peripheryPortfolios.map((p, i) => (
                        <PortfolioCard key={`periphery-${p.model}-${i}`} portfolio={p} isStressed={stressConfig?.enabled} />
                    ))}
                </div>
            </section>

            <section id="core-portfolios">
                <div className="border-b border-slate-200 pb-2 mb-6">
                    <h3 className="text-lg font-bold text-red-700">Core Universe Portfolios (Systemic / High Centrality)</h3>
                    <p className="text-xs text-slate-500 mt-1">Portfolios constructed from the most central assets, sensitive to liquidity shocks.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {corePortfolios.map((p, i) => (
                        <PortfolioCard key={`core-${p.model}-${i}`} portfolio={p} isStressed={stressConfig?.enabled} />
                    ))}
                </div>
            </section>
            
            <section id="full-portfolios">
                <div className="border-b border-slate-200 pb-2 mb-6">
                    <h3 className="text-lg font-bold text-slate-700">Full Universe Portfolios</h3>
                    <p className="text-xs text-slate-500 mt-1">Portfolios constructed from all available assets across the complete network.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                    {fullPortfolios.map((p, i) => (
                        <PortfolioCard key={`full-${p.model}-${i}`} portfolio={p} isStressed={stressConfig?.enabled} />
                    ))}
                </div>
            </section>
        </div>
    );
};
