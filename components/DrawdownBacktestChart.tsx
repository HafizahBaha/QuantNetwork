import React, { useId } from 'react';
import { BacktestDataPoint } from '../types';

interface DrawdownBacktestChartProps {
  series: BacktestDataPoint[];
  strategyName: string;
}

export const DrawdownBacktestChart: React.FC<DrawdownBacktestChartProps> = ({
  series,
  strategyName,
}) => {
  const chartId = useId();

  if (!series || series.length < 2) return null;

  const width = 850;
  const height = 180;
  const padding = { top: 20, right: 35, bottom: 35, left: 65 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxDd = Math.max(
    ...series.flatMap(d => [d.benchmarkDrawdown, d.strategyDrawdown]),
    0.05
  );
  const yMax = Math.ceil(maxDd * 20) / 20;

  const totalPoints = series.length;
  const getX = (i: number) => padding.left + (i / (totalPoints - 1)) * plotWidth;
  const getY = (dd: number) => padding.top + (dd / yMax) * plotHeight;

  // Paths
  const bPath = series.map((d, i) => `${getX(i).toFixed(1)},${getY(d.benchmarkDrawdown).toFixed(1)}`).join(' ');
  const sPath = series.map((d, i) => `${getX(i).toFixed(1)},${getY(d.strategyDrawdown).toFixed(1)}`).join(' ');

  const strategyArea = `M ${getX(0).toFixed(1)},${padding.top.toFixed(1)} L ${series
    .map((d, i) => `${getX(i).toFixed(1)},${getY(d.strategyDrawdown).toFixed(1)}`)
    .join(' L ')} L ${getX(totalPoints - 1).toFixed(1)},${padding.top.toFixed(1)} Z`;

  const yTicks = [0, yMax * 0.5, yMax];

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Underwater Drawdown Profile
        </h4>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
            <span className="w-2.5 h-1 rounded-full bg-blue-500 inline-block" /> {strategyName}
          </span>
          <span className="flex items-center gap-1.5 text-slate-500">
            <span className="w-2.5 h-1 rounded-full bg-slate-400 inline-block" /> 1/N Benchmark
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block">
        <defs>
          <linearGradient id={`dd-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* Ticks */}
        {yTicks.map((tick, i) => {
          const y = getY(tick);
          return (
            <g key={`dd-ytick-${i}`}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray="2 2"
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                className="text-[10px] fill-slate-400 font-mono"
              >
                -{(tick * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Strategy underwater shaded area */}
        <path d={strategyArea} fill={`url(#dd-grad-${chartId})`} />

        {/* Benchmark line */}
        <polyline fill="none" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 3" points={bPath} />

        {/* Strategy line */}
        <polyline fill="none" stroke="#2563eb" strokeWidth={2} points={sPath} />
      </svg>
    </div>
  );
};
