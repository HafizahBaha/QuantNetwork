import React, { useState, useMemo } from 'react';
import { NetworkData, NetworkNode, AssetData, ReportData } from '../types';
import { Download } from 'lucide-react';
import { exportAssetMetricsCsv, computeAssetMetrics } from '../utils/csvExporter';

type SortKey = 'id' | 'degree' | 'closeness' | 'peripheralityScore' | 'annualizedReturn' | 'annualizedVolatility' | 'sharpeRatio';
type SortDirection = 'asc' | 'desc';

interface CentralityViewProps {
  network: NetworkData;
  assets?: AssetData[];
  reportData?: ReportData | null;
}

export const CentralityView: React.FC<CentralityViewProps> = ({ network, assets = [], reportData = null }) => {
  const [sortKey, setSortKey] = useState<SortKey>('peripheralityScore');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Compute enriched metrics combining network centrality and financial return/volatility
  const enrichedRows = useMemo(() => {
    if (assets.length > 0) {
      return computeAssetMetrics(assets, network, reportData);
    }
    // Fallback if assets list not passed
    return network.nodes.map(n => ({
      symbol: n.id,
      role: (n.peripheralityScore >= 0.7 ? 'Periphery' : n.peripheralityScore <= 0.3 ? 'Core' : 'Intermediate') as 'Core' | 'Periphery' | 'Intermediate',
      peripheralityScore: n.peripheralityScore,
      degree: n.degree,
      closeness: n.closeness,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpeRatio: 0,
      dataPoints: 0,
    }));
  }, [network, assets, reportData]);

  const sortedRows = useMemo(() => {
    return [...enrichedRows].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      if (sortKey === 'id') {
        aVal = a.symbol;
        bVal = b.symbol;
      } else {
        aVal = a[sortKey] ?? 0;
        bVal = b[sortKey] ?? 0;
      }
      
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedRows, sortKey, sortDirection]);
  
  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };
  
  const handleExport = () => {
    exportAssetMetricsCsv({
      assets,
      networkData: network,
      reportData,
    });
  };

  const SortableHeader: React.FC<{ columnKey: SortKey, title: string, align?: 'left' | 'right' }> = ({ columnKey, title, align = 'left' }) => (
    <th 
      className={`px-4 py-3 text-${align} text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-800 transition-colors select-none`}
      onClick={() => handleSort(columnKey)}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        <span>{title}</span>
        {sortKey === columnKey ? (
          <span className="text-blue-600 font-bold">{sortDirection === 'desc' ? '▼' : '▲'}</span>
        ) : (
          <span className="text-slate-300 text-[10px]">↕</span>
        )}
      </div>
    </th>
  );

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Core':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Core</span>;
      case 'Periphery':
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Periphery</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-100 text-slate-600">Intermediate</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Asset Centrality & Network Measures</h2>
          <p className="text-sm text-slate-600 mt-1">
            Quantitative metrics describing each asset's position within the TMFG network. Higher peripherality scores indicate potential diversifiers.
          </p>
        </div>
        <button
          id="export-asset-metrics-csv-btn"
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-colors self-start sm:self-auto cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Download Asset Metrics CSV
        </button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <SortableHeader columnKey="id" title="Asset" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Role</th>
              <SortableHeader columnKey="degree" title="Degree" align="right" />
              <SortableHeader columnKey="closeness" title="Closeness" align="right" />
              <SortableHeader columnKey="peripheralityScore" title="Peripherality Score (P)" align="right" />
              {assets.length > 0 && (
                <>
                  <SortableHeader columnKey="annualizedReturn" title="Ann. Return" align="right" />
                  <SortableHeader columnKey="annualizedVolatility" title="Ann. Volatility" align="right" />
                  <SortableHeader columnKey="sharpeRatio" title="Sharpe" align="right" />
                </>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200 text-sm">
            {sortedRows.map(row => (
              <tr key={row.symbol} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-3 font-semibold text-slate-800 font-mono">{row.symbol}</td>
                <td className="px-4 py-3">{getRoleBadge(row.role)}</td>
                <td className="px-4 py-3 font-mono text-right text-slate-600">{row.degree}</td>
                <td className="px-4 py-3 font-mono text-right text-slate-600">{row.closeness.toFixed(4)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-right">
                  <span 
                    className="px-2 py-1 rounded inline-block min-w-[65px] text-center"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${Math.max(0.12, row.peripheralityScore)})`,
                      color: row.peripheralityScore > 0.6 ? '#ffffff' : '#1e3a8a'
                    }}
                  >
                    {row.peripheralityScore.toFixed(4)}
                  </span>
                </td>
                {assets.length > 0 && (
                  <>
                    <td className={`px-4 py-3 font-mono text-right ${row.annualizedReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(row.annualizedReturn * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 font-mono text-right text-slate-600">
                      {(row.annualizedVolatility * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 font-mono text-right font-medium text-slate-700">
                      {row.sharpeRatio.toFixed(3)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
