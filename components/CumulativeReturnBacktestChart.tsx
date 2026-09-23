import React, { useState, useId } from 'react';
import { BacktestDataPoint } from '../types';

interface CumulativeReturnBacktestChartProps {
  series: BacktestDataPoint[];
  strategyName: string;
  strategyUniverse: string;
}

export const CumulativeReturnBacktestChart: React.FC<CumulativeReturnBacktestChartProps> = ({
  series,
  strategyName,
  strategyUniverse,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId();

  if (!series || series.length < 2) {
    return (
      <div className="flex items-center justify-center h-72 text-sm text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
        Insufficient time series data to render cumulative return chart
      </div>
    );
  }

  // Dimensions
  const width = 850;
  const height = 380;
  const padding = { top: 35, right: 35, bottom: 50, left: 65 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Values range
  const allValues = series.flatMap(d => [d.benchmarkValue, d.strategyValue]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  const yMargin = Math.max(0.04, (maxVal - minVal) * 0.1);
  const yMin = Math.max(0.1, Math.floor((minVal - yMargin) * 20) / 20);
  const yMax = Math.ceil((maxVal + yMargin) * 20) / 20;
  const yRange = yMax - yMin || 1;

  const totalPoints = series.length;
  const getX = (i: number) => padding.left + (i / (totalPoints - 1)) * plotWidth;
  const getY = (val: number) => padding.top + plotHeight - ((val - yMin) / yRange) * plotHeight;

  // Zero/base line $1.00 position
  const base1Y = getY(1.0);

  // Y-axis tick marks
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, i) => {
    return Number((yMin + (i * (yMax - yMin)) / tickCount).toFixed(2));
  });

  // X-axis date labels (sample 5 to 7 equidistant labels)
  const xLabelIndices = [
    0,
    Math.floor((totalPoints - 1) * 0.25),
    Math.floor((totalPoints - 1) * 0.5),
    Math.floor((totalPoints - 1) * 0.75),
    totalPoints - 1,
  ];

  // SVG Paths
  const benchmarkPoints = series.map((d, i) => `${getX(i).toFixed(1)},${getY(d.benchmarkValue).toFixed(1)}`).join(' ');
  const strategyPoints = series.map((d, i) => `${getX(i).toFixed(1)},${getY(d.strategyValue).toFixed(1)}`).join(' ');

  // Strategy area gradient fill
  const strategyAreaPath = `M ${getX(0).toFixed(1)},${(padding.top + plotHeight).toFixed(1)} L ${series
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.strategyValue).toFixed(1)}`)
    .join(' L ')} L ${getX(totalPoints - 1).toFixed(1)},${(padding.top + plotHeight).toFixed(1)} Z`;

  // Active point when hovering
  const activeIdx = hoveredIdx !== null ? hoveredIdx : totalPoints - 1;
  const activePoint = series[activeIdx] || series[totalPoints - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = (clientX - (padding.left / width) * rect.width) / ((plotWidth / width) * rect.width);
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    const idx = Math.round(clampedRatio * (totalPoints - 1));
    setHoveredIdx(idx);
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  return (
    <div className="relative w-full overflow-hidden select-none bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      {/* Header with Title and Dynamic Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Full-Duration Cumulative Return Time Series
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Normalized growth of $1.00 comparing {strategyName} ({strategyUniverse}) against the 1/N Benchmark.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 rounded-full bg-blue-600 inline-block" />
            <span className="font-semibold text-slate-800">{strategyName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 rounded-full bg-slate-400 inline-block border-t border-dashed border-slate-600" />
            <span className="text-slate-500">1/N Benchmark</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto block cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ minHeight: '340px' }}
        >
          <defs>
            <linearGradient id={`strat-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.01" />
            </linearGradient>
            <filter id={`glow-${chartId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" floodColor="#2563eb" />
            </filter>
          </defs>

          {/* Horizontal Grid lines & Y labels */}
          {yTicks.map((tick, i) => {
            const y = getY(tick);
            return (
              <g key={`ygrid-${i}`}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray={tick === 1.0 ? undefined : '3 3'}
                  strokeWidth={tick === 1.0 ? 1.5 : 1}
                />
                <text
                  x={padding.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className={`text-[11px] font-mono ${
                    tick === 1.0 ? 'fill-slate-600 font-bold' : 'fill-slate-400'
                  }`}
                >
                  ${tick.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Baseline $1.00 line marker */}
          {base1Y >= padding.top && base1Y <= padding.top + plotHeight && (
            <line
              x1={padding.left}
              y1={base1Y}
              x2={width - padding.right}
              y2={base1Y}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              opacity={0.8}
            />
          )}

          {/* Area Fill for Strategy */}
          <path d={strategyAreaPath} fill={`url(#strat-grad-${chartId})`} />

          {/* 1/N Benchmark Line (Slate dashed) */}
          <polyline
            fill="none"
            stroke="#94a3b8"
            strokeWidth={2}
            strokeDasharray="5 4"
            points={benchmarkPoints}
          />

          {/* Strategy Optimized Line (Blue bold solid) */}
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth={2.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            points={strategyPoints}
          />

          {/* Vertical Crosshair Line */}
          {hoveredIdx !== null && (
            <g>
              <line
                x1={getX(hoveredIdx)}
                y1={padding.top}
                x2={getX(hoveredIdx)}
                y2={padding.top + plotHeight}
                stroke="#64748b"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {/* Benchmark dot */}
              <circle
                cx={getX(hoveredIdx)}
                cy={getY(activePoint.benchmarkValue)}
                r={4.5}
                fill="#ffffff"
                stroke="#64748b"
                strokeWidth={2}
              />
              {/* Strategy dot */}
              <circle
                cx={getX(hoveredIdx)}
                cy={getY(activePoint.strategyValue)}
                r={6}
                fill="#ffffff"
                stroke="#2563eb"
                strokeWidth={3}
                filter={`url(#glow-${chartId})`}
              />
            </g>
          )}

          {/* End-of-series indicator dots if not hovering */}
          {hoveredIdx === null && (
            <g>
              <circle
                cx={getX(totalPoints - 1)}
                cy={getY(series[totalPoints - 1].benchmarkValue)}
                r={4}
                fill="#64748b"
              />
              <circle
                cx={getX(totalPoints - 1)}
                cy={getY(series[totalPoints - 1].strategyValue)}
                r={5.5}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={2}
                filter={`url(#glow-${chartId})`}
              />
            </g>
          )}

          {/* X Axis Time Labels */}
          {xLabelIndices.map(idx => {
            const point = series[idx];
            if (!point) return null;
            return (
              <g key={`xlabel-${idx}`}>
                <line
                  x1={getX(idx)}
                  y1={padding.top + plotHeight}
                  x2={getX(idx)}
                  y2={padding.top + plotHeight + 5}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                />
                <text
                  x={getX(idx)}
                  y={padding.top + plotHeight + 18}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {point.label}
                </text>
              </g>
            );
          })}

          {/* Y Axis Title */}
          <text
            x={-height / 2 + 10}
            y={18}
            transform="rotate(-90)"
            textAnchor="middle"
            className="text-[11px] fill-slate-500 font-semibold tracking-wide uppercase"
          >
            Growth of $1.00
          </text>
        </svg>
      </div>

      {/* Dynamic Summary Strip at Bottom */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-slate-500 font-mono">
          <span className="font-semibold text-slate-700">Period:</span>
          <span>{activePoint.label} (Step {activePoint.index} of {totalPoints - 1})</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
            <span className="text-slate-600 font-medium">{strategyName}:</span>
            <span className="font-bold text-blue-700">
              ${activePoint.strategyValue.toFixed(4)}
            </span>
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                activePoint.strategyValue >= 1
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {activePoint.strategyValue >= 1 ? '+' : ''}
              {((activePoint.strategyValue - 1) * 100).toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
            <span className="text-slate-600 font-medium">1/N Benchmark:</span>
            <span className="font-bold text-slate-700">
              ${activePoint.benchmarkValue.toFixed(4)}
            </span>
            <span
              className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                activePoint.benchmarkValue >= 1
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-700'
              }`}
            >
              {activePoint.benchmarkValue >= 1 ? '+' : ''}
              {((activePoint.benchmarkValue - 1) * 100).toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span className="text-slate-500 font-medium">Alpha Spread:</span>
            <span
              className={`font-bold ${
                activePoint.strategyValue >= activePoint.benchmarkValue
                  ? 'text-emerald-600'
                  : 'text-red-600'
              }`}
            >
              {activePoint.strategyValue >= activePoint.benchmarkValue ? '+' : ''}
              {(
                (activePoint.strategyValue - activePoint.benchmarkValue) *
                100
              ).toFixed(2)}
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
