import React from 'react';
import { CorrelationMatrix } from '../types';

interface CorrelationMatrixProps {
  matrix: CorrelationMatrix;
  symbols: string[];
}

const getColorForValue = (value: number): string => {
  if (value === 1) return 'bg-slate-300';
  const intensity = Math.abs(value);
  if (value > 0) {
    return `rgba(59, 130, 246, ${intensity})`; // blue-500
  } else {
    return `rgba(239, 68, 68, ${intensity})`; // red-500
  }
};

export const CorrelationMatrixView: React.FC<CorrelationMatrixProps> = ({ matrix, symbols }) => {
  if (!matrix || matrix.length === 0) {
    return <p>No correlation data available.</p>;
  }

  return (
    <div className="space-y-6">
        <div>
            <h2 className="text-xl font-bold text-slate-800">Asset Correlation Matrix</h2>
            <p className="text-sm text-slate-600 mt-1">Visualizing the correlation coefficients between all assets in the universe.</p>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-600">
            <span>Color Scale:</span>
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-red-500"></div>
                <span>-1.0 (Negative)</span>
            </div>
            <div className="w-20 h-4 rounded-sm bg-gradient-to-r from-red-500 via-slate-50 to-blue-500"></div>
            <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-sm bg-blue-500"></div>
                <span>+1.0 (Positive)</span>
            </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[600px] border border-slate-200 rounded-lg">
            <table className="min-w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr>
                        <th className="p-2 border-b border-r border-slate-200"></th>
                        {symbols.map(symbol => (
                        <th key={symbol} className="p-2 -rotate-45 h-20 w-8 border-b border-slate-200">
                            <span className='inline-block w-20'>{symbol}</span>
                        </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                {matrix.map((row, i) => (
                    <tr key={i}>
                    <td className="font-bold p-2 border-r border-slate-200 bg-slate-100 sticky left-0">{symbols[i]}</td>
                    {row.map((value, j) => (
                        <td
                        key={j}
                        className="text-center p-2 border-t border-slate-200"
                        style={{ backgroundColor: getColorForValue(value) }}
                        title={`Corr(${symbols[i]}, ${symbols[j]}): ${value.toFixed(3)}`}
                        >
                        </td>
                    ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    </div>
  );
};